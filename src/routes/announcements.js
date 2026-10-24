const express = require('express');
const { asyncHandler, httpError } = require('../utils/http');
const { requireAuth, requirePermission } = require('../middleware/auth');
const realtime = require('../realtime');
const audit = require('../services/audit');
const discordService = require('../services/discord');
const notify = require('../services/notify');

const router = express.Router();

function dbReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbReady()) return res.json({ items: [] });
    const Announcement = require('../models/Announcement');
    const canManage = req.permissions.includes('announcements:manage');
    const query = {};
    if (!(canManage && req.query.all === '1')) {
      query.active = true;
      query.$or = [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }];
    }
    const items = await Announcement.find(query).sort({ pinned: -1, createdAt: -1 }).limit(60).lean();
    res.json({ items, canManage });
  })
);

router.post(
  '/',
  requireAuth,
  requirePermission('announcements:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const { title, body, severity, pinned, active, expiresAt } = req.body || {};
    if (!title || !String(title).trim()) throw httpError(400, 'عنوان الإعلان مطلوب', 'TITLE_REQUIRED');
    if (!body || !String(body).trim()) throw httpError(400, 'نص الإعلان مطلوب', 'BODY_REQUIRED');
    const Announcement = require('../models/Announcement');
    const announcement = await Announcement.create({
      title: String(title).slice(0, 160),
      body: String(body).slice(0, 2500),
      severity: ['normal', 'urgent', 'critical'].includes(severity) ? severity : 'normal',
      pinned: Boolean(pinned),
      active: active !== false,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: req.user._id,
      createdByName: req.user.displayName || req.user.username || ''
    });

    realtime.emit('announcement:new', announcement.toJSON());
    realtime.emit('dashboard:refresh', { reason: 'announcement' });

    if (req.body.notifyDiscord !== false) {
      discordService.notifyAnnouncement(announcement.toJSON()).catch(() => null);
    }
    if (req.body.notifyMembers !== false) {
      notify
        .broadcastMembers({
          title: announcement.severity === 'normal' ? 'إعلان جديد' : 'إعلان عاجل',
          body: announcement.title,
          type: announcement.severity === 'normal' ? 'info' : 'warning',
          link: '/#/dashboard'
        })
        .catch(() => null);
    }

    await audit.log({
      actor: req.user,
      action: 'announcement.create',
      description: `نشر إعلان: ${announcement.title}`,
      targetType: 'announcement',
      targetId: String(announcement._id),
      req
    });

    res.status(201).json({ ok: true, announcement: announcement.toJSON() });
  })
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('announcements:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const Announcement = require('../models/Announcement');
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) throw httpError(404, 'الإعلان غير موجود', 'NOT_FOUND');
    const body = req.body || {};
    if (body.title !== undefined) announcement.title = String(body.title).slice(0, 160);
    if (body.body !== undefined) announcement.body = String(body.body).slice(0, 2500);
    if (body.severity !== undefined && ['normal', 'urgent', 'critical'].includes(body.severity)) {
      announcement.severity = body.severity;
    }
    if (body.pinned !== undefined) announcement.pinned = Boolean(body.pinned);
    if (body.active !== undefined) announcement.active = Boolean(body.active);
    if (body.expiresAt !== undefined) announcement.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    await announcement.save();
    realtime.emit('announcement:new', announcement.toJSON());
    realtime.emit('dashboard:refresh', { reason: 'announcement' });
    await audit.log({
      actor: req.user,
      action: 'announcement.update',
      description: `تعديل إعلان: ${announcement.title}`,
      targetType: 'announcement',
      targetId: String(announcement._id),
      req
    });
    res.json({ ok: true, announcement: announcement.toJSON() });
  })
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('announcements:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const Announcement = require('../models/Announcement');
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) throw httpError(404, 'الإعلان غير موجود', 'NOT_FOUND');
    await Announcement.deleteOne({ _id: announcement._id });
    realtime.emit('dashboard:refresh', { reason: 'announcement-deleted' });
    await audit.log({
      actor: req.user,
      action: 'announcement.delete',
      description: `حذف إعلان: ${announcement.title}`,
      targetType: 'announcement',
      targetId: String(announcement._id),
      req
    });
    res.json({ ok: true });
  })
);

module.exports = router;
