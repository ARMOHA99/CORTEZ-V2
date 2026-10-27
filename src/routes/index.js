const express = require('express');

const router = express.Router();

router.use('/public', require('./public'));
router.use('/me', require('./me'));
router.use('/dashboard', require('./dashboard'));
router.use('/duty', require('./duty'));
router.use('/operations', require('./operations'));
router.use('/treasury', require('./treasury'));
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

module.exports = router;
