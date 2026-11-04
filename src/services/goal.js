const config = require('../../config');
const settingsService = require('./settings');
const time = require('../utils/time');
const realtime = require('../realtime');

function mongooseReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

async function weekContext() {
  const settings = await settingsService.loadAll();
  const timezone = config.system.timezone;
  const weekStartDay = Number(settings['system.weekStartDay'] ?? config.system.weekStartDay);
  const nightShift = settings['system.nightShift'] || config.system.nightShift;
  const dayStartHour = time.getDayStartHour(nightShift);
  const now = new Date();
  const weekKey = time.weekKeyFor(now, timezone, weekStartDay, dayStartHour);
  return { settings, timezone, weekStartDay, nightShift, dayStartHour, weekKey, now };
}

async function ensureGoal(weekKey, target) {
  if (!mongooseReady()) {
    return {
      weekKey,
      target,
      earned: 0,
      lost: 0,
      current: 0,
      history: [],
      percent: 0
    };
  }
  const Goal = require('../models/Goal');
  let goal = await Goal.findOne({ weekKey });
  if (!goal) {
    goal = await Goal.create({ weekKey, target: Math.max(0, Number(target) || 0), earned: 0, lost: 0, current: 0 });
  }
  return goal;
}

async function getCurrentGoal(options = {}) {
  const { create = true } = options;
  const context = await weekContext();
  if (!mongooseReady()) {
    return { goal: await ensureGoal(context.weekKey, config.system.weeklyGoalTarget), context };
  }
  const Goal = require('../models/Goal');
  let goal = await Goal.findOne({ weekKey: context.weekKey });
  if (!goal && create) {
    const previous = await Goal.findOne({ weekKey: { $lt: context.weekKey } }).sort({ weekKey: -1 }).lean();
    const target = Number(
      previous ? previous.target : context.settings['system.weeklyGoalTarget'] || config.system.weeklyGoalTarget
    );
    goal = await Goal.create({
      weekKey: context.weekKey,
      target,
      earned: 0,
      lost: 0,
      current: 0,
      prizes: previous && previous.prizes && previous.prizes.length ? previous.prizes : []
    });
  }
  if (!goal && !create) goal = await ensureGoal(context.weekKey, context.settings['system.weeklyGoalTarget']);
  return { goal, context };
}

function serializeGoal(goal, context) {
  const current = Math.max(0, goal.current || 0);
  const target = Math.max(0, goal.target || 0);
  const remaining = Math.max(0, target - current);
  return {
    weekKey: goal.weekKey,
    target,
    current,
    earned: Math.max(0, goal.earned || 0),
    lost: Math.max(0, goal.lost || 0),
    remaining,
    percent: target > 0 ? Math.min(100, Math.round((current / target) * 1000) / 10) : 0,
    history: (goal.history || []).slice(-25).reverse(),
    prizes: (goal.prizes || []).slice(0, 3).map((prize) => ({
      rank: Number(prize.rank) || 0,
      name: prize.name || '',
      imageUrl: absoluteImage(prize.imageUrl),
      type: prize.type || '',
      amount: Number(prize.amount) || 0
    })),
    winners: (goal.winners || []).slice(0, 3).map((winner) => ({
      rank: Number(winner.rank) || 0,
      name: winner.name || '',
      awardedAt: winner.awardedAt || null
    })),
    rewardsAwardedAt: goal.rewardsAwardedAt || null,
    nextWeek: context ? time.nextWeekStart(goal.weekKey, context.weekStartDay, context.timezone) : null,
    weekStartDay: context ? context.weekStartDay : config.system.weekStartDay,
    weekEnd: goal.weekKey ? time.addDaysToKey(goal.weekKey, 6) : null
  };
}

/* ترتيب/تنظيف الهدايا الثلاث */
/* الصور المرفوعة داخل الموقع تُرجع مسارًا نسبيًا (/file/..)، ونحتاج رابطًا مطلقًا
   حتى يظهر في ديسكورد وفي الداشبورد */
const PUBLIC_BASE = String(process.env.BASE_URL || '').replace(/\/+$/, '');

function absoluteImage(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw.slice(0, 500);
  if (raw.startsWith('/')) return (PUBLIC_BASE + raw).slice(0, 500);
  return raw.slice(0, 500);
}

function cleanPrizes(prizes) {
  const list = Array.isArray(prizes) ? prizes : [];
  return [1, 2, 3].map((rank) => {
    const row = list[rank - 1] || {};
    return {
      rank,
      name: String(row.name || '').slice(0, 120),
      imageUrl: absoluteImage(row.imageUrl),
      type: String(row.type || '').slice(0, 60),
      amount: Math.max(0, Math.round(Number(row.amount) || 0))
    };
  });
}

async function setPrizes(prizes, user) {
  if (!mongooseReady()) return null;
  const { goal, context } = await getCurrentGoal({ create: true });
  goal.prizes = cleanPrizes(prizes);
  goal.updatedBy = user ? user._id : null;
  await goal.save();
  const payload = serializeGoal(goal, context);
  realtime.emit('goal:update', payload);
  realtime.emit('dashboard:refresh', { reason: 'goal-prizes' });
  return payload;
}

/* عند بلوغ الهدف: تُمنح الهدايا لأول ثلاثة في لوحة الشرف مرة واحدة لكل أسبوع */
async function awardIfReached(goal, context) {
  if (!goal) return null;
  if (!(Number(goal.target) > 0)) return null;
  if (Number(goal.current) < Number(goal.target)) return null;
  if (goal.rewardsAwardedAt) return null;
  const prizes = (goal.prizes || []).filter((prize) => prize && prize.name);
  if (!prizes.length) return null;

  const leaderboard = require('./leaderboard');
  const notifyService = require('./notify');
  const discordService = require('./discord');
  const audit = require('./audit');

  const board = await leaderboard.build({ limit: 3, weekKey: goal.weekKey }).catch(() => null);
  const top = (board && board.items ? board.items : []).slice(0, 3);
  if (!top.length) return null;

  goal.winners = top.map((row, index) => ({
    rank: index + 1,
    userId: row._id || null,
    name: row.name || 'عضو',
    awardedAt: new Date()
  }));
  goal.rewardsAwardedAt = new Date();
  await goal.save();

  for (let index = 0; index < top.length; index += 1) {
    const winner = top[index];
    const prize = prizes[index] || prizes[prizes.length - 1];
    const body = `${prize.name}${prize.type ? ' — ' + prize.type : ''}${prize.amount ? ' بقيمة ' + prize.amount : ''}`;
    if (winner._id) {
      await notifyService
        .push(winner._id, {
          title: `هدية المركز ${index + 1} في الهدف الأسبوعي`,
          body,
          type: 'success',
          link: '/#/leaderboard'
        })
        .catch(() => null);
    }
  }

  const lines = top
    .map((row, index) => {
      const prize = prizes[index] || prizes[prizes.length - 1];
      return `**${index + 1}.** ${row.name} — ${prize.name}${prize.amount ? ' (' + prize.amount + ')' : ''}`;
    })
    .join('\n');
  await discordService
    .sendChannel(require('../../config').discord.channels.announcements, {
      content: `🏆 تم بلوغ الهدف الأسبوعي (${goal.weekKey}). الهدايا لأول ثلاثة:\n${lines}`
    })
    .catch(() => null);

  await audit
    .log({
      action: 'goal.rewards',
      description: `منح هدايا الهدف الأسبوعي ${goal.weekKey} لأول ثلاثة`,
      targetType: 'goal',
      targetId: goal.weekKey,
      meta: { winners: goal.winners.map((winner) => ({ rank: winner.rank, name: winner.name })) }
    })
    .catch(() => null);

  realtime.emit('goal:update', serializeGoal(goal, context));
  return goal.winners;
}

async function addToGoal(amount, { reason = '', refType = '', refId = null, user = null } = {}) {
  if (!mongooseReady()) return null;
  const Goal = require('../models/Goal');
  const { goal, context } = await getCurrentGoal({ create: true });
  const delta = Math.round(Number(amount) || 0);
  if (!delta) return serializeGoal(goal, context);

  const safeDelta = Math.max(-goal.current, delta);
  goal.current = Math.max(0, goal.current + safeDelta);
  if (safeDelta > 0) goal.earned += safeDelta;
  if (safeDelta < 0) goal.lost += Math.abs(safeDelta);
  goal.history.push({
    amount: safeDelta,
    reason,
    refType,
    refId,
    byName: user ? user.displayName || user.username || '' : 'النظام',
    at: new Date()
  });
  if (goal.history.length > 300) goal.history = goal.history.slice(-300);
  if (user) goal.updatedBy = user._id;
  await goal.save();

  await awardIfReached(goal, context).catch(() => null);
  const payload = serializeGoal(goal, context);
  realtime.emit('goal:update', payload);
  realtime.emit('dashboard:refresh', { reason: 'goal' });
  return payload;
}

async function setTarget(target, user) {
  if (!mongooseReady()) return null;
  const { goal, context } = await getCurrentGoal({ create: true });
  goal.target = Math.max(0, Math.round(Number(target) || 0));
  goal.updatedBy = user ? user._id : null;
  await goal.save();
  const payload = serializeGoal(goal, context);
  realtime.emit('goal:update', payload);
  realtime.emit('dashboard:refresh', { reason: 'goal-set' });
  return payload;
}

async function adjustCurrent(amount, { reason = 'تعديل يدوي', user = null } = {}) {
  return addToGoal(amount, { reason, refType: 'manual', user });
}

async function rolloverIfNeeded() {
  if (!mongooseReady()) return null;
  const { goal, context } = await getCurrentGoal({ create: true });
  if (!goal) return null;
  const previous = await require('../models/Goal')
    .findOne({ weekKey: { $lt: goal.weekKey }, closedAt: null })
    .sort({ weekKey: -1 });
  if (previous) {
    previous.closedAt = new Date();
    await previous.save();
    realtime.emit('goal:update', serializeGoal(goal, context));
    realtime.emit('dashboard:refresh', { reason: 'week-rollover' });
  }
  return goal;
}

module.exports = {
  absoluteImage,
  weekContext,
  getCurrentGoal,
  serializeGoal,
  addToGoal,
  setPrizes,
  awardIfReached,
  cleanPrizes,
  setTarget,
  adjustCurrent,
  rolloverIfNeeded,
  ensureGoal
};
