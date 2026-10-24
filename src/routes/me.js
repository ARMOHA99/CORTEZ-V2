const express = require('express');
const config = require('../../config');
const { asyncHandler, httpError } = require('../utils/http');
const { requireAuth } = require('../middleware/auth');
const { permissionsOf } = require('../services/ranks');
const pactService = require('../services/pact');
const dutyService = require('../services/duty');
const notify = require('../services/notify');
const memberCard = require('../services/memberCard');
const syncService = require('../services/sync');
const realtime = require('../realtime');

const router = express.Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const pactStatus = await pactService.statusFor(req.user);
    const unread = await notify.unreadCount(req.user._id);
    const Notifications = require('../models/Notification');
    const latest = await Notifications.find({ user: req.user._id, read: false })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();
    const duty = await dutyService.personalSummary(req.user._id);
    res.json({
      user: req.user.toJSON(),
      rank: req.rank,
      permissions: permissionsOf(req.rank),
      pact: pactStatus,
      notifications: { unread, items: latest },
      duty,
      release: require('../release').version,
      serverTime: new Date().toISOString(),
      online: realtime.onlineCount()
    });
  })
);

router.post(
  '/sync',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await syncService.syncUser(req.user, { emit: false });
    if (result.revoked) {
      throw httpError(403, 'تم سحب صلاحيتك أو حظرك في ديسكورد', 'REVOKED');
    }
    const User = require('../models/User');
    const fresh = await User.findById(req.user._id);
    res.json({
      ok: true,
      user: fresh.toJSON(),
      rank: await require('../services/ranks').getRank(fresh.rank),
      skipped: Boolean(result.skipped)
    });
  })
);

router.get(
  '/pact',
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = await pactService.statusFor(req.user);
    res.json(status);
  })
);

router.post(
  '/pact/sign',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await pactService.sign({ user: req.user, req });
    res.json({ ok: true, ...result });
  })
);

router.get(
  '/notifications',
  requireAuth,
  asyncHandler(async (req, res) => {
    const Notification = require('../models/Notification');
    const items = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(60).lean();
    const unread = items.filter((item) => !item.read).length;
    res.json({ items, unread });
  })
);

router.post(
  '/notifications/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    const Notification = require('../models/Notification');
    await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } });
    res.json({ ok: true });
  })
);

router.post(
  '/notifications/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const Notification = require('../models/Notification');
    await Notification.updateOne(
      { _id: req.params.id, user: req.user._id },
      { $set: { read: true } }
    );
    res.json({ ok: true });
  })
);

router.patch(
  '/preferences',
  requireAuth,
  asyncHandler(async (req, res) => {
    const sound = Boolean(req.body.sound);
    const User = require('../models/User');
    await User.updateOne({ _id: req.user._id }, { $set: { 'preferences.sound': sound } });
    res.json({ ok: true, sound });
  })
);

router.get(
  '/card',
  requireAuth,
  asyncHandler(async (req, res) => {
    const card = await memberCard.build(req.user._id, req.user);
    res.json({ card });
  })
);

router.get(
  '/export',
  requireAuth,
  asyncHandler(async (req, res) => {
    const summary = await dutyService.personalSummary(req.user._id);
    res.json({
      user: { name: req.user.displayName, discordId: req.user.discordId, rank: req.rank ? req.rank.name : req.user.rank },
      summary,
      currency: config.system.currencyLabel
    });
  })
);

module.exports = router;
