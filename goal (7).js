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
    goal = await Goal.create({ weekKey: context.weekKey, target, earned: 0, lost: 0, current: 0 });
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
    nextWeek: context ? time.nextWeekStart(goal.weekKey, context.weekStartDay, context.timezone) : null,
    weekStartDay: context ? context.weekStartDay : config.system.weekStartDay,
    weekEnd: goal.weekKey ? time.addDaysToKey(goal.weekKey, 6) : null
  };
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
  weekContext,
  getCurrentGoal,
  serializeGoal,
  addToGoal,
  setTarget,
  adjustCurrent,
  rolloverIfNeeded,
  ensureGoal
};
