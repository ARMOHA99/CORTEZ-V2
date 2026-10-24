const config = require('../../config');
const settingsService = require('./settings');
const time = require('../utils/time');
const realtime = require('../realtime');

function mongooseReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

function httpError(status, message, code = '') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function getContext() {
  const settings = await settingsService.loadAll();
  const timezone = config.system.timezone;
  const nightShift = settings['system.nightShift'] || config.system.nightShift;
  const dayStartHour = time.getDayStartHour(nightShift);
  const weekStartDay = Number(settings['system.weekStartDay'] ?? config.system.weekStartDay);
  const now = new Date();
  return {
    settings,
    timezone,
    nightShift,
    dayStartHour,
    weekStartDay,
    now,
    dateKey: time.dayKey(now, timezone, dayStartHour),
    weekKey: time.weekKeyFor(now, timezone, weekStartDay, dayStartHour)
  };
}

function openBreakMinutes(shift, now = new Date()) {
  if (!shift || !shift.breakStartedAt) return 0;
  return time.minutesBetween(shift.breakStartedAt, now);
}

function liveMinutes(shift, now = new Date()) {
  if (!shift) return 0;
  if (shift.status === 'closed') return shift.totalMinutes || 0;
  const elapsed = time.minutesBetween(shift.startAt, now);
  const breaks =
    (shift.breakMinutes || 0) +
    (shift.breaks || []).filter((item) => item.startAt && !item.endAt).reduce(
      (sum, item) => sum + time.minutesBetween(item.startAt, now),
      0
    );
  return Math.max(0, elapsed - breaks);
}

function serializeShift(shift, now = new Date()) {
  if (!shift) return null;
  const plain = shift.toJSON ? shift.toJSON() : shift;
  return {
    ...plain,
    liveMinutes: plain.status === 'closed' ? plain.totalMinutes || 0 : liveMinutes(shift, now),
    breakLiveMinutes: openBreakMinutes(shift, now),
    isActive: plain.status === 'active',
    isPaused: plain.status === 'paused'
  };
}

async function findActiveShift(userId) {
  if (!mongooseReady()) return null;
  const Shift = require('../models/Shift');
  return Shift.findOne({ user: userId, status: { $in: ['active', 'paused'] } }).sort({ startAt: -1 });
}

async function ensureNightLock(user, bypass = false) {
  if (bypass || !user) return;
  const settings = await settingsService.loadAll();
  const nightShift = settings['system.nightShift'] || config.system.nightShift;
  if (!nightShift || !nightShift.enabled || !nightShift.lock) return;
  const locked = time.inNightWindow(new Date(), config.system.timezone, nightShift);
  if (!locked) return;
  const { hasPermission } = require('./ranks');
  const { getRank } = require('./ranks');
  const rank = await getRank(user.rank);
  if (!hasPermission(user, 'duty:night', rank)) {
    throw httpError(
      403,
      `قفل الدوام الليلي مفعّل حالياً (${nightShift.start} - ${nightShift.end}). لا يمكنك تسجيل الدوام الآن.`,
      'NIGHT_LOCK'
    );
  }
}

async function startDuty(user, req = null, options = {}) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const Shift = require('../models/Shift');
  const User = require('../models/User');
  await ensureNightLock(user, options.bypassLock);

  const existing = await findActiveShift(user._id);
  if (existing) {
    return { shift: serializeShift(existing), alreadyActive: true };
  }

  const context = await getContext();
  const shift = await Shift.create({
    user: user._id,
    userDiscordId: user.discordId,
    userSnapshot: {
      name: user.displayName || user.username || '',
      rank: user.rank
    },
    kind: 'shift',
    dateKey: context.dateKey,
    weekKey: context.weekKey,
    startAt: new Date(),
    status: 'active',
    startedBy: user._id
  });

  await User.findByIdAndUpdate(user._id, {
    $set: {
      'duty.status': 'on',
      'duty.shiftId': shift._id,
      'duty.since': shift.startAt,
      lastSeen: new Date()
    }
  });

  const payload = serializeShift(shift);
  realtime.emitToUser(user._id, 'duty:update', { status: 'on', shift: payload });
  realtime.emit('duty:update', { userId: String(user._id), status: 'on', at: new Date().toISOString() });
  realtime.emit('dashboard:refresh', { reason: 'duty' });
  realtime.emit('presence:update', realtime.snapshotPresence());

  return { shift: payload, alreadyActive: false };
}

async function pauseDuty(user) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const Shift = require('../models/Shift');
  const User = require('../models/User');
  const shift = await findActiveShift(user._id);
  if (!shift) throw httpError(404, 'لا يوجد دوام نشط', 'NO_SHIFT');
  if (shift.status === 'paused') return { shift: serializeShift(shift), alreadyPaused: true };

  const now = new Date();
  shift.breaks.push({ startAt: now, endAt: null, minutes: 0 });
  shift.breakStartedAt = now;
  shift.status = 'paused';
  await shift.save();

  await User.findByIdAndUpdate(user._id, { $set: { 'duty.status': 'break' } });

  const payload = serializeShift(shift);
  realtime.emitToUser(user._id, 'duty:update', { status: 'break', shift: payload });
  realtime.emit('duty:update', { userId: String(user._id), status: 'break', at: now.toISOString() });
  realtime.emit('dashboard:refresh', { reason: 'duty' });
  return { shift: payload, alreadyPaused: false };
}

async function resumeDuty(user) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const Shift = require('../models/Shift');
  const User = require('../models/User');
  const shift = await findActiveShift(user._id);
  if (!shift) throw httpError(404, 'لا يوجد دوام نشط', 'NO_SHIFT');
  if (shift.status === 'active') return { shift: serializeShift(shift), alreadyActive: true };

  const now = new Date();
  for (const item of shift.breaks) {
    if (item.startAt && !item.endAt) {
      item.endAt = now;
      item.minutes = time.minutesBetween(item.startAt, now);
    }
  }
  shift.breakMinutes = shift.breaks.reduce((sum, item) => sum + (item.minutes || 0), 0);
  shift.breakStartedAt = null;
  shift.status = 'active';
  await shift.save();

  await User.findByIdAndUpdate(user._id, { $set: { 'duty.status': 'on' } });

  const payload = serializeShift(shift);
  realtime.emitToUser(user._id, 'duty:update', { status: 'on', shift: payload });
  realtime.emit('duty:update', { userId: String(user._id), status: 'on', at: now.toISOString() });
  realtime.emit('dashboard:refresh', { reason: 'duty' });
  return { shift: payload, alreadyActive: false };
}

async function endDuty(user, options = {}) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const Shift = require('../models/Shift');
  const User = require('../models/User');
  const shift = await findActiveShift(user._id);
  if (!shift) throw httpError(404, 'لا يوجد دوام نشط', 'NO_SHIFT');

  const now = options.endAt || new Date();
  for (const item of shift.breaks) {
    if (item.startAt && !item.endAt) {
      item.endAt = now;
      item.minutes = time.minutesBetween(item.startAt, now);
    }
  }
  shift.breakMinutes = shift.breaks.reduce((sum, item) => sum + (item.minutes || 0), 0);
  shift.breakStartedAt = null;
  shift.endAt = now;
  shift.status = 'closed';
  shift.totalMinutes = Math.max(0, time.minutesBetween(shift.startAt, now) - shift.breakMinutes);
  shift.closedAt = now;
  shift.closedBy = options.by ? options.by._id : user._id;
  if (options.note) shift.note = String(options.note).slice(0, 500);
  await shift.save();

  await User.updateOne(
    { _id: shift.user },
    {
      $set: { 'duty.status': 'off', 'duty.shiftId': null, 'duty.since': null },
      $inc: { 'stats.totalMinutes': shift.totalMinutes }
    }
  );

  const targetUserId = shift.user;
  const payload = serializeShift(shift);
  realtime.emitToUser(targetUserId, 'duty:update', { status: 'off', shift: payload });
  realtime.emit('duty:update', {
    userId: String(targetUserId),
    status: 'off',
    minutes: shift.totalMinutes,
    at: now.toISOString()
  });
  realtime.emit('dashboard:refresh', { reason: 'duty-end' });
  realtime.emit('leaderboard:refresh', { reason: 'duty' });

  return { shift: payload };
}

async function penalize(admin, targetUser, minutes, reason) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const amount = Math.abs(Math.round(Number(minutes) || 0));
  if (amount <= 0) throw httpError(400, 'عدد الساعات غير صالح', 'INVALID_MINUTES');
  const Shift = require('../models/Shift');
  const User = require('../models/User');
  const context = await getContext();
  const shift = await Shift.create({
    user: targetUser._id,
    userDiscordId: targetUser.discordId,
    userSnapshot: { name: targetUser.displayName || targetUser.username || '', rank: targetUser.rank },
    kind: 'penalty',
    dateKey: context.dateKey,
    weekKey: context.weekKey,
    startAt: context.now,
    endAt: context.now,
    status: 'closed',
    totalMinutes: -amount,
    penaltyMinutes: amount,
    note: String(reason || 'خصم إداري').slice(0, 500),
    startedBy: admin._id,
    closedBy: admin._id,
    closedAt: context.now
  });

  await User.updateOne(
    { _id: targetUser._id },
    {
      $inc: { 'stats.totalMinutes': -amount, 'stats.totalPenaltyMinutes': amount }
    }
  );

  realtime.emitToUser(targetUser._id, 'duty:penalty', { minutes: amount, reason: shift.note });
  realtime.emit('duty:update', { userId: String(targetUser._id), status: 'penalty', minutes: amount });
  realtime.emit('dashboard:refresh', { reason: 'penalty' });
  return serializeShift(shift);
}

function shiftMatchForWeek(weekKey) {
  return { kind: 'shift', weekKey, status: { $in: ['active', 'paused', 'closed'] } };
}

async function personalSummary(userId) {
  const context = await getContext();
  if (!mongooseReady()) {
    return {
      weekKey: context.weekKey,
      dateKey: context.dateKey,
      weeklyMinutes: 0,
      monthlyMinutes: 0,
      totalMinutes: 0,
      todayMinutes: 0,
      weeklyPenaltyMinutes: 0,
      shift: null,
      status: 'off',
      days: time.weekDays(context.weekKey).map((key) => ({ dateKey: key, minutes: 0 }))
    };
  }
  const Shift = require('../models/Shift');
  const weekDays = time.weekDays(context.weekKey);
  const monthPrefix = context.dateKey.slice(0, 7);
  const [weekly, monthly, total, today, penalties, active] = await Promise.all([
    Shift.aggregate([
      { $match: { user: userId, kind: 'shift', weekKey: context.weekKey } },
      { $group: { _id: null, minutes: { $sum: '$totalMinutes' }, count: { $sum: 1 } } }
    ]),
    Shift.aggregate([
      { $match: { user: userId, kind: 'shift', dateKey: { $regex: `^${monthPrefix}` } } },
      { $group: { _id: null, minutes: { $sum: '$totalMinutes' } } }
    ]),
    Shift.aggregate([
      { $match: { user: userId, kind: 'shift' } },
      { $group: { _id: null, minutes: { $sum: '$totalMinutes' } } }
    ]),
    Shift.aggregate([
      { $match: { user: userId, kind: 'shift', dateKey: context.dateKey } },
      { $group: { _id: null, minutes: { $sum: '$totalMinutes' } } }
    ]),
    Shift.aggregate([
      { $match: { user: userId, kind: 'penalty', weekKey: context.weekKey } },
      { $group: { _id: null, minutes: { $sum: '$penaltyMinutes' } } }
    ]),
    findActiveShift(userId)
  ]);

  const live = active ? liveMinutes(active) : 0;
  const weeklyMinutes = (weekly[0]?.minutes || 0) + (active ? live : 0);
  const monthlyMinutes = (monthly[0]?.minutes || 0) + (active ? live : 0);
  const totalMinutes = Math.max(0, total[0]?.minutes || 0);
  const todayMinutes = (today[0]?.minutes || 0) + (active ? live : 0);

  const dayRows = await Shift.aggregate([
    {
      $match: {
        user: userId,
        kind: 'shift',
        dateKey: { $in: weekDays }
      }
    },
    { $group: { _id: '$dateKey', minutes: { $sum: '$totalMinutes' } } }
  ]);
  const dayMap = new Map(dayRows.map((row) => [row._id, row.minutes]));

  return {
    weekKey: context.weekKey,
    weekStart: context.weekKey,
    weekEnd: weekDays[weekDays.length - 1],
    dateKey: context.dateKey,
    weeklyMinutes,
    monthlyMinutes,
    totalMinutes: Math.max(totalMinutes, 0),
    todayMinutes,
    weeklyPenaltyMinutes: penalties[0]?.minutes || 0,
    shift: serializeShift(active),
    status: active ? (active.status === 'paused' ? 'break' : 'on') : 'off',
    days: weekDays.map((key) => ({ dateKey: key, minutes: Math.max(0, dayMap.get(key) || 0) })),
    weekDays
  };
}

async function attendanceGrid(requestedWeekKey = null) {
  const context = await getContext();
  const weekKey = requestedWeekKey || context.weekKey;
  const weekDays = time.weekDays(weekKey);
  if (!mongooseReady()) {
    return { weekKey, weekDays, days: weekDays, members: [], stats: { present: 0, absent: 0 } };
  }
  const User = require('../models/User');
  const Shift = require('../models/Shift');
  const { getRanks } = require('./ranks');
  const [users, shifts, ranks] = await Promise.all([
    User.find({ blocked: false, inGuild: true, rank: { $ne: 'guest' } })
      .select('displayName username avatar rank duty')
      .sort({ rank: 1, displayName: 1 })
      .lean(),
    Shift.find({ kind: 'shift', weekKey }).select('user dateKey totalMinutes status startAt').lean(),
    getRanks()
  ]);

  const rankMap = new Map(ranks.map((rank) => [rank.key, rank]));
  const cellMap = new Map();
  for (const shift of shifts) {
    const key = String(shift.user);
    if (!cellMap.has(key)) cellMap.set(key, new Map());
    const dayMap = cellMap.get(key);
    const minutes = shift.status === 'closed' ? Math.max(0, shift.totalMinutes || 0) : liveMinutes(shift);
    dayMap.set(shift.dateKey, (dayMap.get(shift.dateKey) || 0) + minutes);
  }

  let present = 0;
  let absent = 0;
  const members = users.map((user) => {
    const dayMap = cellMap.get(String(user._id)) || new Map();
    const cells = weekDays.map((key) => {
      const minutes = dayMap.get(key) || 0;
      const isPresent = minutes > 0;
      if (isPresent) present += 1;
      else absent += 1;
      return { dateKey: key, present: isPresent, minutes };
    });
    const totalMinutes = cells.reduce((sum, cell) => sum + cell.minutes, 0);
    const rank = rankMap.get(user.rank);
    return {
      _id: user._id,
      name: user.displayName || user.username || 'عضو',
      avatar: user.avatar || '',
      rank: user.rank,
      rankName: rank ? rank.name : user.rank,
      rankColor: rank ? rank.color : '#9b9296',
      dutyStatus: user.duty ? user.duty.status : 'off',
      cells,
      totalMinutes,
      presentDays: cells.filter((cell) => cell.present).length
    };
  });

  return {
    weekKey,
    weekEnd: weekDays[6],
    weekDays,
    days: weekDays,
    members,
    stats: { present, absent, rate: present + absent ? Math.round((present / (present + absent)) * 100) : 0 }
  };
}

async function closeStaleShifts() {
  if (!mongooseReady()) return 0;
  const settings = await settingsService.loadAll();
  const maxHours = Number(settings['system.autoCloseDutyHours'] || 14);
  if (!maxHours || maxHours <= 0) return 0;
  const Shift = require('../models/Shift');
  const User = require('../models/User');
  const cutoff = new Date(Date.now() - maxHours * 60 * 60 * 1000);
  const stale = await Shift.find({ status: { $in: ['active', 'paused'] }, startAt: { $lt: cutoff } });
  let closed = 0;
  for (const shift of stale) {
    const user = await User.findById(shift.user);
    if (!user) continue;
    try {
      await endDuty(user, {
        endAt: new Date(Math.min(Date.now(), new Date(shift.startAt).getTime() + maxHours * 3600 * 1000)),
        note: 'إغلاق تلقائي — تجاوز الحد الأقصى للدوام'
      });
      closed += 1;
    } catch (error) {
      console.error('[Duty] auto close:', error.message);
    }
  }
  return closed;
}

async function activeCount() {
  if (!mongooseReady()) return 0;
  const Shift = require('../models/Shift');
  return Shift.countDocuments({ status: { $in: ['active', 'paused'] } });
}

module.exports = {
  getContext,
  startDuty,
  pauseDuty,
  resumeDuty,
  endDuty,
  penalize,
  personalSummary,
  attendanceGrid,
  findActiveShift,
  liveMinutes,
  serializeShift,
  closeStaleShifts,
  activeCount,
  ensureNightLock
};
