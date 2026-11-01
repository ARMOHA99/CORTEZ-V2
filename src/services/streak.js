/* ═══════════════════════════════════════════════════════════════════════
   سلسلة الولاء (Streak) والأوسمة — تُحسب من سجل الدوام نفسه.
   لا إدخال يدوي ولا جدول جديد: كل الأرقام من موديل Shift.
   ═══════════════════════════════════════════════════════════════════════ */

const config = require('../../config');
const settingsService = require('./settings');
const time = require('../utils/time');

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MINUTES = 30;

function mongooseReady() {
  return require('mongoose').connection.readyState === 1;
}

async function context() {
  const settings = await settingsService.loadAll().catch(() => ({}));
  const timezone = config.system.timezone;
  const nightShift = settings['system.nightShift'] || config.system.nightShift;
  const dayStartHour =
    typeof time.getDayStartHour === 'function' ? time.getDayStartHour(nightShift) : 0;
  return { timezone, dayStartHour };
}

/** يزحف على مفتاح يوم بصيغة YYYY-MM-DD بعدد أيام موجب أو سالب */
function shiftDayKey(key, delta) {
  const [year, month, day] = String(key || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function emptyShape(minMinutes = MIN_MINUTES) {
  return {
    currentStreak: 0,
    longestStreak: 0,
    todayCounted: false,
    todayMinutes: 0,
    countedDays: 0,
    totalShifts: 0,
    totalMinutes: 0,
    totalHours: 0,
    weekMinutes: 0,
    commitment30: 0,
    minMinutes,
    last14: [],
    medals: [],
    nextMedal: null
  };
}

/** الأوسمة: تُبنى من الأرقام المحسوبة نفسها، فتتحدّث وحدها */
function buildMedals({ currentStreak, longestStreak, totalHours, commitment30, countedDays }) {
  const medals = [];
  if (countedDays >= 1) medals.push({ key: 'first', label: 'أول نبضة', icon: '◆', tone: 'info' });
  if (countedDays >= 10) medals.push({ key: 'active10', label: 'حاضر دائم', icon: '◈', tone: 'success' });
  if (longestStreak >= 7) medals.push({ key: 'streak7', label: 'أسبوع من حديد', icon: '⛓', tone: 'primary' });
  if (longestStreak >= 30) medals.push({ key: 'streak30', label: 'شهر بلا انقطاع', icon: '❖', tone: 'warning' });
  if (totalHours >= 50) medals.push({ key: 'hours50', label: 'خمسون ساعة', icon: '⏳', tone: 'primary' });
  if (totalHours >= 100) medals.push({ key: 'hours100', label: 'مئة ساعة ولاء', icon: '♛', tone: 'danger' });
  if (commitment30 >= 80) medals.push({ key: 'loyal30', label: 'ولاء الشهر', icon: '✷', tone: 'success' });

  let nextMedal = null;
  if (longestStreak < 7) nextMedal = { label: 'أسبوع من حديد', need: 7 - longestStreak, unit: 'يوم' };
  else if (longestStreak < 30) nextMedal = { label: 'شهر بلا انقطاع', need: 30 - longestStreak, unit: 'يوم' };
  else if (totalHours < 100)
    nextMedal = { label: 'مئة ساعة ولاء', need: Math.max(1, Math.ceil(100 - totalHours)), unit: 'ساعة' };

  return { medals, nextMedal };
}

async function compute(userId, options = {}) {
  const minMinutes = Math.max(1, Number(options.minMinutes) || MIN_MINUTES);
  const days = Math.max(7, Number(options.days) || 180);
  if (!userId || !mongooseReady()) return emptyShape(minMinutes);

  const Shift = require('../models/Shift');
  const ctx = await context();
  const since = new Date(Date.now() - days * DAY_MS);

  const rows = await Shift.find({
    user: userId,
    kind: 'shift',
    status: 'closed',
    startAt: { $gte: since }
  })
    .select('dateKey totalMinutes startAt')
    .lean();

  const byDay = new Map();
  let totalMinutes = 0;
  for (const row of rows) {
    const minutes = Math.max(0, Math.round(Number(row.totalMinutes) || 0));
    totalMinutes += minutes;
    if (!row.dateKey) continue;
    byDay.set(row.dateKey, (byDay.get(row.dateKey) || 0) + minutes);
  }

  const counted = new Set(
    [...byDay.entries()].filter(([, minutes]) => minutes >= minMinutes).map(([key]) => key)
  );

  const today = time.dayKey(new Date(), ctx.timezone, ctx.dayStartHour);
  const yesterday = shiftDayKey(today, -1);
  const todayCounted = counted.has(today);

  /* السلسلة الحالية: تُحفظ لو كان أمس محسوبًا حتى لو لم يسجّل اليوم بعد */
  let currentStreak = 0;
  let cursor = todayCounted ? today : yesterday;
  while (cursor && counted.has(cursor) && currentStreak < 400) {
    currentStreak += 1;
    cursor = shiftDayKey(cursor, -1);
  }

  const keys = [...counted].sort();
  let longestStreak = 0;
  let run = 0;
  let previous = '';
  for (const key of keys) {
    run = previous && shiftDayKey(previous, 1) === key ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = key;
  }

  const last14 = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const key = shiftDayKey(today, -offset);
    const minutes = byDay.get(key) || 0;
    last14.push({ dateKey: key, minutes, counted: counted.has(key), today: key === today });
  }

  let counted30 = 0;
  let weekMinutes = 0;
  for (let offset = 0; offset < 30; offset += 1) {
    const key = shiftDayKey(today, -offset);
    if (counted.has(key)) counted30 += 1;
    if (offset < 7) weekMinutes += byDay.get(key) || 0;
  }

  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
  const commitment30 = Math.round((counted30 / 30) * 100);
  const { medals, nextMedal } = buildMedals({
    currentStreak,
    longestStreak,
    totalHours,
    commitment30,
    countedDays: counted.size
  });

  return {
    currentStreak,
    longestStreak,
    todayCounted,
    todayMinutes: byDay.get(today) || 0,
    countedDays: counted.size,
    totalShifts: rows.length,
    totalMinutes,
    totalHours,
    weekMinutes,
    commitment30,
    minMinutes,
    last14,
    medals,
    nextMedal
  };
}

module.exports = { compute, shiftDayKey, MIN_MINUTES };
