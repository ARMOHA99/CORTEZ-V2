const dutyService = require('./duty');
const config = require('../../config');

async function build(userId, viewer = null) {
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) return null;
  const User = require('../models/User');
  const Discipline = require('../models/Discipline');
  const { getRank } = require('./ranks');

  const user = await User.findById(userId);
  if (!user) return null;

  const [rank, summary, disciplines, activeWarnings, activeFines] = await Promise.all([
    getRank(user.rank),
    dutyService.personalSummary(user._id),
    Discipline.find({ user: user._id }).sort({ createdAt: -1 }).limit(6).lean(),
    Discipline.countDocuments({ user: user._id, type: 'warning', status: 'active' }),
    Discipline.find({ user: user._id, type: 'fine', status: 'active' }).select('amount').lean()
  ]);

  const operations = user.stats ? user.stats.operations || 0 : 0;
  const wins = user.stats ? user.stats.wins || 0 : 0;
  const losses = user.stats ? user.stats.losses || 0 : 0;

  return {
    user: {
      _id: user._id,
      discordId: user.discordId,
      name: user.displayName || user.username || 'عضو',
      username: user.username,
      avatar: user.avatar,
      avatarUrl: user.avatarUrl,
      joinedAt: user.joinedGuildAt || user.createdAt,
      lastLogin: user.lastLogin,
      status: user.duty ? user.duty.status : 'off'
    },
    rank: rank
      ? {
          key: rank.key,
          name: rank.name,
          short: rank.short,
          level: rank.level,
          color: rank.color,
          icon: rank.icon
        }
      : null,
    duty: {
      weeklyMinutes: summary.weeklyMinutes,
      monthlyMinutes: summary.monthlyMinutes,
      totalMinutes: summary.totalMinutes,
      todayMinutes: summary.todayMinutes,
      weeklyPenaltyMinutes: summary.weeklyPenaltyMinutes,
      presentDays: summary.days.filter((day) => day.minutes > 0).length
    },
    operations: {
      total: operations,
      wins,
      losses,
      winRate: operations ? Math.round((wins / operations) * 100) : 0
    },
    discipline: {
      warnings: activeWarnings,
      finesCount: activeFines.length,
      totalFines: activeFines.reduce((sum, fine) => sum + (fine.amount || 0), 0),
      records: disciplines.map((record) => ({
        _id: record._id,
        type: record.type,
        reason: record.reason,
        amount: record.amount,
        status: record.status,
        createdAt: record.createdAt,
        issuedByName: record.issuedByName
      }))
    },
    inventory: (user.inventory || []).map((item) => ({
      name: item.name,
      qty: item.qty,
      note: item.note
    })),
    bloodPact: {
      signed: Boolean(user.bloodPact && user.bloodPact.signed),
      version: user.bloodPact ? user.bloodPact.version : 0,
      signedAt: user.bloodPact ? user.bloodPact.signedAt : null
    },
    motto: config.org.motto,
    org: 'CORTEZ',
    generatedAt: new Date().toISOString()
  };
}

module.exports = { build };
