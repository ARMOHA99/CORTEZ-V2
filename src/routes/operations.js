const express = require('express');
const { asyncHandler, httpError } = require('../utils/http');
const { requireAuth, requirePermission } = require('../middleware/auth');
const operationsService = require('../services/operations');
const audit = require('../services/audit');

const router = express.Router();

router.get(
  '/',
  requireAuth,
  requirePermission('operations:view'),
  asyncHandler(async (req, res) => {
    const data = await operationsService.listOperations({
      page: req.query.page,
      limit: req.query.limit,
      result: req.query.result,
      type: req.query.type,
      search: req.query.search
    });
    res.json(data);
  })
);

router.get(
  '/stats',
  requireAuth,
  requirePermission('operations:view'),
  asyncHandler(async (req, res) => {
    const stats = await operationsService.operationStats();
    const goalService = require('../services/goal');
    let goal = null;
    try {
      const context = await goalService.weekContext();
      const goalData = await goalService.getCurrentGoal({ create: true });
      goal = goalService.serializeGoal(goalData.goal, context);
    } catch (error) {
      goal = null;
    }
    res.json({ stats, goal });
  })
);

router.get(
  '/:id',
  requireAuth,
  requirePermission('operations:view'),
  asyncHandler(async (req, res) => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const Operation = require('../models/Operation');
    const operation = await Operation.findById(req.params.id).lean();
    if (!operation) throw httpError(404, 'العملية غير موجودة', 'NOT_FOUND');
    res.json({ operation });
  })
);

router.post(
  '/',
  requireAuth,
  requirePermission('operations:manage'),
  asyncHandler(async (req, res) => {
    const operation = await operationsService.createOperation({ data: req.body || {}, user: req.user });
    await audit.log({
      actor: req.user,
      action: 'operation.create',
      description: `تسجيل عملية ${operation.code} — ${operation.title} (${operation.result === 'win' ? 'فوز' : 'خسارة'})`,
      targetType: 'operation',
      targetId: String(operation._id),
      meta: {
        result: operation.result,
        netValue: operation.netValue,
        lostValue: operation.lostValue,
        goalDelta: operation.goalDelta
      },
      req
    });
    res.status(201).json({ ok: true, operation: operation.toJSON() });
  })
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('operations:manage'),
  asyncHandler(async (req, res) => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const Operation = require('../models/Operation');
    const operation = await Operation.findById(req.params.id).lean();
    if (!operation) throw httpError(404, 'العملية غير موجودة', 'NOT_FOUND');
    await operationsService.deleteOperation(req.params.id, req.user);
    await audit.log({
      actor: req.user,
      action: 'operation.delete',
      description: `حذف عملية ${operation.code} — ${operation.title}`,
      targetType: 'operation',
      targetId: req.params.id,
      req
    });
    res.json({ ok: true });
  })
);

module.exports = router;
