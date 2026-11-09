const goalService = require('./goal');
const { getRanks } = require('./ranks');

function mongooseReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

/* رابط صورة العضو من ديسكورد (كانت الصفحة تبني الرابط بمعرّف قاعدة البيانات فيفشل التحميل) */
function avatarUrlOf(user) {
  if (!user || !user.avatar || !user.discordId) return '';
  const ext = String(user.avatar).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.${ext}?size=128`;
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
      .select('discordId nick displayName globalName username avatar rank stats')
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
      name: user.nick || user.displayName || user.globalName || user.username || 'عضو',
      avatar: user.avatar || '',
      discordId: user.discordId || '',
      avatarUrl: avatarUrlOf(user),
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

  /* احتياط: لو ما ظهر أحد (مثلاً inGuild لم يُحدَّث بعد) نعرض كل الأعضاء المعتمدين */
  if (!items.length) {
    const fallbackUsers = await User.find({ blocked: false, rank: { $ne: 'guest' } })
      .select('nick displayName globalName username avatar rank')
      .lean();
    for (const user of fallbackUsers) {
      const rank = rankMap.get(user.rank);
      items.push({
        _id: user._id,
        name: user.nick || user.displayName || user.globalName || user.username || 'عضو',
        avatar: user.avatar || '',
        discordId: user.discordId || '',
        avatarUrl: avatarUrlOf(user),
        rank: user.rank,
        rankName: rank ? rank.name : user.rank,
        rankColor: rank ? rank.color : '#9b9296',
        rankIcon: rank ? rank.icon : '◆',
        level: rank ? rank.level : 0,
        minutes: 0, shifts: 0, penaltyMinutes: 0, operations: 0, wins: 0, losses: 0, score: 0, activeDays: 0
      });
    }
    console.log(`[Leaderboard] لا أحد في فلتر الدوام — استخدمت ${items.length} عضوًا احتياطيًا`);
  }
  /* طبقة ثالثة: لو ما زال فارغًا (الكل guest) نعرض غير المحظورين */
  if (!items.length) {
    const anyone = await User.find({ blocked: false }).select('discordId nick displayName globalName username avatar rank').lean();
    for (const user of anyone) {
      const rank = rankMap.get(user.rank);
      items.push({
        _id: user._id,
        name: user.nick || user.displayName || user.globalName || user.username || 'عضو',
        avatar: user.avatar || '',
        discordId: user.discordId || '',
        avatarUrl: avatarUrlOf(user),
        rank: user.rank,
        rankName: rank ? rank.name : user.rank,
        rankColor: rank ? rank.color : '#9b9296',
        rankIcon: rank ? rank.icon : '◆',
        level: rank ? rank.level : 0,
        minutes: 0, shifts: 0, penaltyMinutes: 0, operations: 0, wins: 0, losses: 0, score: 0, activeDays: 0
      });
    }
    console.log(`[Leaderboard] لا أحد في الفلتر الأساسي — عرضت ${items.length} عضوًا مسجّلًا`);
  }
  const nameless = items.filter((item) => !item.name || item.name === 'عضو').length;
  if (nameless) console.log(`[Leaderboard] ${nameless} عضو بلا اسم معروف (الأسبوع ${targetWeek})`);

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
