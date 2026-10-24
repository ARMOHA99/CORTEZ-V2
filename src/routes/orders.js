const express = require('express');
const { asyncHandler, httpError } = require('../utils/http');
const { requireAuth, requirePermission } = require('../middleware/auth');
const ordersService = require('../services/orders');
const audit = require('../services/audit');

const router = express.Router();

function dbReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbReady()) return res.json({ items: [], total: 0 });
    const Order = require('../models/Order');
    const canSeeAll = req.permissions.includes('orders:view') || req.permissions.includes('orders:manage');
    const wantAll = req.query.all === '1' && canSeeAll;
    const query = wantAll ? {} : { user: req.user._id };
    if (req.query.status) query.status = String(req.query.status);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const page = Math.max(1, Number(req.query.page) || 1);
    const [items, total] = await Promise.all([
      Order.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Order.countDocuments(query)
    ]);
    res.json({ items, total, page, canSeeAll });
  })
);

router.post(
  '/internal',
  requireAuth,
  requirePermission('store:internal'),
  asyncHandler(async (req, res) => {
    const order = await ordersService.createOrder({
      type: 'internal',
      user: req.user,
      items: (req.body && req.body.items) || [],
      note: req.body ? req.body.note : '',
      req
    });
    await audit.log({
      actor: req.user,
      action: 'order.create',
      description: `طلب داخلي ${order.code} (${order.items.length} صنف)`,
      targetType: 'order',
      targetId: String(order._id),
      req
    });
    res.status(201).json({ ok: true, order: order.toJSON() });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const Order = require('../models/Order');
    const order = await Order.findById(req.params.id).lean();
    if (!order) throw httpError(404, 'الطلب غير موجود', 'NOT_FOUND');
    const own = order.user && String(order.user) === String(req.user._id);
    if (!own && !req.permissions.includes('orders:view') && !req.permissions.includes('orders:manage')) {
      throw httpError(403, 'لا تملك صلاحية عرض هذا الطلب', 'FORBIDDEN');
    }
    res.json({ order });
  })
);

router.patch(
  '/:id/status',
  requireAuth,
  requirePermission('orders:manage'),
  asyncHandler(async (req, res) => {
    const { status, note } = req.body || {};
    const order = await ordersService.updateStatus({
      orderId: req.params.id,
      status,
      user: req.user,
      note
    });
    await audit.log({
      actor: req.user,
      action: 'order.status',
      description: `تحديث الطلب ${order.code} إلى ${status}`,
      targetType: 'order',
      targetId: String(order._id),
      meta: { status },
      req
    });
    res.json({ ok: true, order: order.toJSON() });
  })
);

module.exports = router;
