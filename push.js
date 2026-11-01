const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../utils/http');
const pushService = require('../services/push');

const router = express.Router();

router.get('/key', (req, res) => {
  res.json({
    enabled: pushService.isEnabled(),
    key: pushService.publicKey()
  });
});

router.post(
  '/subscribe',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!pushService.isEnabled()) {
      throw httpError(503, 'إشعارات الويب غير مهيّأة على الخادم (مفاتيح VAPID مفقودة)', 'PUSH_DISABLED');
    }
    const subscription = req.body?.subscription || req.body;
    const count = await pushService.subscribe(req.user, subscription, req.get('user-agent') || '');
    res.json({ ok: true, subscriptions: count });
  })
);

router.post(
  '/unsubscribe',
  requireAuth,
  asyncHandler(async (req, res) => {
    const count = await pushService.unsubscribe(req.user, req.body?.endpoint || '');
    res.json({ ok: true, subscriptions: count });
  })
);

router.post(
  '/test',
  requireAuth,
  asyncHandler(async (req, res) => {
    const sent = await pushService.sendToUser(req.user._id, {
      title: 'CORTEZ',
      body: 'الإشعارات تعمل. سنخبرك بالدوام والتحذيرات والتصويتات فور صدورها.',
      url: '/#/profile'
    });
    res.json({ ok: sent > 0, sent });
  })
);

module.exports = router;
