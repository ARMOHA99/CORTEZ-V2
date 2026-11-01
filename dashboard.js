const express = require('express');
const config = require('../../config');
const { asyncHandler } = require('../utils/http');
const { requireAuth } = require('../middleware/auth');
const goalService = require('../services/goal');
const dutyService = require('../services/duty');
const operationsService = require('../services/operations');
const treasuryService = require('../services/treasury');
const pactService = require('../services/pact');
const leaderboardService = require('../services/leaderboard');
const time = require('../utils/time');
const realtime = require('../realtime');

const router = express.Router();

function dbReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

function can(permissions, permission) {
  return permissions.includes(permission) || permissions.includes('system:admin');
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const permissions = req.permissions || [];
    const context = await goalService.weekContext();
    const goalData = await goalService.getCurrentGoal({ create: true });
    const mySummary = await dutyService.personalSummary(req.user._id);

    const nightState = {
      ...context.nightShift,
      lockedNow: time.inNightWindow(new Date(), config.system.timezone, context.nightShift),
      dayStartHour: context.dayStartHour
    };

    if (!dbReady()) {
      return res.json({
        stats: {
          members: 0,
          online: 0,
          onDuty: 0,
          onBreak: 0,
          weeklyMinutes: 0,
          operations: 0,
          wins: 0,
          losses: 0,
          winRate: 0
        },
        goal: goalService.serializeGoal(goalData.goal, context),
        announcements: [],
        recentOperations: [],
        dutyNow: [],
        myDuty: mySummary,
        nightShift: nightState,
        treasury: null,
        counts: { pendingOrders: 0, openVotes: 0, unsignedPacts: 0, openTickets: 0 },
        top: [],
        week: { weekKey: context.weekKey, weekDays: time.weekDays(context.weekKey), timezone: context.timezone },
        generatedAt: new Date().toISOString()
      });
    }

    const User = require('../models/User');
    const Shift = require('../models/Shift');
    const Operation = require('../models/Operation');
    const Announcement = require('../models/Announcement');
    const Order = require('../models/Order');
    const Vote = require('../models/Vote');
    const Ticket = require('../models/Ticket');

    const showOperations = can(permissions, 'operations:view');
    const showTreasury = can(permissions, 'treasury:view');
    const showPacts = can(permissions, 'pacts:view');
    const showVotes = can(permissions, 'votes:view');
    const showLeaderboard = can(permissions, 'leaderboard:view');

    const [members, activeShifts, weeklyRow, weeklyPenalty, announcements, recentOperations, pendingOrders, openVotes, unsignedPacts, openTickets, opsStats, treasury, top] =
      await Promise.all([
        User.countDocuments({ inGuild: true, blocked: false }),
        Shift.find({ status: { $in: ['active', 'paused'] } })
          .select('user userSnapshot startAt status breaks breakMinutes')
          .lean(),
        Shift.aggregate([
          { $match: { kind: 'shift', weekKey: context.weekKey } },
          { $group: { _id: null, minutes: { $sum: '$totalMinutes' } } }
        ]),
        Shift.aggregate([
          { $match: { kind: 'penalty', weekKey: context.weekKey } },
          { $group: { _id: null, minutes: { $sum: '$penaltyMinutes' } } }
        ]),
        Announcement.find({ active: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
          .sort({ pinned: -1, createdAt: -1 })
          .limit(6)
          .lean(),
        showOperations
          ? Operation.find({}).sort({ createdAt: -1 }).limit(6).lean()
          : Promise.resolve([]),
        Order.countDocuments({ status: 'pending' }),
        showVotes ? Vote.countDocuments({ status: 'open' }) : Promise.resolve(0),
        showPacts ? pactService.unresolvedCount() : Promise.resolve(0),
        Ticket.countDocuments({ status: 'pending' }),
        showOperations ? operationsService.operationStats() : Promise.resolve({ total: 0, wins: 0, losses: 0, winRate: 0, netValue: 0 }),
        showTreasury ? treasuryService.totals() : Promise.resolve(null),
        showLeaderboard
          ? leaderboardService.build({ limit: 5 })
          : Promise.resolve({ items: [] })
      ]);

    const activeLive = activeShifts.reduce((sum, shift) => sum + dutyService.liveMinutes(shift), 0);
    const weeklyMinutes = Math.max(0, (weeklyRow[0]?.minutes || 0) + activeLive);
    const weeklyPenaltyMinutes = weeklyPenalty[0]?.minutes || 0;

    const ranks = await require('../services/ranks').getRanks();
    const rankMap = new Map(ranks.map((rank) => [rank.key, rank]));
    const dutyNow = activeShifts.slice(0, 12).map((shift) => {
      const rank = rankMap.get(shift.userSnapshot ? shift.userSnapshot.rank : '');
      return {
        userId: shift.user,
        name: shift.userSnapshot ? shift.userSnapshot.name : 'عضو',
        status: shift.status,
        since: shift.startAt,
        minutes: dutyService.liveMinutes(shift),
        rankColor: rank ? rank.color : '#9b9296'
      };
    });

    res.json({
      stats: {
        members,
        online: realtime.onlineCount(),
        onDuty: activeShifts.filter((shift) => shift.status === 'active').length,
        onBreak: activeShifts.filter((shift) => shift.status === 'paused').length,
        weeklyMinutes,
        weeklyPenaltyMinutes,
        operations: opsStats.total,
        wins: opsStats.wins,
        losses: opsStats.losses,
        winRate: opsStats.winRate,
        netValue: opsStats.netValue
      },
      goal: goalService.serializeGoal(goalData.goal, context),
      announcements,
      recentOperations,
      dutyNow,
      myDuty: mySummary,
      nightShift: nightState,
      treasury,
      counts: {
        pendingOrders,
        openVotes,
        unsignedPacts,
        openTickets
      },
      top: top.items || [],
      week: {
        weekKey: context.weekKey,
        weekDays: time.weekDays(context.weekKey),
        weekStartDay: context.weekStartDay,
        timezone: context.timezone
      },
      generatedAt: new Date().toISOString()
    });
  })
);

router.get(
  '/announcements',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbReady()) return res.json({ items: [] });
    const Announcement = require('../models/Announcement');
    const items = await Announcement.find({
      active: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
    })
      .sort({ pinned: -1, createdAt: -1 })
      .limit(30)
      .lean();
    res.json({ items });
  })
);

module.exports = router;
