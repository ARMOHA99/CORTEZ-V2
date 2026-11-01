const express = require('express');
const { asyncHandler, httpError, paginate } = require('../utils/http');
const { requireAuth, requirePermission } = require('../middleware/auth');
const config = require('../../config');
const discordService = require('../services/discord');
const notify = require('../services/notify');
const audit = require('../services/audit');
const realtime = require('../realtime');

const router = express.Router();

function dbReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbReady()) return res.json({ items: [] });
    const Discipline = require('../models/Discipline');
    const items = await Discipline.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(60).lean();
    res.json({ items });
  })
);

router.get(
  '/',
  requireAuth,
  requirePermission('discipline:view'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) return res.json({ items: [], total: 0, page: 1, pages: 1 });
    const Discipline = require('../models/Discipline');
    const { page, limit, skip } = paginate(req.query);
    const query = {};
    if (req.query.userId) query.user = req.query.userId;
    if (req.query.type) query.type = req.query.type;
    if (req.query.status) query.status = req.query.status;
    const [items, total] = await Promise.all([
      Discipline.find(query)
        .populate('user', 'displayName username avatar rank')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Discipline.countDocuments(query)
    ]);
    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  })
);

router.post(
  '/',
  requireAuth,
  requirePermission('discipline:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const { userId, type, reason, amount } = req.body || {};
    const allowed = ['note', 'warning', 'fine'];
    if (!allowed.includes(type)) throw httpError(400, 'نوع الإجراء غير صالح', 'INVALID_TYPE');
    if (!reason || !String(reason).trim()) throw httpError(400, 'سبب الإجراء مطلوب', 'REASON_REQUIRED');
    const User = require('../models/User');
    const Discipline = require('../models/Discipline');
    const target = await User.findById(userId);
    if (!target) throw httpError(404, 'العضو غير موجود', 'NOT_FOUND');
    if (target.rank === 'owner' && req.user.rank !== 'owner') {
      throw httpError(403, 'لا يمكن توقيع عقوبة على المدير العام', 'OWNER_PROTECTED');
    }
    const fineAmount = type === 'fine' ? Math.max(0, Math.round(Number(amount) || 0)) : 0;
    if (type === 'fine' && fineAmount <= 0) throw httpError(400, 'قيمة الغرامة مطلوبة', 'AMOUNT_REQUIRED');

    const record = await Discipline.create({
      user: target._id,
      userSnapshot: { name: target.displayName || target.username, discordId: target.discordId },
      type,
      reason: String(reason).slice(0, 700),
      amount: fineAmount,
      issuedBy: req.user._id,
      issuedByName: req.user.displayName || req.user.username || ''
    });

    const inc = {};
    if (type === 'warning') inc['stats.warnings'] = 1;
    if (type === 'fine') {
      inc['stats.fines'] = 1;
      inc['stats.totalFines'] = fineAmount;
    }
    if (Object.keys(inc).length) await User.updateOne({ _id: target._id }, { $inc: inc });

    if (type !== 'note' && (config.discord.roles.warning || config.discord.roles.fine)) {
      try {
        const synced = await discordService.notifyDiscipline(target, {
          type,
          reason: record.reason,
          amount: fineAmount,
          issuedByName: record.issuedByName
        });
        record.discordSynced = Boolean(synced);
      } catch (error) {
        record.discordError = error.message.slice(0, 300);
      }
      await record.save();
    }

    await notify.push(target._id, {
      title: type === 'fine' ? 'غرامة مالية' : type === 'warning' ? 'تحذير رسمي' : 'ملاحظة إدارية',
      body: record.reason,
      type: type === 'note' ? 'info' : 'warning',
      link: '/#/profile'
    });

    realtime.emit('discipline:update', { userId: String(target._id), type });
    await audit.log({
      actor: req.user,
      action: 'discipline.create',
      description: `${type} على ${target.displayName} — ${record.reason}`,
      targetType: 'user',
      targetId: String(target._id),
      meta: { type, amount: fineAmount, discordSynced: record.discordSynced },
      req
    });

    res.status(201).json({ ok: true, record: record.toJSON() });
  })
);

router.patch(
  '/:id/revoke',
  requireAuth,
  requirePermission('discipline:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const Discipline = require('../models/Discipline');
    const record = await Discipline.findById(req.params.id);
    if (!record) throw httpError(404, 'السجل غير موجود', 'NOT_FOUND');
    if (record.status === 'revoked') return res.json({ ok: true, record: record.toJSON() });
    record.status = 'revoked';
    record.revokedBy = req.user._id;
    record.revokedByName = req.user.displayName || req.user.username || '';
    record.revokedAt = new Date();
    record.revokeReason = String((req.body && req.body.reason) || '').slice(0, 300);
    await record.save();

    const User = require('../models/User');
    const inc = {};
    if (record.type === 'warning') inc['stats.warnings'] = -1;
    if (record.type === 'fine') {
      inc['stats.fines'] = -1;
      inc['stats.totalFines'] = -record.amount;
    }
    if (Object.keys(inc).length) await User.updateOne({ _id: record.user }, { $inc: inc });

    if (record.type !== 'note' && (config.discord.roles.warning || config.discord.roles.fine)) {
      const remaining = await Discipline.countDocuments({
        user: record.user,
        type: record.type,
        status: 'active'
      });
      if (remaining === 0) {
        const roleId = record.type === 'fine' ? config.discord.roles.fine : config.discord.roles.warning;
        if (roleId) discordService.removeRole(record.userSnapshot.discordId, roleId).catch(() => null);
      }
    }

    await audit.log({
      actor: req.user,
      action: 'discipline.revoke',
      description: `إلغاء ${record.type} عن ${record.userSnapshot.name}`,
      targetType: 'user',
      targetId: String(record.user),
      req
    });
    res.json({ ok: true, record: record.toJSON() });
  })
);

module.exports = router;
