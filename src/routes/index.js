const express = require('express');

const router = express.Router();

router.use('/public', require('./public'));
router.use('/me', require('./me'));
router.use('/dashboard', require('./dashboard'));
router.use('/duty', require('./duty'));
/* مسارات اختيارية: لا تُسقط الخادم إن لم تُرفع ملفاتها بعد */
function optional(path, handler) {
  try {
    router.use(path, require(handler));
  } catch (error) {
    console.warn(`[Routes] ${path} معطّل — ${handler}.js مفقود:`, error.message);
  }
}
optional('/streak', './streak');
optional('/push', './push');
router.use('/operations', require('./operations'));
router.use('/products', require('./products'));
router.use('/items', require('./items'));
router.use('/shop', require('./shop'));
router.use('/orders', require('./orders'));
router.use('/members', require('./members'));
router.use('/discipline', require('./discipline'));
router.use('/tickets', require('./tickets'));
router.use('/votes', require('./votes'));
router.use('/pacts', require('./pacts'));
router.use('/announcements', require('./announcements'));
router.use('/leaderboard', require('./leaderboard'));
router.use('/admin', require('./admin'));
router.use('/upload', require('./upload'));
router.use('/agent', require('./agent'));
router.use('/achievements', require('./achievements'));
router.use('/market', require('./market'));
router.use('/attendance', require('./attendance'));

module.exports = router;
