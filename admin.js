const express = require('express');
const os = require('os');
const { asyncHandler, httpError, paginate, toCsv } = require('../utils/http');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { PERMISSIONS, ALL_PERMISSIONS } = require('../constants/permissions');
const settingsService = require('../services/settings');
const { getRanks, getRank, invalidate: invalidateRanks } = require('../services/ranks');
const goalService = require('../services/goal');
const pactService = require('../services/pact');
const discordService = require('../services/discord');
const realtime = require('../realtime');
const audit = require('../services/audit');
const release = require('../release');

const router = express.Router();

function dbReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

router.get(
  '/overview',
  requireAuth,
  requirePermission('settings:manage'),
  asyncHandler(async (req, res) => {
    const mongoose = require('mongoose');
    const stats = {
      db: mongoose.connection.readyState === 1,
      dbName: dbReady() ? mongoose.connection.name : '',
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      node: process.version,
      platform: `${os.type()} ${os.release()}`,
      release: release.version,
      bot: {
        configured: discordService.hasBot(),
        ready: discordService.isReady(),
        guildId: Boolean(require('../../config').discord.guildId)
      },
      online: realtime.onlineCount()
    };
    if (dbReady()) {
      const User = require('../models/User');
      const Operation = require('../models/Operation');
      const Order = require('../models/Order');
      const Ticket = require('../models/Ticket');
      const Transaction = require('../models/Transaction');
      const [members, operations, orders, tickets, transactions] = await Promise.all([
        User.countDocuments({}),
        Operation.countDocuments({}),
        Order.countDocuments({ status: 'pending' }),
        Ticket.countDocuments({ status: 'pending' }),
        Transaction.countDocuments({})
      ]);
      stats.counts = { members, operations, orders, tickets, transactions };
    }
    res.json({ stats });
  })
);

router.get(
  '/permissions',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({
      permissions: Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label })),
      total: ALL_PERMISSIONS.length
    });
  })
);

router.get(
  '/settings',
  requireAuth,
  requirePermission('settings:manage'),
  asyncHandler(async (req, res) => {
    const settings = await settingsService.getAll();
    res.json({ settings });
  })
);

router.patch(
  '/settings',
  requireAuth,
  requirePermission('settings:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    let incoming = {};
    if (req.body && Array.isArray(req.body.entries)) {
      for (const entry of req.body.entries) {
        if (entry && typeof entry.key === 'string') incoming[entry.key] = entry.value;
      }
    } else {
      incoming = (req.body && req.body.settings) || req.body || {};
    }
    const allowed = Object.keys(settingsService.defaultSettings());
    const updates = {};

    for (const [key, value] of Object.entries(incoming)) {
      if (!allowed.includes(key)) continue;
      if (key === 'pact.version') continue;
      if (key === 'system.weekStartDay') {
        updates[key] = Math.max(0, Math.min(6, Number(value) || 0));
        continue;
      }
      if (key === 'system.weeklyGoalTarget') {
        updates[key] = Math.max(0, Math.round(Number(value) || 0));
        continue;
      }
      if (key === 'system.autoCloseDutyHours') {
        updates[key] = Math.max(0, Math.min(72, Number(value) || 0));
        continue;
      }
      if (key === 'system.nightShift') {
        const night = value || {};
        updates[key] = {
          enabled: night.enabled !== false,
          lock: Boolean(night.lock),
          start: /^\d{1,2}:\d{2}$/.test(String(night.start || '')) ? String(night.start) : '22:00',
          end: /^\d{1,2}:\d{2}$/.test(String(night.end || '')) ? String(night.end) : '06:00'
        };
        continue;
      }
      if (key === 'system.attendanceVisibleRanks' && Array.isArray(value)) {
        updates[key] = value.map(String).slice(0, 30);
        continue;
      }
      if (typeof value === 'boolean') {
        updates[key] = value;
        continue;
      }
      if (typeof value === 'number') {
        updates[key] = value;
        continue;
      }
      if (value === null) {
        updates[key] = null;
        continue;
      }
      updates[key] = String(value).slice(0, 12000);
    }

    if (!Object.keys(updates).length) throw httpError(400, 'لا توجد إعدادات صالحة للتحديث', 'NO_UPDATES');
    await settingsService.setMany(updates, req.user);

    if (updates['system.weeklyGoalTarget'] !== undefined) {
      await goalService.setTarget(updates['system.weeklyGoalTarget'], req.user);
    }
    if (updates['system.weekStartDay'] !== undefined || updates['system.nightShift'] !== undefined) {
      await goalService.getCurrentGoal({ create: true });
    }

    realtime.emit('settings:update', { keys: Object.keys(updates) });
    realtime.emit('dashboard:refresh', { reason: 'settings' });
    await audit.log({
      actor: req.user,
      action: 'settings.update',
      description: `تحديث إعدادات النظام (${Object.keys(updates).join(', ')})`,
      targetType: 'settings',
      targetId: 'system',
      meta: { keys: Object.keys(updates) },
      req
    });
    res.json({ ok: true, settings: await settingsService.getAll() });
  })
);

async function resolveRoleName(roleId, givenName) {
  const id = String(roleId || '').trim();
  if (!id) return '';
  const given = String(givenName || '').trim().slice(0, 100);
  if (given) return given;
  try {
    const roles = await discordService.listGuildRoles();
    const found = roles.find((role) => role.id === id);
    return found ? found.name : '';
  } catch (error) {
    return '';
  }
}

router.get(
  '/discord-roles',
  requireAuth,
  requirePermission('ranks:manage'),
  asyncHandler(async (req, res) => {
    try {
      const roles = await discordService.listGuildRoles();
      res.json({ roles, available: true });
    } catch (error) {
      res.json({ roles: [], available: false, reason: error.message });
    }
  })
);

router.get(
  '/bot-status',
  requireAuth,
  requirePermission('settings:manage'),
  asyncHandler(async (req, res) => {
    res.json({ status: await discordService.getBotStatus() });
  })
);

router.post(
  '/sync-members',
  requireAuth,
  requirePermission('settings:manage'),
  asyncHandler(async (req, res) => {
    const syncService = require('../services/sync');
    syncService.syncAllUsers().catch((error) => console.error('[Admin] sync-all:', error.message));
    res.json({ ok: true, started: true });
  })
);

router.post(
  '/bot/commands',
  requireAuth,
  requirePermission('settings:manage'),
  asyncHandler(async (req, res) => {
    const bot = require('../bot');
    const ok = await bot.registerCommands();
    res.json({ ok: Boolean(ok), status: await discordService.getBotStatus() });
  })
);

router.post(
  '/bot/test',
  requireAuth,
  requirePermission('settings:manage'),
  asyncHandler(async (req, res) => {
    const key = String((req.body || {}).channel || '');
    if (!['orders', 'internalOrders', 'operations'].includes(key)) throw httpError(400, 'قناة غير معروفة', 'INVALID_CHANNEL');
    const channelId = await discordService.resolveChannelId(key);
    if (!channelId) throw httpError(400, 'لم تُحدَّد هذه القناة بعد', 'NO_CHANNEL');
    const sent = await discordService.sendChannel(key, { content: '✅ رسالة تجريبية من منصة CORTEZ — البوت يعمل على هذه القناة.' });
    if (!sent) throw httpError(502, 'تعذّر الإرسال: تأكد من رقم القناة وأن البوت يملك صلاحية إرسال الرسائل فيها', 'SEND_FAILED');
    res.json({ ok: true });
  })
);

router.get(
  '/ranks',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ranks = await getRanks(true);
    res.json({ ranks });
  })
);

router.post(
  '/ranks',
  requireAuth,
  requirePermission('ranks:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const Rank = require('../models/Rank');
    const body = req.body || {};
    const key = String(body.key || '').toLowerCase().trim();
    if (!/^[a-z0-9_-]{2,30}$/.test(key)) throw httpError(400, 'مفتاح الرتبة غير صالح (أحرف إنجليزية وأرقام)', 'INVALID_KEY');
    const exists = await Rank.findOne({ key });
    if (exists) throw httpError(409, 'هذا المفتاح مستخدم', 'DUPLICATE_KEY');
    const permissions = Array.isArray(body.permissions)
      ? body.permissions.map(String).filter((permission) => ALL_PERMISSIONS.includes(permission))
      : [];
    const rank = await Rank.create({
      key,
      name: String(body.name || key).slice(0, 60),
      short: String(body.short || key.slice(0, 8)).toUpperCase().slice(0, 20),
      level: Math.max(0, Math.min(999, Number(body.level) || 10)),
      color: /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : '#e63946',
      icon: String(body.icon || '◆').slice(0, 8),
      permissions,
      discordRoleId: String(body.discordRoleId || '').trim(),
      discordRoleName: await resolveRoleName(body.discordRoleId, body.discordRoleName),
      order: Number(body.order) || 50,
      description: String(body.description || '').slice(0, 300)
    });
    invalidateRanks();
    realtime.emit('ranks:update', { action: 'created', rank: rank.toJSON() });
    await audit.log({
      actor: req.user,
      action: 'rank.create',
      description: `إنشاء رتبة ${rank.name}`,
      targetType: 'rank',
      targetId: String(rank._id),
      req
    });
    res.status(201).json({ ok: true, rank: rank.toJSON() });
  })
);

router.patch(
  '/ranks/:id',
  requireAuth,
  requirePermission('ranks:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const Rank = require('../models/Rank');
    const rank = await Rank.findById(req.params.id);
    if (!rank) throw httpError(404, 'الرتبة غير موجودة', 'NOT_FOUND');
    const body = req.body || {};
    if (body.name !== undefined) rank.name = String(body.name).slice(0, 60);
    if (body.short !== undefined) rank.short = String(body.short).toUpperCase().slice(0, 20);
    if (body.level !== undefined) rank.level = Math.max(0, Math.min(999, Number(body.level) || 0));
    if (body.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(body.color)) rank.color = body.color;
    if (body.icon !== undefined) rank.icon = String(body.icon).slice(0, 8);
    if (body.order !== undefined) rank.order = Number(body.order) || 0;
    if (body.description !== undefined) rank.description = String(body.description).slice(0, 300);
    if (body.discordRoleId !== undefined) {
      rank.discordRoleId = String(body.discordRoleId || '').trim();
      rank.discordRoleName = await resolveRoleName(rank.discordRoleId, body.discordRoleName);
    } else if (body.discordRoleName !== undefined) {
      rank.discordRoleName = String(body.discordRoleName || '').slice(0, 100);
    }
    if (Array.isArray(body.permissions)) {
      rank.permissions = body.permissions
        .map(String)
        .filter((permission) => ALL_PERMISSIONS.includes(permission));
    }
    if (body.key !== undefined && !rank.isSystem) {
      const key = String(body.key).toLowerCase().trim();
      if (!/^[a-z0-9_-]{2,30}$/.test(key)) throw httpError(400, 'مفتاح غير صالح', 'INVALID_KEY');
      if (key !== rank.key) {
        const exists = await Rank.findOne({ key });
        if (exists) throw httpError(409, 'هذا المفتاح مستخدم', 'DUPLICATE_KEY');
        const User = require('../models/User');
        await User.updateMany({ rank: rank.key }, { $set: { rank: key } });
        rank.key = key;
      }
    }
    await rank.save();
    invalidateRanks();

    const User = require('../models/User');
    const affected = await User.find({ rank: rank.key }).select('_id').lean();
    for (const member of affected) {
      realtime.emitToUser(member._id, 'auth:refresh', { reason: 'rank-permissions' });
      setTimeout(() => realtime.refreshUserSockets(member._id), 600);
    }
    realtime.emit('ranks:update', { action: 'updated', rank: rank.toJSON() });
    await audit.log({
      actor: req.user,
      action: 'rank.update',
      description: `تعديل رتبة ${rank.name}`,
      targetType: 'rank',
      targetId: String(rank._id),
      meta: body,
      req
    });
    res.json({ ok: true, rank: rank.toJSON() });
  })
);

router.delete(
  '/ranks/:id',
  requireAuth,
  requirePermission('ranks:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const Rank = require('../models/Rank');
    const rank = await Rank.findById(req.params.id);
    if (!rank) throw httpError(404, 'الرتبة غير موجودة', 'NOT_FOUND');
    if (rank.isSystem) throw httpError(400, 'لا يمكن حذف رتب نظامية', 'SYSTEM_RANK');
    const User = require('../models/User');
    await User.updateMany({ rank: rank.key }, { $set: { rank: 'member' } });
    await Rank.deleteOne({ _id: rank._id });
    invalidateRanks();
    realtime.emit('ranks:update', { action: 'deleted', key: rank.key });
    await audit.log({
      actor: req.user,
      action: 'rank.delete',
      description: `حذف رتبة ${rank.name}`,
      targetType: 'rank',
      targetId: String(rank._id),
      req
    });
    res.json({ ok: true });
  })
);

router.get(
  '/audit',
  requireAuth,
  requirePermission('audit:view'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) return res.json({ items: [], total: 0 });
    const AuditLog = require('../models/AuditLog');
    const { page, limit, skip } = paginate(req.query);
    const query = {};
    if (req.query.action) query.action = new RegExp(String(req.query.action), 'i');
    if (req.query.actor) query.actor = req.query.actor;
    const [items, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(query)
    ]);
    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  })
);

router.post(
  '/sync/:userId',
  requireAuth,
  requirePermission('members:manage'),
  asyncHandler(async (req, res) => {
    const User = require('../models/User');
    const user = await User.findById(req.params.userId);
    if (!user) throw httpError(404, 'العضو غير موجود', 'NOT_FOUND');
    const result = await require('../services/sync').syncUser(user, { emit: true });
    res.json({ ok: true, result });
  })
);

router.patch(
  '/goal',
  requireAuth,
  requirePermission('settings:manage'),
  asyncHandler(async (req, res) => {
    const target = req.body ? req.body.target : null;
    if (target === undefined || target === null) throw httpError(400, 'الهدف مطلوب', 'TARGET_REQUIRED');
    const goal = await goalService.setTarget(target, req.user);
    await settingsService.set('system.weeklyGoalTarget', Math.max(0, Number(target) || 0), req.user);
    await audit.log({
      actor: req.user,
      action: 'goal.set',
      description: `تحديد الهدف الأسبوعي بـ ${target}`,
      targetType: 'goal',
      targetId: goal ? goal.weekKey : '',
      req
    });
    res.json({ ok: true, goal });
  })
);

router.post(
  '/goal/adjust',
  requireAuth,
  requirePermission('settings:manage'),
  asyncHandler(async (req, res) => {
    const amount = Number(req.body ? req.body.amount : 0);
    if (!amount) throw httpError(400, 'المبلغ مطلوب', 'AMOUNT_REQUIRED');
    const goal = await goalService.adjustCurrent(amount, {
      reason: String((req.body && req.body.reason) || 'تعديل إداري').slice(0, 200),
      user: req.user
    });
    await audit.log({
      actor: req.user,
      action: 'goal.adjust',
      description: `تعديل الهدف الأسبوعي بمقدار ${amount}`,
      targetType: 'goal',
      targetId: goal ? goal.weekKey : '',
      req
    });
    res.json({ ok: true, goal });
  })
);

router.post(
  '/reset-week',
  requireAuth,
  requirePermission('settings:manage'),
  asyncHandler(async (req, res) => {
    const Goal = require('../models/Goal');
    const context = await goalService.weekContext();
    const previous = await Goal.findOne({ weekKey: { $lt: context.weekKey } }).sort({ weekKey: -1 });
    if (previous && !previous.closedAt) {
      previous.closedAt = new Date();
      await previous.save();
    }
    const goal = await goalService.getCurrentGoal({ create: true });
    realtime.emit('goal:update', goalService.serializeGoal(goal.goal, goal.context));
    realtime.emit('dashboard:refresh', { reason: 'manual-week' });
    await audit.log({
      actor: req.user,
      action: 'goal.rollover',
      description: `تصفير/تدوير الأسبوع (${context.weekKey})`,
      targetType: 'goal',
      targetId: context.weekKey,
      req
    });
    res.json({ ok: true, goal: goalService.serializeGoal(goal.goal, goal.context) });
  })
);

router.get(
  '/pact-overview',
  requireAuth,
  requirePermission('pacts:view'),
  asyncHandler(async (req, res) => {
    const data = await pactService.signatures();
    res.json(data);
  })
);

router.get(
  '/export/members',
  requireAuth,
  requirePermission('members:view'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const User = require('../models/User');
    const users = await User.find({}).lean();
    const ranks = await getRanks();
    const rankMap = new Map(ranks.map((rank) => [rank.key, rank.name]));
    const csv = toCsv(users, [
      { label: 'الاسم', value: 'displayName' },
      { label: 'المعرّف', value: 'discordId' },
      { label: 'الرتبة', value: (row) => rankMap.get(row.rank) || row.rank },
      { label: 'الحالة', value: (row) => (row.blocked ? 'محظور' : row.inGuild ? 'نشط' : 'غادر') },
      { label: 'ساعات الدوام', value: (row) => Math.round(((row.stats && row.stats.totalMinutes) || 0) / 60) },
      { label: 'العمليات', value: (row) => (row.stats && row.stats.operations) || 0 },
      { label: 'الانتصارات', value: (row) => (row.stats && row.stats.wins) || 0 },
      { label: 'التحذيرات', value: (row) => (row.stats && row.stats.warnings) || 0 },
      { label: 'تاريخ الانضمام', value: (row) => (row.createdAt ? new Date(row.createdAt).toISOString() : '') }
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="cortez-members.csv"');
    res.send(csv);
  })
);

module.exports = router;
