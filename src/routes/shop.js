const express = require('express');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../utils/http');
const settingsService = require('../services/settings');
const ordersService = require('../services/orders');

const router = express.Router();

function dbReady() {
  return require('mongoose').connection.readyState === 1;
}

/* المتجر الخارجي: لا يدخله إلا من سجّل الدخول وتملك رتبته صلاحية store:view */
router.get(
  '/products',
  requireAuth,
  requirePermission('store:view'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) return res.json({ items: [], store: { open: false } });
    const settings = await settingsService.getAll().catch(() => ({}));
    const store = {
      open: settings['store.externalEnabled'] !== false,
      title: settings['store.externalTitle'] || 'المتجر الخارجي',
      description: settings['store.externalDescription'] || ''
    };
    if (!store.open) return res.json({ items: [], store });
    const Product = require('../models/Product');
    const items = await Product.find({ active: true, scope: { $in: ['external', 'both'] } })
      .select('name sku description category price image stock featured order')
      .sort({ order: 1, createdAt: 1 })
      .lean();
    res.json({
      store,
      items: items.map((item) => ({
        ...item,
        price: Number(item.price) || 0,
        available: item.stock === null || item.stock === undefined || item.stock > 0
      }))
    });
  })
);

router.post(
  '/orders',
  requireAuth,
  requirePermission('store:view'),
  asyncHandler(async (req, res) => {
    if ((await settingsService.get('store.externalEnabled', true)) === false) {
      throw httpError(403, 'المتجر الخارجي مغلق حالياً من الإدارة', 'STORE_CLOSED');
    }
    const { items, note } = req.body || {};
    const order = await ordersService.createOrder({
      type: 'external',
      user: req.user,
      customer: { name: req.user.displayName || req.user.username || '', contact: req.user.username || '' },
      items: items || [],
      note,
      req
    });
    res.status(201).json({
      ok: true,
      order: { code: order.code, total: order.total, status: order.status, items: order.items, createdAt: order.createdAt }
    });
  })
);

module.exports = router;
