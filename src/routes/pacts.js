const express = require('express');
const { asyncHandler } = require('../utils/http');
const { requireAuth, requirePermission } = require('../middleware/auth');
const pactService = require('../services/pact');
const { toCsv } = require('../utils/http');
const audit = require('../services/audit');

const router = express.Router();

router.get(
  '/',
  requireAuth,
  requirePermission('pacts:view'),
  asyncHandler(async (req, res) => {
    const data = await pactService.signatures();
    res.json(data);
  })
);

router.get(
  '/export',
  requireAuth,
  requirePermission('pacts:view'),
  asyncHandler(async (req, res) => {
    const data = await pactService.signatures();
    const csv = toCsv(data.signatures, [
      { label: 'الاسم', value: 'displayName' },
      { label: 'Discord ID', value: 'discordId' },
      { label: 'إصدار العقد', value: 'version' },
      { label: 'تاريخ التوقيع', value: (row) => new Date(row.signedAt).toISOString() },
      { label: 'البصمة', value: 'fingerprint' },
      { label: 'بصمة الجهاز', value: 'agentHash' }
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cortez-pacts-${data.version}.csv"`);
    res.send(csv);
  })
);

router.patch(
  '/content',
  requireAuth,
  requirePermission('pacts:manage'),
  asyncHandler(async (req, res) => {
    const { title, subtitle, text } = req.body || {};
    const pact = await pactService.updateContent({ title, subtitle, text, user: req.user, req });
    res.json({
      ok: true,
      pact,
      note: 'تم رفع إصدار العقد. سيُطلب من جميع الأعضاء إعادة التوقيع عند دخولهم القادم.'
    });
  })
);

module.exports = router;
