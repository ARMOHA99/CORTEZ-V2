const express = require('express');
const { asyncHandler, httpError } = require('../utils/http');
const { requireAuth, requirePermission } = require('../middleware/auth');
const realtime = require('../realtime');
const audit = require('../services/audit');

const router = express.Router();

function dbReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

function validateImage(value) {
  const image = String(value || '').trim();
  if (!image) return '';
  if (image.startsWith('/uploads/') || image.startsWith('https://') || image.startsWith('http://localhost')) {
    return image.slice(0, 500);
  }
  throw httpError(400, 'رابط الصورة غير صالح', 'INVALID_IMAGE');
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbReady()) return res.json({ items: [] });
    const Product = require('../models/Product');
    const scope = String(req.query.scope || 'external');
    const canManage = req.permissions.includes('store:manage') || req.user.rank === 'owner';
    const query = {};
    if (canManage && req.query.all === '1') {
      /* المدير يرى كل شيء */
    } else if (scope === 'internal') {
      if (!canManage && !req.permissions.includes('store:internal')) {
        throw httpError(403, 'المتجر الداخلي مخصص للأعضاء', 'FORBIDDEN');
      }
      query.scope = { $in: ['internal', 'both'] };
      query.active = true;
    } else {
      query.scope = { $in: ['external', 'both'] };
      query.active = true;
    }
    const items = await Product.find(query).sort({ order: 1, createdAt: 1 }).lean();
    res.json({ items, canManage });
  })
);

router.post(
  '/',
  requireAuth,
  requirePermission('store:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const Product = require('../models/Product');
    const body = req.body || {};
    if (!body.name || !String(body.name).trim()) throw httpError(400, 'اسم المنتج مطلوب', 'NAME_REQUIRED');
    const product = await Product.create({
      name: String(body.name).slice(0, 120),
      sku: String(body.sku || '').slice(0, 40),
      description: String(body.description || '').slice(0, 800),
      category: ['weapon', 'drug', 'gear', 'vehicle', 'service', 'other'].includes(body.category) ? body.category : 'other',
      scope: ['external', 'internal', 'both'].includes(body.scope) ? body.scope : 'both',
      price: Math.max(0, Math.round(Number(body.price) || 0)),
      cost: Math.max(0, Math.round(Number(body.cost) || 0)),
      image: validateImage(body.image),
      stock: body.stock === '' || body.stock === null || body.stock === undefined ? null : Math.max(0, Math.round(Number(body.stock) || 0)),
      active: body.active !== false,
      featured: Boolean(body.featured),
      order: Number(body.order) || 0,
      createdBy: req.user._id
    });
    await audit.log({
      actor: req.user,
      action: 'product.create',
      description: `إضافة منتج ${product.name} بسعر ${product.price}`,
      targetType: 'product',
      targetId: String(product._id),
      req
    });
    realtime.emit('store:update', { action: 'created', productId: String(product._id) });
    res.status(201).json({ ok: true, product: product.toJSON() });
  })
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('store:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const Product = require('../models/Product');
    const product = await Product.findById(req.params.id);
    if (!product) throw httpError(404, 'المنتج غير موجود', 'NOT_FOUND');
    const body = req.body || {};
    if (body.name !== undefined) product.name = String(body.name).slice(0, 120);
    if (body.sku !== undefined) product.sku = String(body.sku).slice(0, 40);
    if (body.description !== undefined) product.description = String(body.description).slice(0, 800);
    if (body.category !== undefined && ['weapon', 'drug', 'gear', 'vehicle', 'service', 'other'].includes(body.category)) {
      product.category = body.category;
    }
    if (body.scope !== undefined && ['external', 'internal', 'both'].includes(body.scope)) product.scope = body.scope;
    if (body.price !== undefined) product.price = Math.max(0, Math.round(Number(body.price) || 0));
    if (body.cost !== undefined) product.cost = Math.max(0, Math.round(Number(body.cost) || 0));
    if (body.image !== undefined) product.image = validateImage(body.image);
    if (body.stock !== undefined) {
      product.stock = body.stock === '' || body.stock === null ? null : Math.max(0, Math.round(Number(body.stock) || 0));
    }
    if (body.active !== undefined) product.active = Boolean(body.active);
    if (body.featured !== undefined) product.featured = Boolean(body.featured);
    if (body.order !== undefined) product.order = Number(body.order) || 0;
    await product.save();
    await audit.log({
      actor: req.user,
      action: 'product.update',
      description: `تعديل منتج ${product.name}`,
      targetType: 'product',
      targetId: String(product._id),
      meta: body,
      req
    });
    realtime.emit('store:update', { action: 'updated', productId: String(product._id) });
    res.json({ ok: true, product: product.toJSON() });
  })
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('store:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const Product = require('../models/Product');
    const product = await Product.findById(req.params.id);
    if (!product) throw httpError(404, 'المنتج غير موجود', 'NOT_FOUND');
    await Product.deleteOne({ _id: product._id });
    await audit.log({
      actor: req.user,
      action: 'product.delete',
      description: `حذف منتج ${product.name}`,
      targetType: 'product',
      targetId: String(product._id),
      req
    });
    realtime.emit('store:update', { action: 'deleted', productId: String(product._id) });
    res.json({ ok: true });
  })
);

module.exports = router;
