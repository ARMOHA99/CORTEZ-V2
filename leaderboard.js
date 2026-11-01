const express = require('express');
const { asyncHandler } = require('../utils/http');
const { requireAuth, requirePermission } = require('../middleware/auth');
const leaderboardService = require('../services/leaderboard');

const router = express.Router();

router.get(
  '/',
  requireAuth,
  requirePermission('leaderboard:view'),
  asyncHandler(async (req, res) => {
    const data = await leaderboardService.build({
      limit: req.query.limit || 25,
      weekKey: req.query.week || null
    });
    res.json(data);
  })
);

module.exports = router;
