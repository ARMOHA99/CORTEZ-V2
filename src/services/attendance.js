/**
 * نظام الحضور والإنذارات
 * ────────────────────────
 * يحسب يوم الدوام (نافذة قابلة للضبط) ويقيّم كل عضو عند إغلاقها:
 * من حضر بالدقائق المطلوبة، ومن غاب. الغياب المتتالي يرفع وارنًا متصاعدًا،
 * والوارن يفتح نافذة تبرير، وموافقة الإدارة تلغيه وتعيد العدّاد.
 */

const config = require('../../config');
const time = require('../utils/time');
const settingsService = require('./settings');
const notifyService = require('./notify');
const audit = require('./audit');
const discord = require('./discord');
const { httpError } = require('../utils/http');

const DEFAULTS = {
  enabled: true,
  minMinutes: 30,
  absentLimit: 3,
  justifyHours: 12,
  warnDays: 7,
  dayStart: '10:00',
  closeTime: '02:00',
  notifyChannelId: '',
  warnChannelId: '',
  logChannelId: '',
  syncNight: false,
  warnRoles: ['', '', ''],
  exemptRanks: ['owner', 'operations', 'business'],
  graceDays: 0,
  notifySelf: true,
  dailySummary: true,
  dailyNotes: true,
  template: ''
};

function mongooseReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function tz() {
  return config.system.timezone || 'Africa/Algiers';
}

function num(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function brave(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function cfg() {
  let s = {};
  try {
    s = (await settingsService.getAll()) || {};
  } catch (error) {
    s = {};
  }
  const roles = Array.isArray(s['attendance.warnRoles']) ? s['attendance.warnRoles'] : DEFAULTS.warnRoles;
  const exempt = Array.isArray(s['attendance.exemptRanks']) ? s['attendance.exemptRanks'] : DEFAULTS.exemptRanks;
  const night = s['system.nightShift'] || {};
  const syncNight = s['attendance.syncNightWindow'] === true && night.enabled !== false;
  const out = {
    enabled: s['attendance.enabled'] !== false,
    minMinutes: num(s['attendance.minMinutes'], DEFAULTS.minMinutes, 0, 720),
    absentLimit: num(s['attendance.absentLimit'], DEFAULTS.absentLimit, 1, 30),
    justifyHours: num(s['attendance.justifyHours'], DEFAULTS.justifyHours, 0, 168),
    warnDays: num(s['attendance.warnDays'], DEFAULTS.warnDays, 0, 365),
    dayStart: brave(s['attendance.dayStart'], DEFAULTS.dayStart),
    closeTime: brave(s['attendance.closeTime'], DEFAULTS.closeTime),
    notifyChannelId: brave(s['attendance.notifyChannelId'], brave(s['attendance.channelId'], '')),
    warnChannelId: brave(s['attendance.warnChannelId'], ''),
    logChannelId: brave(s['attendance.logChannelId'], ''),
    syncNight: s['attendance.syncNightWindow'] === true,
    warnRoles: roles.slice(0, 5).map((role) => String(role || '').trim()),
    exemptRanks: exempt.map((rank) => String(rank || '').trim()).filter(Boolean),
    graceDays: num(s['attendance.graceDays'], DEFAULTS.graceDays, 0, 60),
    notifySelf: s['attendance.notifySelf'] !== false,
    dailySummary: s['attendance.dailySummary'] !== false,
    dailyNotes: s['attendance.dailyNotes'] !== false,
    template: typeof s['attendance.template'] === 'string' ? s['attendance.template'] : ''
  };

  /* عند اختيار المزامنة: يوم الحضور يتبع حدود نافذة الدوام الليلي نفسها */
  if (syncNight) {
    out.dayStart = night.start || out.dayStart;
    out.closeTime = night.end || out.closeTime;
  }
  return out;
}

/* ─────────── حساب اليوم والنافذة بالتوقيت المحلي ─────────── */
function offsetMs(date) {
  const p = time.zonedParts(date, tz());
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (date.getTime() - date.getMilliseconds());
}

function zonedToUtc(dateKey, minutes) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0) + minutes * 60000;
  const first = offsetMs(new Date(guess));
  const second = offsetMs(new Date(guess - first));
  return new Date(guess - second);
}

function windowFor(dateKey, c) {
  const startMin = time.parseTimeToMinutes(c.dayStart, 600);
  const closeMin = time.parseTimeToMinutes(c.closeTime, 120);
  const start = zonedToUtc(dateKey, startMin);
  const closeKey = closeMin <= startMin ? time.addDaysToKey(dateKey, 1) : dateKey;
  const end = zonedToUtc(closeKey, closeMin);
  return { start, end };
}

function dateKeyNow(now = new Date(), c) {
  const p = time.zonedParts(now, tz());
  const current = p.hour * 60 + p.minute;
  const startMin = time.parseTimeToMinutes(c.dayStart, 600);
  const key = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return current < startMin ? time.addDaysToKey(key, -1) : key;
}

/* ─────────── ديسكورد ─────────── */
async function sendChannel(channelId, payload) {
  if (!channelId) return false;
  try {
    const client = discord.getClient();
    if (discord.isReady() && client) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return false;
      await channel.send(payload);
      return true;
    }
    if (!discord.hasBot()) return false;
    await discord.rest(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: {
        content: payload.content || undefined,
        embeds: payload.embeds || undefined,
        allowed_mentions: payload.allowedMentions || { parse: ['users'] }
      }
    });
    return true;
  } catch (error) {
    console.error('[Attendance] تعذّر إرسال رسالة ديسكورد:', error.message);
    return false;
  }
}

async function sendDM(discordId, payload) {
  if (!discordId || !discord.hasBot()) return false;
  try {
    const client = discord.getClient();
    if (discord.isReady() && client) {
      const user = await client.users.fetch(discordId).catch(() => null);
      if (!user) return false;
      await user.send(payload);
      return true;
    }
    const channel = await discord.rest('/users/@me/channels', {
      method: 'POST',
      body: { recipient_id: discordId }
    });
    if (!channel || !channel.id) return false;
    await discord.rest(`/channels/${channel.id}/messages`, {
      method: 'POST',
      body: { content: payload.content || undefined, embeds: payload.embeds || undefined }
    });
    return true;
  } catch (error) {
    return false;
  }
}

/* بعد استنفاد المستويات الثلاثة: يُرفع الأمر للقيادة للنظر في حال العضو */
async function escalateToLeadership({ user, dateKey, streak, c }) {
  const mention = user.discordId ? `<@${user.discordId}>` : displayName(user);
  const embed = discord.embed(
    'استحقاق مراجعة القيادة',
    `العضو ${displayName(user)} بلغ الحد الأقصى للإنذارات (${MAX_LEVEL}) ثم غاب ${streak} أيام متتالية جديدة. القرار للقيادة: حظر، أو إعادة تأهيل، أو رفع الإنذارات.`,
    0xf59e0b,
    [
      { name: 'العضو', value: mention, inline: true },
      { name: 'الرتبة', value: user.rank || '—', inline: true },
      { name: 'الغياب بعد آخر إنذار', value: `${streak} ${streak === 1 ? 'يوم' : 'أيام'}`, inline: true },
      { name: 'اليوم', value: dateKey, inline: true }
    ]
  );
  const sent = await sendChannel(c.warnChannelId || c.notifyChannelId, { content: mention, embeds: [embed] });

  try {
    const User = require('../models/User');
    const leaders = await User.find({ rank: { $in: ['owner', 'operations'] }, blocked: false })
      .select('_id')
      .lean();
    for (const leader of leaders) {
      await notifyService
        .push(leader._id, {
          title: 'مراجعة قيادة — عضو بلغ الحد الأقصى للإنذارات',
          body: `${displayName(user)} غاب ${streak} أيام بعد اكتمال إنذاراته. يحتاج قرارًا.`,
          type: 'warning',
          link: '#/attendance'
        })
        .catch(() => null);
    }
  } catch (error) {
    /* الإشعار داخل الموقع اختياري */
  }

  try {
    await audit.log({
      action: 'attendance.escalate',
      description: `تصعيد ${displayName(user)} للقيادة بعد ${MAX_LEVEL} إنذارات و${streak} أيام غياب`,
      targetType: 'user',
      targetId: String(user._id),
      meta: { dateKey, streak }
    });
  } catch (error) {
    /* التدقيق اختياري */
  }

  return sent !== false;
}

async function applyRoles(user, level, c) {
  if (!user || !user.discordId) return '';
  const roles = c.warnRoles.filter(Boolean);
  if (!roles.length) return '';
  const target = roles[Math.min(level, roles.length) - 1];
  for (const role of roles) {
    if (role && role !== target) {
      try {
        await discord.removeRole(user.discordId, role);
      } catch (error) {
        /* الرول غير موجود أو مسحوب سلفًا */
      }
    }
  }
  if (target) {
    try {
      await discord.assignRole(user.discordId, target);
    } catch (error) {
      console.error('[Attendance] تعذّر إعطاء رول الإنذار:', error.message);
    }
  }
  return target;
}

async function stripRoles(user, c) {
  if (!user || !user.discordId) return;
  for (const role of c.warnRoles.filter(Boolean)) {
    try {
      await discord.removeRole(user.discordId, role);
    } catch (error) {
      /* تجاهل */
    }
  }
}

/* الحد الأقصى لمستويات الإنذار: بعد الثالث يُرفع الأمر للقيادة */
const MAX_LEVEL = 3;

/**
 * يحسب الغياب المتتالي المنتهي باليوم الحالي، ويتوقف عند تاريخ آخر إنذار.
 * الإنذار السابق «يصفّر» ما قبله: الغيابات التي سبقته محسوبة ومدفوعة،
 * والعدّ يبدأ من اليوم الذي يليه. هذا يمنع إصدار إنذار جديد كل يوم.
 */
function countStreak(key, previousDays, lastWarningKey) {
  let streak = 1; /* اليوم الحالي غياب */
  let expected = time.addDaysToKey(key, -1);
  for (const day of previousDays) {
    if (day.dateKey !== expected) break; /* انقطاع في السلسلة */
    if (day.status !== 'absent') break;
    if (lastWarningKey && day.dateKey <= lastWarningKey) break; /* يبدأ عدّ جديد بعد آخر إنذار */
    streak += 1;
    expected = time.addDaysToKey(expected, -1);
  }
  return streak;
}

/* ─────────── أسماء وأشكال مساعدة ─────────── */
function displayName(user) {
  return (user && (user.displayName || user.globalName || user.username)) || 'عضو';
}

function snapshot(user) {
  return {
    name: displayName(user),
    rank: user.rank || '',
    discordId: user.discordId || ''
  };
}

async function isExempt(user, c, endDate) {
  if (c.exemptRanks.includes(user.rank)) return 'exempt';
  if (user.leaveUntil && new Date(user.leaveUntil).getTime() >= endDate.getTime()) return 'leave';
  if (c.graceDays > 0) {
    const joined = user.joinedGuildAt || user.createdAt;
    if (joined) {
      const graceEnd = new Date(new Date(joined).getTime() + c.graceDays * 86400000);
      if (graceEnd.getTime() >= endDate.getTime()) return 'exempt';
    }
  }
  return '';
}

/* ─────────── تسجيل وارن ─────────── */
async function issueWarning({ user, dateKey, streak, attendanceId, c, reason }) {
  const Warning = require('../models/Warning');
  const AttendanceDay = require('../models/AttendanceDay');
  const topActive = await Warning.findOne({ user: user._id, status: 'active' }).sort({ level: -1 }).select('level').lean();
  const level = Math.min(MAX_LEVEL, (Number(topActive && topActive.level) || 0) + 1);
  const roleId = await applyRoles(user, level, c);
  const expiresAt = c.warnDays > 0 ? new Date(Date.now() + c.warnDays * 86400000) : null;
  const warning = await Warning.create({
    user: user._id,
    userSnapshot: snapshot(user),
    level,
    reason: reason || `غياب ${streak} أيام متتالية — ${dateKey}`,
    dateKey,
    status: 'active',
    expiresAt,
    attendance: attendanceId || null,
    issuedByName: 'النظام',
    roleId,
    channelId: c.warnChannelId || c.notifyChannelId
  });

  if (attendanceId) {
    await AttendanceDay.updateOne({ _id: attendanceId }, { $set: { warning: warning._id } }).catch(() => null);
  }

  const mention = user.discordId ? `<@${user.discordId}>` : displayName(user);
  const embed = discord.embed(
    `إنذار غياب — المستوى ${level}`,
    c.template || `تم تسجيل غياب متكرر بحق ${displayName(user)}. أمام العضو ${c.justifyHours} ساعة لتقديم تبرير من الموقع، وبعد موافقة الإدارة يُلغى الإنذار.`,
    0x22c55e,
    [
      { name: 'العضو', value: mention, inline: true },
      { name: 'الرتبة', value: user.rank || '—', inline: true },
      { name: 'الغياب المتتالي', value: `${streak} ${streak === 1 ? 'يوم' : 'أيام'}`, inline: true },
      { name: 'اليوم', value: dateKey, inline: true },
      { name: 'مهلة التبرير', value: `${c.justifyHours} ساعة`, inline: true },
      { name: 'ينتهي في', value: c.warnDays > 0 ? `${c.warnDays} يوم` : 'بلا نهاية', inline: true }
    ]
  );
  await sendChannel(c.warnChannelId || c.notifyChannelId, { content: mention, embeds: [embed] });

  try {
    await notifyService.push(user._id, {
      title: `إنذار غياب — المستوى ${level}`,
      body: `سُجّل غيابك يوم ${dateKey}. أمامك ${c.justifyHours} ساعة لتقديم تبرير من صفحة الحضور.`,
      type: 'warning',
      link: '#/attendance'
    });
  } catch (error) {
    /* الإشعار داخل الموقع اختياري */
  }

  if (c.notifySelf) {
    await sendDM(user.discordId, {
      content: `⚠️ وصلتك إنذار غياب (المستوى ${level}) من ${config.org.name}. سجّل تبريرك خلال ${c.justifyHours} ساعة من صفحة الحضور في الموقع.`
    });
  }

  return warning;
}

/* ─────────── تقييم يوم ─────────── */
async function evaluateDate(dateKey, { force = false } = {}) {
  if (!mongooseReady()) return { ok: false, reason: 'db' };
  const c = await cfg();
  if (!c.enabled) return { ok: false, reason: 'disabled' };

  const key = String(dateKey || dateKeyNow(new Date(), c));
  const win = windowFor(key, c);
  if (!force && Date.now() < win.end.getTime()) return { ok: false, reason: 'not-due' };

  const User = require('../models/User');
  const Shift = require('../models/Shift');
  const AttendanceDay = require('../models/AttendanceDay');
  const dutyService = require('./duty');

  const users = await User.find({ inGuild: true, blocked: false }).select('name username displayName globalName rank discordId leaveUntil joinedGuildAt createdAt').lean();
  const shifts = await Shift.find({ kind: 'shift', startAt: { $gte: win.start, $lt: win.end } })
    .select('user totalMinutes status breakMinutes breaks')
    .lean();
  const existing = await AttendanceDay.find({ dateKey: key }).lean();
  const byUser = new Map(existing.map((doc) => [String(doc.user), doc]));

  const minutesOf = new Map();
  const shiftsOf = new Map();
  for (const shift of shifts) {
    const uid = String(shift.user);
    const mins = shift.status === 'active' ? dutyService.liveMinutes(shift) : Number(shift.totalMinutes) || 0;
    minutesOf.set(uid, (minutesOf.get(uid) || 0) + Math.max(0, mins));
    if (!shiftsOf.has(uid)) shiftsOf.set(uid, []);
    shiftsOf.get(uid).push(shift._id);
  }

  const weekKey = time.weekKeyFor(win.start, tz(), Number(config.system.weekStartDay) || 0, 0);
  let created = 0;
  const absentees = [];
  const presentees = [];
  const ops = [];

  for (const user of users) {
    const uid = String(user._id);
    const current = byUser.get(uid);
    const minutes = minutesOf.get(uid) || 0;
    const exempt = await isExempt(user, c, win.end);
    let status = 'absent';
    if (exempt) status = exempt;
    else if (minutes >= c.minMinutes) status = 'present';

    if (current) {
      /* لا نلمس ما عالجه المدير أو عذرًا معتمدًا */
      if (current.source !== 'auto' || current.status === 'excused') continue;
      const patch = { minutes, status, evaluatedAt: new Date() };
      if (status === 'present' || status === 'absent' || status === 'leave' || status === 'exempt') {
        ops.push({ updateOne: { filter: { _id: current._id }, update: { $set: patch } } });
      }
      if (status === 'present') presentees.push(displayName(user));
      if (status === 'absent') absentees.push({ user, day: current });
      continue;
    }

    ops.push({
      insertOne: {
        document: {
          user: user._id,
          userSnapshot: snapshot(user),
          dateKey: key,
          weekKey,
          status,
          minutes,
          shifts: shiftsOf.get(uid) || [],
          source: 'auto',
          evaluatedAt: new Date()
        }
      }
    });
    created += 1;
    if (status === 'present') presentees.push(displayName(user));
    if (status === 'absent') absentees.push({ user, day: null });
  }

  if (ops.length) {
    await AttendanceDay.bulkWrite(ops, { ordered: false }).catch((error) => {
      console.error('[Attendance] تعذّر حفظ سجلات اليوم:', error.message);
    });
  }

  /* الغياب المتتالي + الوارن */
  const severity = [];
  const escalations = [];
  const Warning = require('../models/Warning');
  /* آخر إنذار لكل عضو: ما قبله محسوب ومصفّر */
  const lastWarningMap = new Map();
  if (absentees.length) {
    const rows = await Warning.aggregate([
      { $match: { user: { $in: absentees.map((entry) => entry.user._id) }, dateKey: { $ne: null } } },
      { $group: { _id: '$user', last: { $max: '$dateKey' } } }
    ]).catch(() => []);
    for (const row of rows) lastWarningMap.set(String(row._id), row.last);
  }

  for (const entry of absentees) {
    const uid = entry.user._id;
    const previous = await AttendanceDay.find({ user: uid, dateKey: { $lt: key } })
      .sort({ dateKey: -1 })
      .limit(30)
      .select('dateKey status streak')
      .lean();
    const lastWarningKey = lastWarningMap.get(String(uid)) || '';
    const dayDoc = await AttendanceDay.findOne({ user: uid, dateKey: key });
    /* يوم صدر فيه إنذار محسوم: لا نعيد كتابة سلسلته ولا نصدر عليه شيئًا */
    const warningToday = await Warning.findOne({ user: uid, dateKey: key }).select('_id').lean();
    if (warningToday) {
      if (dayDoc && !dayDoc.warning) {
        dayDoc.warning = warningToday._id;
        await dayDoc.save().catch(() => null);
      }
      continue;
    }
    const streak = countStreak(key, previous, lastWarningKey);
    if (dayDoc) {
      dayDoc.streak = streak;
      await dayDoc.save().catch(() => null);
    }
    if (streak >= c.absentLimit) {
      const topActive = await Warning.findOne({ user: uid, status: 'active' }).sort({ level: -1 }).select('level').lean();
      const activeCount = Number(topActive && topActive.level) || 0;
      /* وصل للحد الأقصى: لا إنذار رابع — يُرفع الأمر للقيادة مرة واحدة في اليوم */
      if (activeCount >= MAX_LEVEL) {
        if (dayDoc && !dayDoc.escalatedAt) {
          const done = await escalateToLeadership({ user: entry.user, dateKey: key, streak, c }).catch((error) => {
            console.error('[Attendance] تعذّر تصعيد الأمر للقيادة:', error.message);
            return false;
          });
          if (done) {
            dayDoc.escalatedAt = new Date();
            await dayDoc.save().catch(() => null);
            escalations.push(displayName(entry.user));
            console.log(`[Attendance] تصعيد للقيادة: ${displayName(entry.user)} (${activeCount} إنذارات، غياب ${streak}) — ${key}`);
          }
        }
        continue;
      }
      const already = await Warning.findOne({ user: uid, dateKey: key });
      if (!already) {
        const warning = await issueWarning({
          user: entry.user,
          dateKey: key,
          streak,
          attendanceId: dayDoc ? dayDoc._id : null,
          c
        }).catch((error) => {
          console.error('[Attendance] تعذّر إصدار الإنذار:', error.message);
          return null;
        });
        if (warning) {
          severity.push({ name: displayName(entry.user), level: warning.level, streak });
          console.log(`[Attendance] إنذار ${displayName(entry.user)} مستوى ${warning.level} (غياب ${streak}) — ${key}`);
        }
      }
    }
  }

  /* ملاحظة يومية لكل غائب في غرفة الملاحظات مع تاغ — مرة واحدة لكل يوم */
  let noted = 0;
  if (c.dailyNotes && c.notifyChannelId && absentees.length) {
    const todayKey = dateKeyNow(new Date(), c);
    const allowed = new Set([todayKey, time.addDaysToKey(todayKey, -1)]);
    if (allowed.has(key)) {
      for (const entry of absentees) {
        const doc = entry.day || (await AttendanceDay.findOne({ user: entry.user._id, dateKey: key }));
        if (!doc || doc.notifiedAt) continue;
        const did = String(entry.user.discordId || '');
        const mention = did ? `<@${did}>` : displayName(entry.user);
        const embed = discord.embed(
          'ملاحظة غياب',
          `لم يُسجَّل حضورك يوم ${key}. قدّم تبريرك خلال ${c.justifyHours} ساعة من إغلاق اليوم، وإلا يُحسب غيابًا في سجلك.`,
          0xf59e0b,
          [
            { name: 'العضو', value: displayName(entry.user), inline: true },
            { name: 'الرتبة', value: entry.user.rank || '—', inline: true },
            { name: 'اليوم', value: key, inline: true },
            { name: 'الغياب المتتالي', value: String(doc.streak || 1), inline: true }
          ]
        );
        const sent = await sendChannel(c.notifyChannelId, {
          content: `${mention} لديك ملاحظة غياب — ${key}`,
          embeds: [embed],
          allowedMentions: { users: did ? [did] : [] }
        });
        if (sent) {
          await AttendanceDay.updateOne({ _id: doc._id }, { $set: { notifiedAt: new Date() } }).catch(() => null);
          noted += 1;
        }
      }
    }
  }

  console.log(`[Attendance] تقييم ${key}: حاضر ${presentees.length}، غائب ${absentees.length}، إنذارات ${severity.length}، تصعيد ${escalations.length}، ملاحظات ${noted} (حد الغياب ${c.absentLimit}، غرفة الإنذارات ${c.warnChannelId || c.notifyChannelId ? 'مضبوطة' : 'غير مضبوطة'}، رولات ${c.warnRoles.filter(Boolean).length})`);

  if (created > 0 && c.dailySummary && c.logChannelId) {
    const lines = [
      `**حضور ${key}**`,
      `✅ حاضر: ${presentees.length} — ❌ غائب: ${absentees.length}`
    ];
    if (absentees.length) lines.push(`الغائبون: ${absentees.slice(0, 25).map((a) => displayName(a.user)).join('، ')}`);
    if (severity.length) lines.push(`إنذارات: ${severity.map((s) => `${s.name} (م${s.level})`).join('، ')}`);
    await sendChannel(c.logChannelId, { content: lines.join('\n') });
  }

  return { ok: true, dateKey: key, present: presentees.length, absent: absentees.length, created, warnings: severity.length, window: { start: win.start, end: win.end } };
}

/*
 * بداية التشغيل: أول مرة يعمل فيها النظام لا نحاسب أحدًا على أيام سابقة،
 * ونمسح أي سجلات تلقائية أُنشئت بأثر رجعي قبل التفعيل.
 */
async function ensureStarted(c) {
  const marker = String((await settingsService.get('attendance.startedAt', '')) || '').trim();
  if (marker) return marker;
  const today = dateKeyNow(new Date(), c);
  await settingsService.setMany({ 'attendance.startedAt': today }, null);
  const AttendanceDay = require('../models/AttendanceDay');
  await AttendanceDay.deleteMany({ dateKey: { $lt: today }, source: 'auto', 'justification.status': { $ne: 'pending' } }).catch(() => null);
  return today;
}

/** يقيّم الأيام المستحقة (اليوم + تعويض آخر ٣ أيام لو كان البوت مطفأ) */
async function runDue() {
  const c = await cfg();
  if (!c.enabled || !mongooseReady()) return { ok: false, reason: 'disabled' };
  const startedAt = await ensureStarted(c);
  const today = dateKeyNow(new Date(), c);
  const results = [];
  for (let i = 0; i < 4; i += 1) {
    const key = time.addDaysToKey(today, -i);
    if (startedAt && key < startedAt) break;
    const result = await evaluateDate(key).catch((error) => ({ ok: false, reason: error.message }));
    results.push(result);
    if (result.ok && result.created > 0) break;
  }
  await expireWarnings().catch(() => null);
  return { ok: true, results };
}

async function expireWarnings() {
  if (!mongooseReady()) return 0;
  const Warning = require('../models/Warning');
  const c = await cfg();
  const rows = await Warning.find({ status: 'active', expiresAt: { $ne: null, $lte: new Date() } }).lean();
  for (const row of rows) {
    await Warning.updateOne({ _id: row._id }, { $set: { status: 'expired', clearedAt: new Date(), clearReason: 'انتهت مدة الإنذار تلقائيًا' } });
    const remaining = await Warning.countDocuments({ user: row.user, status: 'active' });
    if (remaining === 0) {
      const User = require('../models/User');
      const user = await User.findById(row.user).lean();
      if (user) await stripRoles(user, c);
    }
  }
  return rows.length;
}

/* ─────────── التبرير ─────────── */
async function submitJustification(user, { dateKey, text }) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
  const c = await cfg();
  const AttendanceDay = require('../models/AttendanceDay');
  const key = String(dateKey || '').trim();
  if (!key) throw httpError(400, 'حدد اليوم', 'DATE_REQUIRED');
  const body = String(text || '').trim();
  if (body.length < 5) throw httpError(400, 'اكتب سبب الغياب (٥ أحرف على الأقل)', 'REASON_REQUIRED');

  const day = await AttendanceDay.findOne({ user: user._id, dateKey: key });
  if (!day) throw httpError(404, 'لا يوجد سجل غياب لهذا اليوم', 'NOT_FOUND');
  if (day.status !== 'absent') throw httpError(400, 'هذا اليوم غير مسجّل كغياب', 'NOT_ABSENT');
  if (day.justification && day.justification.status === 'pending') throw httpError(400, 'تبريرك قيد المراجعة', 'ALREADY_PENDING');
  if (day.justification && day.justification.status === 'approved') throw httpError(400, 'تم قبول تبريرك مسبقًا', 'ALREADY_APPROVED');

  const win = windowFor(key, c);
  if (c.justifyHours > 0) {
    const deadline = new Date(win.end.getTime() + c.justifyHours * 3600000);
    if (Date.now() > deadline.getTime()) throw httpError(400, `انتهت مهلة التبرير (${c.justifyHours} ساعة)`, 'WINDOW_CLOSED');
  }

  day.justification = { text: body, submittedAt: new Date(), status: 'pending' };
  await day.save();

  const embed = discord.embed('تبرير غياب جديد', body, 0x22c55e, [
    { name: 'العضو', value: displayName(user), inline: true },
    { name: 'الرتبة', value: user.rank || '—', inline: true },
    { name: 'اليوم', value: key, inline: true }
  ]);
  await sendChannel(c.notifyChannelId || c.warnChannelId || c.logChannelId, { embeds: [embed] });

  return { ok: true, day: day.toJSON() };
}

async function reviewJustification({ id, approve, note, admin }) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
  const AttendanceDay = require('../models/AttendanceDay');
  const Warning = require('../models/Warning');
  const day = await AttendanceDay.findById(id);
  if (!day) throw httpError(404, 'السجل غير موجود', 'NOT_FOUND');
  if (!day.justification || day.justification.status !== 'pending') {
    throw httpError(400, 'لا يوجد تبرير بانتظار المراجعة', 'NO_PENDING');
  }

  const c = await cfg();
  day.justification.status = approve ? 'approved' : 'rejected';
  day.justification.reviewedBy = admin ? admin._id : null;
  day.justification.reviewedByName = admin ? displayName(admin) : 'الإدارة';
  day.justification.reviewedAt = new Date();
  day.justification.note = String(note || '').slice(0, 600);

  if (approve) {
    day.status = 'excused';
    day.source = 'justification';
    day.streak = 0;
  }
  await day.save();

  if (approve && day.warning) {
    const warning = await Warning.findById(day.warning);
    if (warning && warning.status === 'active') {
      warning.status = 'cleared';
      warning.clearedBy = admin ? admin._id : null;
      warning.clearedByName = admin ? displayName(admin) : 'الإدارة';
      warning.clearedAt = new Date();
      warning.clearReason = 'قبول تبرير الغياب';
      await warning.save();
      const remaining = await Warning.countDocuments({ user: day.user, status: 'active' });
      if (remaining === 0) {
        const User = require('../models/User');
        const user = await User.findById(day.user).lean();
        if (user) await stripRoles(user, c);
      }
    }
    await recomputeAfter(day.user, day.dateKey, c);
  }

  await notifyService.push(day.user, {
    title: approve ? 'تم قبول تبريرك' : 'تم رفض تبريرك',
    body: approve ? `قُبل تبرير غيابك يوم ${day.dateKey} وأُلغي الإنذار.` : `رُفض تبرير غيابك يوم ${day.dateKey}.${note ? ' السبب: ' + note : ''}`,
    type: approve ? 'success' : 'warning',
    link: '#/attendance'
  }).catch(() => null);

  return { ok: true, day: day.toJSON() };
}

/** بعد قبول عذر: نعيد حساب السلسلة للأيام اللاحقة ونرفع أي إنذار مبني عليها */
async function recomputeAfter(userId, dateKey, c) {
  const AttendanceDay = require('../models/AttendanceDay');
  const Warning = require('../models/Warning');
  const days = await AttendanceDay.find({ user: userId, dateKey: { $gte: dateKey } }).sort({ dateKey: 1 });
  let streak = 0;
  for (const day of days) {
    if (day.status === 'absent') streak += 1;
    else streak = 0;
    if (day.streak !== streak) {
      day.streak = streak;
      await day.save().catch(() => null);
    }
    /* الفحص قبل التصفير: إن زال سبب الإنذار يُرفع */
    if (streak < c.absentLimit && day.warning) {
      const warning = await Warning.findById(day.warning);
      if (warning && warning.status === 'active') {
        warning.status = 'cleared';
        warning.clearedAt = new Date();
        warning.clearReason = 'زوال سبب الإنذار بعد قبول العذر';
        await warning.save();
        const remaining = await Warning.countDocuments({ user: userId, status: 'active' });
        if (remaining === 0) {
          const User = require('../models/User');
          const user = await User.findById(userId).lean();
          if (user) await stripRoles(user, c);
        }
      }
    }
    /* يوم صدر فيه إنذار يصفّر العدّاد: الغيابات التالية تبدأ سلسلة جديدة */
    if (day.warning) streak = 0;
  }
  return true;
}

async function clearWarning(id, { admin, reason }) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
  const Warning = require('../models/Warning');
  const warning = await Warning.findById(id);
  if (!warning) throw httpError(404, 'الإنذار غير موجود', 'NOT_FOUND');
  warning.status = 'cleared';
  warning.clearedBy = admin ? admin._id : null;
  warning.clearedByName = admin ? displayName(admin) : 'الإدارة';
  warning.clearedAt = new Date();
  warning.clearReason = String(reason || 'رفع يدوي من الإدارة').slice(0, 400);
  await warning.save();
  const remaining = await Warning.countDocuments({ user: warning.user, status: 'active' });
  if (remaining === 0) {
    const User = require('../models/User');
    const user = await User.findById(warning.user).lean();
    if (user) await stripRoles(user, await cfg());
  }
  return { ok: true };
}

/* ─────────── الإجازة ─────────── */
async function grantLeave({ userId, days, until, reason, admin }) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
  const User = require('../models/User');
  const AttendanceDay = require('../models/AttendanceDay');
  const user = await User.findById(userId);
  if (!user) throw httpError(404, 'العضو غير موجود', 'NOT_FOUND');
  const end = until ? new Date(until) : new Date(Date.now() + Math.max(1, Number(days) || 1) * 86400000);
  user.leaveUntil = end;
  user.leaveReason = String(reason || '').slice(0, 200);
  await user.save();
  await AttendanceDay.updateMany(
    { user: user._id, status: 'absent', dateKey: { $lte: time.dayKey(end, tz(), 0) } },
    { $set: { status: 'leave', source: 'manual', note: 'إجازة معتمدة' } }
  );
  const Warning = require('../models/Warning');
  await Warning.updateMany(
    { user: user._id, status: 'active' },
    { $set: { status: 'cleared', clearedAt: new Date(), clearedByName: admin ? displayName(admin) : 'الإدارة', clearReason: 'إجازة معتمدة' } }
  );
  await stripRoles(user, await cfg());
  await notifyService.push(user._id, {
    title: 'تم تسجيل إجازة',
    body: `إجازتك مسجّلة حتى ${time.dayKey(end, tz(), 0)}. لن تُحسب غيابًا خلالها.`,
    type: 'success',
    link: '#/attendance'
  }).catch(() => null);
  return { ok: true, until: end };
}

async function endLeave(userId) {
  const User = require('../models/User');
  await User.updateOne({ _id: userId }, { $set: { leaveUntil: null, leaveReason: '' } });
  return { ok: true };
}

/* ─────────── قراءات ─────────── */
async function myStatus(user) {
  const c = await cfg();
  const AttendanceDay = require('../models/AttendanceDay');
  const Warning = require('../models/Warning');
  const key = dateKeyNow(new Date(), c);
  const win = windowFor(key, c);
  const today = await AttendanceDay.findOne({ user: user._id, dateKey: key }).lean();
  const recent = await AttendanceDay.find({ user: user._id, status: 'absent' }).sort({ dateKey: -1 }).limit(10).lean();
  const warnings = await Warning.find({ user: user._id }).sort({ issuedAt: -1 }).limit(10).lean();

  const justify = recent
    .filter((day) => {
      if (!c.justifyHours) return true;
      const dayWin = windowFor(day.dateKey, c);
      return Date.now() <= dayWin.end.getTime() + c.justifyHours * 3600000;
    })
    .filter((day) => !day.justification || day.justification.status === 'none' || day.justification.status === 'rejected');

  const strict = await AttendanceDay.findOne({ user: user._id }).sort({ dateKey: -1 }).select('streak').lean();
  return {
    config: {
      minMinutes: c.minMinutes,
      absentLimit: c.absentLimit,
      justifyHours: c.justifyHours,
      warnDays: c.warnDays,
      dayStart: c.dayStart,
      closeTime: c.closeTime
    },
    dateKey: key,
    window: { start: win.start, end: win.end },
    today: today || null,
    streak: today ? today.streak || 0 : (strict ? strict.streak || 0 : 0),
    leaveUntil: user.leaveUntil || null,
    warnings,
    justifiable: justify
  };
}

async function roster(dateKey) {
  const c = await cfg();
  const AttendanceDay = require('../models/AttendanceDay');
  const key = String(dateKey || dateKeyNow(new Date(), c));
  const rows = await AttendanceDay.find({ dateKey: key }).sort({ status: -1 }).lean();
  const counts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  return { dateKey: key, rows, counts, window: windowFor(key, c) };
}

async function pendingReviews() {
  const AttendanceDay = require('../models/AttendanceDay');
  const rows = await AttendanceDay.find({ 'justification.status': 'pending' }).sort({ 'justification.submittedAt': 1 }).limit(50).lean();
  return rows;
}

async function warningsList(filter = {}) {
  const Warning = require('../models/Warning');
  const query = {};
  if (filter.status) query.status = filter.status;
  if (filter.user) query.user = filter.user;
  return Warning.find(query).sort({ issuedAt: -1 }).limit(Number(filter.limit) || 60).lean();
}

module.exports = {
  cfg,
  ensureStarted,
  dateKeyNow,
  windowFor,
  evaluateDate,
  runDue,
  expireWarnings,
  submitJustification,
  reviewJustification,
  recomputeAfter,
  clearWarning,
  grantLeave,
  endLeave,
  myStatus,
  roster,
  pendingReviews,
  warningsList,
  sendChannel,
  displayName,
  DEFAULTS
};
