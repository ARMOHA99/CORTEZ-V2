const goalService = require('./goal');
const { getRanks } = require('./ranks');

function mongooseReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

async function build({ limit = 20, weekKey = null } = {}) {
  if (!mongooseReady()) return { weekKey: weekKey || '', items: [], metrics: [] };
  const User = require('../models/User');
  const Shift = require('../models/Shift');
  const Operation = require('../models/Operation');
  const context = await goalService.weekContext();
  const targetWeek = weekKey || context.weekKey;

  const [users, dutyRows, penaltyRows, operations, ranks] = await Promise.all([
    User.find({ blocked: false, inGuild: true, rank: { $ne: 'guest' } })
      .select('displayName username avatar rank stats')
      .lean(),
    Shift.aggregate([
      { $match: { kind: 'shift', weekKey: targetWeek, status: 'closed' } },
      { $group: { _id: '$user', minutes: { $sum: '$totalMinutes' }, shifts: { $sum: 1 } } }
    ]),
    Shift.aggregate([
      { $match: { kind: 'penalty', weekKey: targetWeek } },
      { $group: { _id: '$user', minutes: { $sum: '$penaltyMinutes' } } }
    ]),
    Operation.find({ weekKey: targetWeek }).select('participants result').lean(),
    getRanks()
  ]);

  const dutyMap = new Map(dutyRows.map((row) => [String(row._id), row]));
  const penaltyMap = new Map(penaltyRows.map((row) => [String(row._id), row.minutes || 0]));
  const opsMap = new Map();
  for (const operation of operations) {
    for (const participant of operation.participants || []) {
      const key = String(participant);
      if (!opsMap.has(key)) opsMap.set(key, { total: 0, wins: 0, losses: 0 });
      const entry = opsMap.get(key);
      entry.total += 1;
      if (operation.result === 'win') entry.wins += 1;
      else entry.losses += 1;
    }
  }
  const rankMap = new Map(ranks.map((rank) => [rank.key, rank]));

  const items = users.map((user) => {
    const key = String(user._id);
    const duty = dutyMap.get(key) || { minutes: 0, shifts: 0 };
    const penalty = penaltyMap.get(key) || 0;
    const ops = opsMap.get(key) || { total: 0, wins: 0, losses: 0 };
    const activeDays = new Set();
    const score =
      Math.max(0, duty.minutes - penalty) + ops.wins * 120 + ops.total * 30 + duty.shifts * 15;
    const rank = rankMap.get(user.rank);
    return {
      _id: user._id,
      name: user.displayName || user.username || 'عضو',
      avatar: user.avatar || '',
      rank: user.rank,
      rankName: rank ? rank.name : user.rank,
      rankColor: rank ? rank.color : '#9b9296',
      rankIcon: rank ? rank.icon : '◆',
      level: rank ? rank.level : 0,
      minutes: Math.max(0, duty.minutes - penalty),
      shifts: duty.shifts,
      penaltyMinutes: penalty,
      operations: ops.total,
      wins: ops.wins,
      losses: ops.losses,
      score,
      activeDays: activeDays.size
    };
  });

  items.sort((a, b) => b.score - a.score || b.wins - a.wins || b.minutes - a.minutes);
  const ranked = items.slice(0, Math.max(1, Math.min(100, Number(limit) || 20))).map((item, index) => ({
    ...item,
    position: index + 1
  }));

  return {
    weekKey: targetWeek,
    weekEnd: require('../utils/time').addDaysToKey(targetWeek, 6),
    items: ranked,
    metrics: [
      { key: 'duty', label: 'ساعات الدوام' },
      { key: 'operations', label: 'العمليات' },
      { key: 'wins', label: 'الانتصارات' },
      { key: 'penalty', label: 'العقوبات' }
    ],
    total: items.length
  };
}

module.exports = { build };
