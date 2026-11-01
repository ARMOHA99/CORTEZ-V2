const express = require('express');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../utils/http');
const audit = require('../services/audit');

const router = express.Router();

function dbReady() {
  return require('mongoose').connection.readyState === 1;
}

function clean(body = {}) {
  const price = Math.round(Number(body.price));
  return {
    name: String(body.name || '').trim().slice(0, 120),
    category: String(body.category || 'عام').trim().slice(0, 60) || 'عام',
    price: Number.isFinite(price) && price >= 0 ? price : 0,
    note: String(body.note || '').trim().slice(0, 300),
    active: body.active !== false,
    order: Number(body.order) || 0
  };
}

/* عرض الكتالوج: لكل من يرى غرفة العمليات أو الأيتمات */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const allowed = ['items:view', 'items:manage', 'operations:view', 'operations:manage', 'system:admin'];
    if (!allowed.some((perm) => req.permissions.includes(perm))) throw httpError(403, 'لا تملك صلاحية عرض الأيتمات', 'FORBIDDEN');
    if (!dbReady()) return res.json({ items: [] });
    const Item = require('../models/Item');
    const query = req.query.all === '1' && req.permissions.some((p) => ['items:manage', 'system:admin'].includes(p)) ? {} : { active: true };
    const items = await Item.find(query).sort({ category: 1, order: 1, name: 1 }).lean();
    res.json({ items });
  })
);

router.post(
  '/',
  requireAuth,
  requirePermission('items:manage'),
  asyncHandler(async (req, res) => {
    const Item = require('../models/Item');
    const data = clean(req.body);
    if (!data.name) throw httpError(400, 'اسم الأيتم مطلوب', 'NAME_REQUIRED');
    if (await Item.findOne({ name: data.name })) throw httpError(409, 'يوجد أيتم بنفس الاسم', 'DUPLICATE');
    const item = await Item.create({ ...data, updatedByName: req.user.displayName || '' });
    await audit.log({ actor: req.user, action: 'item.create', description: `إضافة أيتم ${item.name}`, targetType: 'item', targetId: String(item._id), meta: { price: item.price }, req });
    res.status(201).json({ ok: true, item });
  })
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('items:manage'),
  asyncHandler(async (req, res) => {
    const Item = require('../models/Item');
    const item = await Item.findById(req.params.id);
    if (!item) throw httpError(404, 'الأيتم غير موجود', 'NOT_FOUND');
    const data = clean({ ...item.toObject(), ...req.body });
    if (!data.name) throw httpError(400, 'اسم الأيتم مطلوب', 'NAME_REQUIRED');
    const before = item.price;
    Object.assign(item, data, { updatedByName: req.user.displayName || '' });
    await item.save();
    await audit.log({ actor: req.user, action: 'item.update', description: `تحديث أيتم ${item.name}`, targetType: 'item', targetId: String(item._id), meta: { priceBefore: before, priceAfter: item.price }, req });
    res.json({ ok: true, item });
  })
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('items:manage'),
  asyncHandler(async (req, res) => {
    const Item = require('../models/Item');
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) throw httpError(404, 'الأيتم غير موجود', 'NOT_FOUND');
    await audit.log({ actor: req.user, action: 'item.delete', description: `حذف أيتم ${item.name}`, targetType: 'item', targetId: String(item._id), req });
    res.json({ ok: true });
  })
);

module.exports = router;
