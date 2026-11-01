const express = require('express');
const { asyncHandler, httpError } = require('../utils/http');
const { requireAuth, requirePermission } = require('../middleware/auth');
const achievements = require('../services/achievements');
const audit = require('../services/audit');

const router = express.Router();

function dbReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

/* أوسمتي: التقييم + منح المستحق تلقائيًا */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const result = await achievements.forUser(req.user, { award: true });
    const owned = await achievements.wallet(req.user._id);
    const ownedMap = new Map(owned.map((row) => [row.key, row]));
    const badges = result.badges.map((badge) => ({
      ...badge,
      awardedAt: ownedMap.has(badge.key) ? ownedMap.get(badge.key).awardedAt : null,
      manual: ownedMap.has(badge.key) ? ownedMap.get(badge.key).source === 'manual' : false
    }));
    res.json({
      badges,
      stats: result.stats,
      awarded: result.awarded || [],
      leaders: await achievements.leaders(6),
      currency: achievements.currency
    });
  })
);

/* أوسمة عضو آخر */
router.get(
  '/u/:id',
  requireAuth,
  requirePermission('members:view'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const User = require('../models/User');
    const user = await User.findById(req.params.id);
    if (!user) throw httpError(404, 'العضو غير موجود', 'NOT_FOUND');
    const result = await achievements.forUser(user);
    res.json({ badges: result.badges.filter((badge) => badge.unlocked), stats: result.stats });
  })
);

/* منح وسام يدويًا / سحبه */
router.post(
  '/:id/grant',
  requireAuth,
  requirePermission('settings:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const key = String((req.body && req.body.key) || '').trim();
    const badge = await achievements.grant({
      userId: req.params.id,
      key,
      byUser: req.user,
      note: (req.body && req.body.note) || ''
    });
    await audit.log({
      req,
      actor: req.user,
      action: 'achievement.grant',
      description: `منح وسام ${key}`,
      targetType: 'user',
      targetId: String(req.params.id),
      meta: { key }
    });
    res.json({ badge });
  })
);

router.delete(
  '/:id/:key',
  requireAuth,
  requirePermission('settings:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    await achievements.revoke({ userId: req.params.id, key: req.params.key });
    await audit.log({
      req,
      actor: req.user,
      action: 'achievement.revoke',
      description: `سحب وسام ${req.params.key}`,
      targetType: 'user',
      targetId: String(req.params.id),
      meta: { key: req.params.key }
    });
    res.json({ ok: true });
  })
);

module.exports = router;
