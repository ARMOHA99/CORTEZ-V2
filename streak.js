const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../utils/http');
const streakService = require('../services/streak');

const router = express.Router();

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const streak = await streakService.compute(req.user._id);
    res.json({ streak, at: new Date().toISOString() });
  })
);

/* عام: يُستخدم في صفحة المشاركة /u/:id والبطاقة */
router.get(
  '/u/:id',
  asyncHandler(async (req, res) => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.json({ streak: null, db: false });
    }
    const User = require('../models/User');
    const raw = String(req.params.id || '').trim();
    const query = mongoose.isValidObjectId(raw) ? { _id: raw } : { discordId: raw };
    const user = await User.findOne(query).select('_id inGuild blocked').lean();
    if (!user) throw httpError(404, 'العضو غير موجود', 'NOT_FOUND');
    if (user.blocked || !user.inGuild) return res.json({ streak: null });
    const streak = await streakService.compute(user._id);
    res.json({ streak, at: new Date().toISOString() });
  })
);

module.exports = router;
