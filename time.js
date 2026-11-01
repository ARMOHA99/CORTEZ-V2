/**
 * أدوات الوقت والمنطقة الزمنية
 * مفهوم "اليوم" مرتبط بنافذة الدوام الليلي: إذا انتهت النافذة الساعة 06:00
 * فإن يوم العمل يبدأ 06:00 وينتهي 06:00 من الغد.
 */

const MS_MINUTE = 60 * 1000;
const MS_DAY = 24 * 60 * 60 * 1000;

function zonedParts(date = new Date(), timeZone = 'Asia/Riyadh') {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false
  });
  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? 0 : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: weekdays[parts.weekday] ?? 0
  };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function utcDateFromParts(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKeyOfUtc(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function parseTimeToMinutes(value, fallback = 0) {
  if (typeof value !== 'string' || !/^\d{1,2}:\d{2}$/.test(value)) return fallback;
  const [hours, minutes] = value.split(':').map(Number);
  return Math.max(0, Math.min(23, hours)) * 60 + Math.max(0, Math.min(59, minutes));
}

/**
 * يوم العمل الحالي بحسب نافذة الدوام الليلي.
 * dayStartHour هو ساعة نهاية النافذة الليلية (مثلاً 6).
 */
function getDayStartHour(nightShift = {}) {
  if (!nightShift || nightShift.enabled === false) return 0;
  return Math.floor(parseTimeToMinutes(nightShift.end, 0) / 60);
}

function dayKey(date = new Date(), timeZone = 'Asia/Riyadh', dayStartHour = 0) {
  const parts = zonedParts(date, timeZone);
  const localAsUtc = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  );
  localAsUtc.setUTCHours(localAsUtc.getUTCHours() - dayStartHour);
  return dateKeyOfUtc(localAsUtc);
}

function dayKeyDate(dayKeyValue) {
  const [year, month, day] = dayKeyValue.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function weekdayOfDayKey(dayKeyValue) {
  return dayKeyDate(dayKeyValue).getUTCDay();
}

function weekKeyFor(date = new Date(), timeZone = 'Asia/Riyadh', weekStartDay = 6, dayStartHour = 0) {
  const currentDayKey = dayKey(date, timeZone, dayStartHour);
  const weekday = weekdayOfDayKey(currentDayKey);
  const diff = (weekday - weekStartDay + 7) % 7;
  const start = dayKeyDate(currentDayKey);
  start.setUTCDate(start.getUTCDate() - diff);
  return dateKeyOfUtc(start);
}

function addDaysToKey(dayKeyValue, days) {
  const date = dayKeyDate(dayKeyValue);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKeyOfUtc(date);
}

function dayKeysBetween(startKey, endKey) {
  const keys = [];
  let cursor = startKey;
  for (let guard = 0; guard < 400; guard += 1) {
    keys.push(cursor);
    if (cursor === endKey) break;
    cursor = addDaysToKey(cursor, 1);
    if (cursor > endKey) break;
  }
  return keys;
}

function weekDays(weekKey) {
  return Array.from({ length: 7 }, (_, index) => addDaysToKey(weekKey, index));
}

const ARABIC_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const ARABIC_DAYS_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

function formatTime(date, timeZone = 'Asia/Riyadh') {
  const parts = zonedParts(date, timeZone);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

function formatDateTime(date, timeZone = 'Asia/Riyadh') {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}/${pad(parts.month)}/${pad(parts.day)} — ${pad(parts.hour)}:${pad(parts.minute)}`;
}

function formatDate(date, timeZone = 'Asia/Riyadh') {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}/${pad(parts.month)}/${pad(parts.day)}`;
}

function formatDuration(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} د`;
  return `${hours} س ${rest} د`;
}

function formatHours(totalMinutes) {
  return Math.round(((Number(totalMinutes) || 0) / 60) * 10) / 10;
}

function minutesBetween(start, end) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / MS_MINUTE));
}

/** هل نحن داخل نافذة القفل الليلي الآن؟ */
function inNightWindow(date = new Date(), timeZone = 'Asia/Riyadh', windowConfig = {}) {
  if (!windowConfig || windowConfig.enabled === false) return false;
  const start = parseTimeToMinutes(windowConfig.start, 22 * 60);
  const end = parseTimeToMinutes(windowConfig.end, 6 * 60);
  const parts = zonedParts(date, timeZone);
  const current = parts.hour * 60 + parts.minute;
  if (start === end) return false;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

/** الوقت المتبقي حتى بداية الأسبوع القادم (بالتوقيت المحلي) */
function nextWeekStart(weekKey, weekStartDay, timeZone = 'Asia/Riyadh') {
  const nextKey = addDaysToKey(weekKey, 7);
  const [year, month, day] = nextKey.split('-').map(Number);
  const nowParts = zonedParts(new Date(), timeZone);
  const targetAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const nowAsUtc = Date.UTC(
    nowParts.year,
    nowParts.month - 1,
    nowParts.day,
    nowParts.hour,
    nowParts.minute,
    nowParts.second
  );
  return {
    key: nextKey,
    msRemaining: Math.max(0, targetAsUtc - nowAsUtc),
    weekday: weekStartDay
  };
}

module.exports = {
  MS_MINUTE,
  MS_DAY,
  ARABIC_DAYS,
  ARABIC_DAYS_SHORT,
  zonedParts,
  dayKey,
  weekKeyFor,
  addDaysToKey,
  dayKeysBetween,
  weekDays,
  weekdayOfDayKey,
  getDayStartHour,
  parseTimeToMinutes,
  formatTime,
  formatDateTime,
  formatDate,
  formatDuration,
  formatHours,
  minutesBetween,
  inNightWindow,
  nextWeekStart
};
