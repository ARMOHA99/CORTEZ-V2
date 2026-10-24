const express = require('express');
const { asyncHandler, httpError, paginate, escapeRegex } = require('../utils/http');
const { requireAuth, requirePermission, isSelfOrPermission } = require('../middleware/auth');
const { getRanks, getRank } = require('../services/ranks');
const realtime = require('../realtime');
const audit = require('../services/audit');
const memberCard = require('../services/memberCard');
const discordService = require('../services/discord');

const router = express.Router();

function dbReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

router.get(
  '/',
  requireAuth,
  requirePermission('members:view'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) return res.json({ items: [], total: 0, page: 1, pages: 1 });
    const User = require('../models/User');
    const { page, limit, skip } = paginate(req.query);
    const query = {};
    if (req.query.rank) query.rank = String(req.query.rank);
    if (req.query.blocked === '1') query.blocked = true;
    else if (req.query.blocked === '0') query.blocked = false;
    if (req.query.search) {
      const regex = new RegExp(escapeRegex(String(req.query.search)), 'i');
      query.$or = [{ displayName: regex }, { username: regex }, { discordId: regex }];
    }
    const [items, total, ranks] = await Promise.all([
      User.find(query)
        .select('displayName username avatar discordId rank inGuild blocked duty stats lastSeen createdAt bloodPact')
        .sort({ rank: 1, displayName: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
      getRanks()
    ]);
    const rankMap = new Map(ranks.map((rank) => [rank.key, rank]));
    res.json({
      items: items.map((user) => ({
        ...user,
        rankName: rankMap.get(user.rank)?.name || user.rank,
        rankColor: rankMap.get(user.rank)?.color || '#9b9296',
        rankIcon: rankMap.get(user.rank)?.icon || '◆'
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      ranks
    });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const isSelf = String(req.user._id) === String(req.params.id);
    if (!isSelf && !req.permissions.includes('members:view')) {
      throw httpError(403, 'لا تملك صلاحية عرض هذا الملف', 'FORBIDDEN');
    }
    const User = require('../models/User');
    const Shift = require('../models/Shift');
    const Discipline = require('../models/Discipline');
    const user = await User.findById(req.params.id);
    if (!user) throw httpError(404, 'العضو غير موجود', 'NOT_FOUND');
    const rank = await getRank(user.rank);
    const showDetails = isSelf || req.permissions.includes('members:view');
    const [shifts, disciplines] = showDetails
      ? await Promise.all([
          Shift.find({ user: user._id }).sort({ startAt: -1 }).limit(30).lean(),
          Discipline.find({ user: user._id }).sort({ createdAt: -1 }).limit(20).lean()
        ])
      : [[], []];
    res.json({
      user: {
        ...user.toJSON(),
        rankName: rank ? rank.name : user.rank,
        rankColor: rank ? rank.color : '#9b9296',
        rankIcon: rank ? rank.icon : '◆',
        avatarUrl: user.avatarUrl
      },
      rank,
      shifts,
      disciplines,
      card: await memberCard.build(user._id, req.user)
    });
  })
);

router.patch(
  '/:id/rank',
  requireAuth,
  requirePermission('ranks:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const { rankKey } = req.body || {};
    if (!rankKey) throw httpError(400, 'حدد الرتبة الجديدة', 'RANK_REQUIRED');
    const User = require('../models/User');
    const target = await User.findById(req.params.id);
    if (!target) throw httpError(404, 'العضو غير موجود', 'NOT_FOUND');
    if (target.rank === 'owner' && req.user.rank !== 'owner') {
      throw httpError(403, 'لا يمكنك تعديل رتبة المدير العام', 'OWNER_PROTECTED');
    }
    const rank = await getRank(rankKey);
    if (!rank) throw httpError(400, 'رتبة غير معروفة', 'INVALID_RANK');
    const actorRank = req.rank || (await getRank(req.user.rank));
    if (req.user.rank !== 'owner' && actorRank && rank.level >= actorRank.level) {
      throw httpError(403, 'لا يمكنك منح رتبة مساوية أو أعلى من رتبتك', 'RANK_LEVEL');
    }
    const oldRank = target.rank;
    target.rank = rank.key;
    target.rankAssignedAt = new Date();
    target.sessionInvalid = false;
    await target.save();

    discordService.syncRankRole(target.discordId, rank.key, oldRank).catch(() => null);

    realtime.emitToUser(target._id, 'auth:refresh', { reason: 'rank-assigned', rank: rank.key });
    setTimeout(() => realtime.refreshUserSockets(target._id), 800);
    await require('../services/notify').push(target._id, {
      title: 'تم تحديث رتبتك',
      body: `أصبحت رتبتك الآن: ${rank.name}`,
      type: 'success',
      link: '/#/dashboard'
    });
    await audit.log({
      actor: req.user,
      action: 'member.rank',
      description: `تغيير رتبة ${target.displayName} من ${oldRank} إلى ${rank.key}`,
      targetType: 'user',
      targetId: String(target._id),
      req
    });
    res.json({ ok: true, rank, user: target.toJSON() });
  })
);

router.post(
  '/:id/block',
  requireAuth,
  requirePermission('members:ban'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    if (String(req.params.id) === String(req.user._id)) throw httpError(400, 'لا يمكنك حظر نفسك', 'SELF_BLOCK');
    const User = require('../models/User');
    const target = await User.findById(req.params.id);
    if (!target) throw httpError(404, 'العضو غير موجود', 'NOT_FOUND');
    if (target.rank === 'owner') throw httpError(403, 'لا يمكن حظر المدير العام', 'OWNER_PROTECTED');
    target.blocked = true;
    target.sessionInvalid = true;
    target.blockReason = String((req.body && req.body.reason) || 'قرار إداري').slice(0, 400);
    await target.save();
    if (require('../../config').discord.roles.banned) {
      discordService.assignRole(target.discordId, require('../../config').discord.roles.banned).catch(() => null);
    }
    realtime.emitToUser(target._id, 'auth:revoked', { reason: 'تم حظرك من المنصة' });
    setTimeout(() => realtime.refreshUserSockets(target._id), 700);
    await audit.log({
      actor: req.user,
      action: 'member.block',
      description: `حظر ${target.displayName} — ${target.blockReason}`,
      targetType: 'user',
      targetId: String(target._id),
      req
    });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/unblock',
  requireAuth,
  requirePermission('members:ban'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const User = require('../models/User');
    const target = await User.findById(req.params.id);
    if (!target) throw httpError(404, 'العضو غير موجود', 'NOT_FOUND');
    target.blocked = false;
    target.sessionInvalid = false;
    target.blockReason = '';
    await target.save();
    if (require('../../config').discord.roles.banned) {
      discordService.removeRole(target.discordId, require('../../config').discord.roles.banned).catch(() => null);
    }
    await audit.log({
      actor: req.user,
      action: 'member.unblock',
      description: `فك الحظر عن ${target.displayName}`,
      targetType: 'user',
      targetId: String(target._id),
      req
    });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/inventory',
  requireAuth,
  requirePermission('store:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const { name, qty, note } = req.body || {};
    if (!name || !String(name).trim()) throw httpError(400, 'اسم العتاد مطلوب', 'NAME_REQUIRED');
    const User = require('../models/User');
    const target = await User.findById(req.params.id);
    if (!target) throw httpError(404, 'العضو غير موجود', 'NOT_FOUND');
    target.inventory.push({
      name: String(name).slice(0, 120),
      qty: Math.max(1, Math.round(Number(qty) || 1)),
      note: String(note || '').slice(0, 300),
      addedBy: req.user._id,
      addedAt: new Date()
    });
    await target.save();
    await audit.log({
      actor: req.user,
      action: 'member.inventory',
      description: `إضافة عتاد ${name} إلى ${target.displayName}`,
      targetType: 'user',
      targetId: String(target._id),
      req
    });
    realtime.emitToUser(target._id, 'inventory:update', { inventory: target.inventory });
    res.json({ ok: true, inventory: target.inventory });
  })
);

router.delete(
  '/:id/inventory/:itemId',
  requireAuth,
  requirePermission('store:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const User = require('../models/User');
    const target = await User.findById(req.params.id);
    if (!target) throw httpError(404, 'العضو غير موجود', 'NOT_FOUND');
    target.inventory = target.inventory.filter((item) => String(item._id) !== String(req.params.itemId));
    await target.save();
    res.json({ ok: true, inventory: target.inventory });
  })
);

router.get(
  '/:id/card',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isSelfOrPermission(req.user, 'members:view', req.params.id)) {
      throw httpError(403, 'لا تملك صلاحية عرض البطاقة', 'FORBIDDEN');
    }
    const card = await memberCard.build(req.params.id, req.user);
    if (!card) throw httpError(404, 'العضو غير موجود', 'NOT_FOUND');
    res.json({ card });
  })
);

module.exports = router;
