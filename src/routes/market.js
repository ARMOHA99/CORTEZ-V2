const express = require('express');
const { asyncHandler, httpError } = require('../utils/http');
const { requireAuth, requirePermission } = require('../middleware/auth');
const market = require('../services/market');
const audit = require('../services/audit');

const router = express.Router();

function dbReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

/* السوق + حدودي وحصتي هذا الأسبوع */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const bounds = await market.limits();
    const quota = await market.usage(req.user._id, bounds);
    res.json({
      items: bounds.enabled ? await market.listActive(req.user._id) : [],
      limits: bounds,
      quota
    });
  })
);

/* إعلاناتي وأرباحي */
router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const bounds = await market.limits();
    res.json({
      items: await market.listMine(req.user._id),
      earnings: await market.myEarnings(req.user._id),
      limits: bounds,
      quota: await market.usage(req.user._id, bounds)
    });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await market.create({ user: req.user, body: req.body || {} });
    await audit.log({
      req,
      actor: req.user,
      action: 'market.create',
      description: `عرض «${result.listing.name}» في سوق الأعضاء`,
      targetType: 'market',
      targetId: String(result.listing._id),
      meta: { name: result.listing.name, price: result.listing.price, status: result.listing.status }
    });
    res.status(201).json(result);
  })
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const listing = await market.update({ id: req.params.id, user: req.user, body: req.body || {} });
    res.json({ listing: market.serialize(listing, req.user._id) });
  })
);

/* مراجعة القيادة */
router.get(
  '/review',
  requireAuth,
  requirePermission('store:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    res.json({ items: await market.listForReview(), limits: await market.limits() });
  })
);

router.post(
  '/:id/review',
  requireAuth,
  requirePermission('store:manage'),
  asyncHandler(async (req, res) => {
    const approve = Boolean(req.body && req.body.approve);
    const listing = await market.review({
      id: req.params.id,
      approve,
      note: (req.body && req.body.note) || '',
      user: req.user
    });
    await audit.log({
      req,
      actor: req.user,
      action: approve ? 'market.approve' : 'market.reject',
      description: `${approve ? 'موافقة على' : 'رفض'} إعلان «${listing.name}»`,
      targetType: 'market',
      targetId: String(listing._id),
      meta: { name: listing.name, note: listing.adminNote }
    });
    res.json({ listing: market.serialize(listing, req.user._id) });
  })
);

module.exports = router;
