const express = require('express');
const { asyncHandler, httpError } = require('../utils/http');
const { requireAuth, requirePermission } = require('../middleware/auth');
const treasuryService = require('../services/treasury');
const audit = require('../services/audit');

const router = express.Router();

router.get(
  '/',
  requireAuth,
  requirePermission('treasury:view'),
  asyncHandler(async (req, res) => {
    const data = await treasuryService.summary({
      limit: req.query.limit,
      days: req.query.days
    });
    res.json({ treasury: data });
  })
);

router.post(
  '/transaction',
  requireAuth,
  requirePermission('treasury:manage'),
  asyncHandler(async (req, res) => {
    const { type, amount, category, description } = req.body || {};
    if (!description || !String(description).trim()) {
      throw httpError(400, 'وصف الحركة مطلوب', 'DESCRIPTION_REQUIRED');
    }
    const transaction = await treasuryService.record({
      type,
      amount,
      category: category || 'manual',
      description,
      refType: 'manual',
      user: req.user
    });
    await audit.log({
      actor: req.user,
      action: 'treasury.transaction',
      description: `${type === 'income' ? 'إيداع' : 'سحب'} ${transaction.amount} — ${transaction.description}`,
      targetType: 'transaction',
      targetId: String(transaction._id),
      meta: { type, amount: transaction.amount, balanceAfter: transaction.balanceAfter },
      req
    });
    res.status(201).json({ ok: true, transaction: transaction.toJSON() });
  })
);

module.exports = router;
