const express = require('express');
const crypto = require('crypto');
const { asyncHandler, httpError } = require('../utils/http');
const { requireAuth } = require('../middleware/auth');
const audit = require('../services/audit');
const agent = require('../services/agent');

const router = express.Router();

/* حد بسيط لمنع التخمين على رمز الربط */
const attempts = new Map();
function throttle(ip) {
  const now = Date.now();
  const key = String(ip || 'unknown');
  const row = attempts.get(key) || { count: 0, resetAt: now + 60000 };
  if (now > row.resetAt) {
    row.count = 0;
    row.resetAt = now + 60000;
  }
  row.count += 1;
  attempts.set(key, row);
  if (attempts.size > 1000) {
    for (const [k, v] of attempts) if (now > v.resetAt) attempts.delete(k);
  }
  return row.count <= 20;
}

function ipHash(req) {
  return crypto.createHash('sha256').update(String(req.ip || '')).digest('hex').slice(0, 32);
}

/* حالة جهاز العضو (الموقع يستخدمها للبوابة) */
router.get(
  '/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await agent.statusFor(req.user));
  })
);

/* رمز ربط جديد */
router.post(
  '/code',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await agent.createCode(req.user);
    res.json({ ok: true, ...data });
  })
);

/* الربط من التطبيق (بدون جلسة: الرمز نفسه هو التصريح) */
router.post(
  '/link',
  asyncHandler(async (req, res) => {
    if (!throttle(req.ip)) throw httpError(429, 'محاولات كثيرة. انتظر دقيقة.', 'TOO_MANY');
    const body = req.body || {};
    const result = await agent.link(
      {
        code: body.code,
        deviceId: body.deviceId,
        label: body.label,
        platform: body.platform,
        version: body.version
      },
      ipHash(req)
    );
    await audit
      .log({
        action: 'agent.link',
        description: `ربط جهاز جديد: ${body.label || 'جهاز'}`,
        targetType: 'user',
        targetId: '',
        meta: { deviceId: String(body.deviceId || '').slice(0, 60) }
      })
      .catch(() => null);
    res.json({ ok: true, ...result });
  })
);

/* نبضة التطبيق */
router.post(
  '/heartbeat',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const result = await agent.heartbeat(
      { token: body.token, connected: body.connected, verified: body.verified, version: body.version, diag: body.diag },
      ipHash(req)
    );
    res.json(result);
  })
);

/* إلغاء دوام بدأ من التطبيق بالخطأ */
router.post(
  '/cancel-shift',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await agent.cancelOwnShift(req.user));
  })
);

/* إلغاء ربط جهاز */
router.delete(
  '/device/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await agent.unlink(req.user, req.params.id);
    res.json(result);
  })
);

/* تحميل التطبيق: نوجّه لرابط التنزيل المضبوط */
router.get(
  '/download',
  asyncHandler(async (req, res) => {
    const c = await agent.cfg();
    res.redirect(c.downloadUrl || '/download/CortezAgent.exe');
  })
);

module.exports = router;
