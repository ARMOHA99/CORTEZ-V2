const express = require('express');
const config = require('../../config');
const release = require('../release');
const publicConfig = require('../publicConfig');
const { asyncHandler, httpError } = require('../utils/http');
const ordersService = require('../services/orders');
const realtime = require('../realtime');

const router = express.Router();

function dbReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

router.get('/config', (req, res) => {
  const payload = publicConfig(req);
  res.json({ ...payload, release: release.version, serverTime: new Date().toISOString() });
});

router.get('/version', (req, res) => {
  res.json({ release: release.version, at: release.builtAt });
});

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    if (!dbReady()) {
      return res.json({
        members: 0,
        operations: 0,
        wins: 0,
        online: realtime.onlineCount(),
        weekLabel: '',
        db: false
      });
    }
    const User = require('../models/User');
    const Operation = require('../models/Operation');
    const goalService = require('../services/goal');
    const context = await goalService.weekContext();
    const weekKey = context.weekKey;
    const [members, ops, wins] = await Promise.all([
      User.countDocuments({ inGuild: true, blocked: false }),
      Operation.countDocuments({}),
      Operation.countDocuments({ result: 'win' })
    ]);
    return res.json({
      members,
      operations: ops,
      wins,
      online: realtime.onlineCount(),
      weekKey,
      db: true
    });
  })
);

router.get(
  '/products',
  asyncHandler(async (req, res) => {
    if (!config.features.publicStore) return res.json({ items: [] });
    if (!dbReady()) return res.json({ items: [] });
    const Product = require('../models/Product');
    const items = await Product.find({ active: true, scope: { $in: ['external', 'both'] } })
      .select('name sku description category price image stock featured order')
      .sort({ order: 1, createdAt: 1 })
      .lean();
    res.json({
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
  asyncHandler(async (req, res) => {
    if (!config.features.publicStore || !config.features.guestOrders) {
      throw httpError(403, 'المتجر الخارجي مغلق حالياً', 'STORE_CLOSED');
    }
    const { customer, items, note } = req.body || {};
    const order = await ordersService.createOrder({
      type: 'external',
      customer: customer || {},
      items: items || [],
      note,
      req
    });
    res.status(201).json({
      ok: true,
      order: {
        code: order.code,
        total: order.total,
        status: order.status,
        items: order.items,
        createdAt: order.createdAt
      }
    });
  })
);

router.get(
  '/orders/:code',
  asyncHandler(async (req, res) => {
    const order = await ordersService.findByCode(req.params.code);
    if (!order) throw httpError(404, 'لم نجد طلباً بهذا الرقم', 'NOT_FOUND');
    res.json({ order: ordersService.serializePublic(order) });
  })
);

module.exports = router;
