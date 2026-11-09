/**
 * نظام جهاز الدوام (CortezAgent)
 * ───────────────────────────────
 * تطبيق صغير على جهاز العضو يفحص اتصاله بسيرفر فايفم ويرسل نبضة للموقع.
 * من خلاله نعرف من هو داخل السيرفر فعليًا، ونمنع الدخول لمن لم يثبّت التطبيق.
 */

const crypto = require('crypto');
const settingsService = require('./settings');
const { httpError } = require('../utils/http');

const DEFAULTS = {
  enabled: true,
  required: false,
  host: '185.239.175.27',
  port: 30120,
  version: '1.1.0',
  downloadUrl: '/download/CortezAgent.exe',
  intervalSeconds: 30,
  autoDuty: true,
  exemptRanks: ['owner', 'operations']
};

function mongooseReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

function num(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function str(value, fallback = '') {
  const text = String(value == null ? '' : value).trim();
  return text || fallback;
}

async function cfg() {
  let s = {};
  try {
    s = (await settingsService.getAll()) || {};
  } catch (error) {
    s = {};
  }
  const ranks = Array.isArray(s['agent.exemptRanks']) ? s['agent.exemptRanks'] : DEFAULTS.exemptRanks;
  return {
    enabled: s['agent.enabled'] !== false,
    required: s['agent.required'] === true,
    host: str(s['agent.host'], DEFAULTS.host),
    port: num(s['agent.port'], DEFAULTS.port, 1, 65535),
    version: str(s['agent.version'], DEFAULTS.version),
    downloadUrl: str(s['agent.downloadUrl'], DEFAULTS.downloadUrl),
    intervalSeconds: num(s['agent.intervalSeconds'], DEFAULTS.intervalSeconds, 10, 300),
    autoDuty: s['agent.autoDuty'] !== false,
    exemptRanks: ranks.map((rank) => String(rank || '').trim()).filter(Boolean)
  };
}

/* نافذة اعتبار الجهاز متصلًا: ضعف الفاصل + هامش */
function onlineWindow(c) {
  return Math.max(60, c.intervalSeconds * 2 + 30) * 1000;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function isExempt(user, c) {
  return Boolean(user && c.exemptRanks.includes(user.rank));
}

function serializeDevice(device, c) {
  const online = Boolean(device.lastSeenAt) && Date.now() - new Date(device.lastSeenAt).getTime() <= onlineWindow(c);
  return {
    id: String(device._id),
    label: device.label || 'جهاز',
    platform: device.platform || 'windows',
    version: device.appVersion || '',
    online,
    duty: online && Boolean(device.duty),
    lastSeenAt: device.lastSeenAt || null,
    createdAt: device.createdAt || null
  };
}

async function devicesOf(user, c) {
  if (!mongooseReady() || !user) return [];
  const AgentDevice = require('../models/AgentDevice');
  const rows = await AgentDevice.find({ user: user._id, revokedAt: null }).sort({ createdAt: -1 }).limit(10).lean();
  return rows.map((row) => serializeDevice(row, c));
}

/* الحالة كما يراها الموقع */
async function statusFor(user) {
  const c = await cfg();
  if (!mongooseReady()) {
    return { enabled: c.enabled, required: false, linked: true, devices: [], version: c.version, downloadUrl: c.downloadUrl, target: `${c.host}:${c.port}` };
  }
  const devices = await devicesOf(user, c);
  const online = devices.some((device) => device.online);
  const exempt = isExempt(user, c);
  const required = c.enabled && c.required && !exempt;
  return {
    enabled: c.enabled,
    required,
    exempt,
    linked: devices.length > 0,
    online,
    duty: devices.some((device) => device.duty),
    devices,
    version: c.version,
    downloadUrl: c.downloadUrl,
    target: `${c.host}:${c.port}`,
    intervalSeconds: c.intervalSeconds
  };
}

/* يستخدمها الخادم للحجب: هل نمنع هذا العضو من الدخول؟ */
async function blockedFor(user) {
  const status = await statusFor(user);
  return { blocked: status.required && !status.linked, status };
}

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function createCode(user) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
  const AgentCode = require('../models/AgentCode');
  const code = makeCode();
  const expiresAt = new Date(Date.now() + 30 * 60000);
  await AgentCode.create({ user: user._id, code, expiresAt });
  const c = await cfg();
  return {
    code,
    expiresAt,
    version: c.version,
    downloadUrl: c.downloadUrl,
    target: `${c.host}:${c.port}`
  };
}

/* الربط من التطبيق: رمز + بصمة جهاز → رمز دائم */
async function link({ code, deviceId, label, platform, version }, ipHash) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
  if (!/^[A-Z0-9]{6,12}$/.test(String(code || '').trim().toUpperCase())) {
    throw httpError(400, 'رمز الربط غير صحيح', 'BAD_CODE');
  }
  const AgentCode = require('../models/AgentCode');
  const AgentDevice = require('../models/AgentDevice');
  const row = await AgentCode.findOne({ code: String(code).trim().toUpperCase() });
  if (!row) throw httpError(404, 'رمز الربط غير موجود. اطلب رمزًا جديدًا من الموقع.', 'CODE_NOT_FOUND');
  if (row.usedAt) throw httpError(400, 'هذا الرمز استُخدم مسبقًا. اطلب رمزًا جديدًا.', 'CODE_USED');
  if (row.expiresAt.getTime() < Date.now()) throw httpError(400, 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.', 'CODE_EXPIRED');

  const token = crypto.randomBytes(32).toString('hex');
  const device = await AgentDevice.create({
    user: row.user,
    deviceId: String(deviceId || '').slice(0, 120),
    tokenHash: hashToken(token),
    label: String(label || 'جهاز ويندوز').slice(0, 120),
    platform: String(platform || 'windows').slice(0, 40),
    appVersion: String(version || '').slice(0, 40),
    lastSeenAt: new Date(),
    lastIpHash: ipHash || ''
  });
  row.usedAt = new Date();
  await row.save();

  const c = await cfg();
  return {
    token,
    device: serializeDevice(device.toObject(), c),
    host: c.host,
    port: c.port,
    intervalSeconds: c.intervalSeconds,
    site: ''
  };
}

/*
 * مزامنة الدوام مع حالة الاتصال بالسيرفر:
 * دخل السيرفر → يفتح شفت، خرج أو كراش → يقفل الشفت ويحسب الدقائق.
 */
async function syncShift(userId, onDuty) {
  if (!mongooseReady()) return null;
  const User = require('../models/User');
  const duty = require('./duty');
  const user = await User.findById(userId);
  if (!user || user.blocked) return null;
  const active = await duty.findActiveShift(user._id);
  if (onDuty) {
    if (active) return { skipped: 'already' };
    const result = await duty.startDuty(user, null, { bypassLock: true });
    return result;
  }
  if (!active) return { skipped: 'noShift' };
  const result = await duty.endDuty(user, { note: 'انقطاع الاتصال بسيرفر فايفم — تطبيق الدوام' });
  return result;
}

/* النبضة من التطبيق */
async function heartbeat({ token, connected = false, version = '' }, ipHash) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
  const AgentDevice = require('../models/AgentDevice');
  if (!token || !/^[a-f0-9]{64}$/i.test(String(token))) throw httpError(401, 'رمز الجهاز غير صحيح', 'BAD_TOKEN');
  const device = await AgentDevice.findOne({ tokenHash: hashToken(token) });
  if (!device || device.revokedAt) throw httpError(401, 'الجهاز غير مرتبط. اطلب رمز ربط جديدًا من الموقع.', 'DEVICE_REVOKED');

  device.lastSeenAt = new Date();
  const wasDuty = Boolean(device.duty);
  device.duty = connected === true || connected === 'true' || connected === 1;
  if (version) device.appVersion = String(version).slice(0, 40);
  if (ipHash) device.lastIpHash = ipHash;
  await device.save();

  const c = await cfg();
  const nowDuty = Boolean(device.duty);
  if (c.autoDuty && nowDuty !== wasDuty) {
    await syncShift(device.user, nowDuty).catch((error) => {
      console.error('[Agent] تعذّر تحديث الدوام تلقائيًا:', error.message);
    });
  }
  return {
    ok: true,
    autoDuty: c.autoDuty,
    intervalSeconds: c.intervalSeconds,
    host: c.host,
    port: c.port,
    version: c.version,
    downloadUrl: c.downloadUrl
  };
}

async function unlink(user, deviceId) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
  const AgentDevice = require('../models/AgentDevice');
  const query = deviceId ? { _id: deviceId, user: user._id } : { user: user._id };
  const result = await AgentDevice.updateMany(query, { $set: { revokedAt: new Date(), duty: false } });
  return { ok: true, revoked: result.modifiedCount || result.nModified || 0 };
}

/* إحصاء للوحة الإدارة */
async function overview() {
  const c = await cfg();
  if (!mongooseReady()) return { cfg: c, devices: [], linked: 0, online: 0, duty: 0 };
  const AgentDevice = require('../models/AgentDevice');
  const rows = await AgentDevice.find({ revokedAt: null })
    .populate('user', 'displayName rank')
    .sort({ lastSeenAt: -1 })
    .limit(200)
    .lean();
  const window = onlineWindow(c);
  const devices = rows.map((row) => ({
    ...serializeDevice(row, c),
    user: row.user ? { id: String(row.user._id), name: row.user.displayName || '', rank: row.user.rank || '' } : null
  }));
  return {
    cfg: { enabled: c.enabled, required: c.required, host: c.host, port: c.port, version: c.version, intervalSeconds: c.intervalSeconds, autoDuty: c.autoDuty },
    linked: devices.length,
    online: devices.filter((device) => device.online).length,
    duty: devices.filter((device) => device.duty).length,
    devices
  };
}

module.exports = {
  cfg,
  statusFor,
  blockedFor,
  syncShift,
  createCode,
  link,
  heartbeat,
  unlink,
  overview,
  isExempt,
  onlineWindow,
  DEFAULTS
};
