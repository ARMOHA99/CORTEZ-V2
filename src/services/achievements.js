/* ═══════════════════════ الأوسمة (Achievements) ═══════════════════════
   كل وسام له مفتاح ثابت، لون، شكل، أيقونة، ومقياس واحد يقاس عليه التقدّم.
   التقييم يقرأ بيانات العضو الفعلية (الدوام، العمليات، الانضباط، السوق، الرتبة)
   ثم يمنح الأوسمة المستحقة في مجموعة Badge. */

const config = require('../../config');

const TIER_META = {
  bronze: { label: 'برونزي', color: '#c98a4b', rank: 1 },
  silver: { label: 'فضي', color: '#c8d2dc', rank: 2 },
  gold: { label: 'ذهبي', color: '#f6c352', rank: 3 },
  legend: { label: 'أسطوري', color: '#22c55e', rank: 4 }
};

const CATALOG = [
  /* ── البداية ── */
  {
    key: 'blood_first',
    name: 'أول قطرة',
    desc: 'وقّعت عقد الدم وأصبح اسمك في السجل.',
    req: 'توقيع عقد الدم',
    metric: 'pact',
    target: 1,
    tier: 'bronze',
    icon: '🩸',
    shape: 'drop',
    color: '#22c55e',
    group: 'البداية'
  },
  {
    key: 'oath_keeper',
    name: 'حافظ العهد',
    desc: 'أعدت التوقيع على نسخة جديدة من العقد ولم تهرب من القسم.',
    req: 'إعادة التوقيع على نسخة ثانية من العقد',
    metric: 'pactVersion',
    target: 2,
    tier: 'silver',
    icon: '✒️',
    shape: 'hex',
    color: '#b56576',
    group: 'البداية'
  },
  {
    key: 'first_shift',
    name: 'أول وردية',
    desc: 'أول ساعة دوام رسمية داخل العائلة.',
    req: 'ساعة دوام واحدة',
    metric: 'dutyHours',
    target: 1,
    tier: 'bronze',
    icon: '⏱️',
    shape: 'circle',
    color: '#4cc9f0',
    group: 'البداية'
  },
  {
    key: 'first_op',
    name: 'أول عملية',
    desc: 'خرجت مع العائلة في أول عملية مسجّلة.',
    req: 'المشاركة في عملية واحدة',
    metric: 'operations',
    target: 1,
    tier: 'bronze',
    icon: '⚔️',
    shape: 'shield',
    color: '#7f8c8d',
    group: 'البداية'
  },
  {
    key: 'first_win',
    name: 'أول انتصار',
    desc: 'العملية انتهت لصالحك، والاسم بدأ يُذكر.',
    req: 'عملية ناجحة واحدة',
    metric: 'wins',
    target: 1,
    tier: 'silver',
    icon: '🏆',
    shape: 'star',
    color: '#f6c352',
    group: 'البداية'
  },
  {
    key: 'first_order',
    name: 'أول تعامل',
    desc: 'أول طلب مكتمل من المتجر الداخلي.',
    req: 'طلب مكتمل واحد',
    metric: 'ordersCompleted',
    target: 1,
    tier: 'bronze',
    icon: '🧾',
    shape: 'hex',
    color: '#2a9d8f',
    group: 'البداية'
  },

  /* ── الدوام ── */
  {
    key: 'duty_10',
    name: 'مثابر',
    desc: 'عشر ساعات في خدمة العائلة.',
    req: '10 ساعات دوام',
    metric: 'dutyHours',
    target: 10,
    tier: 'bronze',
    icon: '🔟',
    shape: 'circle',
    color: '#4cc9f0',
    group: 'الدوام'
  },
  {
    key: 'duty_50',
    name: 'عمود العائلة',
    desc: 'خمسون ساعة تجعلك من الأعمدة لا من الزوار.',
    req: '50 ساعة دوام',
    metric: 'dutyHours',
    target: 50,
    tier: 'silver',
    icon: '🏛️',
    shape: 'hex',
    color: '#8ecae6',
    group: 'الدوام'
  },
  {
    key: 'duty_100',
    name: 'مئة ساعة',
    desc: 'رقم لا يصل إليه إلا المخلصون.',
    req: '100 ساعة دوام',
    metric: 'dutyHours',
    target: 100,
    tier: 'gold',
    icon: '💯',
    shape: 'shield',
    color: '#f6c352',
    group: 'الدوام'
  },
  {
    key: 'duty_250',
    name: 'أسطورة الدوام',
    desc: 'مئتان وخمسون ساعة، اسمك صار مرادفًا للحضور.',
    req: '250 ساعة دوام',
    metric: 'dutyHours',
    target: 250,
    tier: 'legend',
    icon: '👑',
    shape: 'crown',
    color: '#22c55e',
    group: 'الدوام'
  },
  {
    key: 'duty_500',
    name: 'نصف الألف',
    desc: 'خمسمئة ساعة. لا أحد يصل هنا بالصدفة.',
    req: '500 ساعة دوام',
    metric: 'dutyHours',
    target: 500,
    tier: 'legend',
    icon: '🔥',
    shape: 'star',
    color: '#ff6b35',
    group: 'الدوام'
  },

  /* ── العمليات ── */
  {
    key: 'ops_10',
    name: 'منفّذ',
    desc: 'عشر عمليات، بدأت تعرف الطريق.',
    req: '10 عمليات',
    metric: 'operations',
    target: 10,
    tier: 'bronze',
    icon: '🎯',
    shape: 'diamond',
    color: '#e07a5f',
    group: 'العمليات'
  },
  {
    key: 'ops_25',
    name: 'مخلب',
    desc: 'خمس وعشرون عملية، الشارع يعرف اسمك.',
    req: '25 عملية',
    metric: 'operations',
    target: 25,
    tier: 'silver',
    icon: '🐾',
    shape: 'shield',
    color: '#adb5bd',
    group: 'العمليات'
  },
  {
    key: 'ops_50',
    name: 'سيف العائلة',
    desc: 'خمسون عملية، أنت السلاح الذي يُشهر عند الحاجة.',
    req: '50 عملية',
    metric: 'operations',
    target: 50,
    tier: 'gold',
    icon: '🗡️',
    shape: 'diamond',
    color: '#f4a261',
    group: 'العمليات'
  },
  {
    key: 'ops_100',
    name: 'رعب الشوارع',
    desc: 'مئة عملية. الأعداء يحسبون حسابك قبل أن تدخل.',
    req: '100 عملية',
    metric: 'operations',
    target: 100,
    tier: 'legend',
    icon: '💀',
    shape: 'crown',
    color: '#b5179e',
    group: 'العمليات'
  },
  {
    key: 'wins_25',
    name: 'غالب',
    desc: 'خمس وعشرون عملية ناجحة.',
    req: '25 عملية ناجحة',
    metric: 'wins',
    target: 25,
    tier: 'gold',
    icon: '🥇',
    shape: 'star',
    color: '#f6c352',
    group: 'العمليات'
  },

  /* ── الانضباط والولاء ── */
  {
    key: 'clean_30',
    name: 'سجل نقي',
    desc: 'ثلاثون يومًا ولم يُسجّل عليك إنذار واحد.',
    req: '30 يومًا في العائلة بدون إنذارات',
    metric: 'cleanDays',
    target: 30,
    tier: 'silver',
    icon: '🛡️',
    shape: 'shield',
    color: '#52b788',
    group: 'الانضباط'
  },
  {
    key: 'no_fines_60',
    name: 'بلا غرامات',
    desc: 'شهران كاملان والغرامات صفر.',
    req: '60 يومًا بدون غرامات',
    metric: 'cleanDays',
    target: 60,
    tier: 'gold',
    icon: '⚖️',
    shape: 'hex',
    color: '#2a9d8f',
    group: 'الانضباط'
  },
  {
    key: 'veteran_180',
    name: 'مخضرم',
    desc: 'ستة أشهر داخل العائلة، شهدت صعودها.',
    req: '180 يومًا من العضوية',
    metric: 'tenureDays',
    target: 180,
    tier: 'gold',
    icon: '🎖️',
    shape: 'diamond',
    color: '#c98a4b',
    group: 'الانضباط'
  },
  {
    key: 'veteran_365',
    name: 'عام من الولاء',
    desc: 'سنة كاملة، ولم يهتز القسم.',
    req: '365 يومًا من العضوية',
    metric: 'tenureDays',
    target: 365,
    tier: 'legend',
    icon: '🏵️',
    shape: 'crown',
    color: '#ff9e00',
    group: 'الانضباط'
  },

  /* ── السوق ── */
  {
    key: 'seller_first',
    name: 'أول بيع',
    desc: 'أول منتج تبيعه في سوق الأعضاء.',
    req: 'بيع واحد في سوق الأعضاء',
    metric: 'marketSales',
    target: 1,
    tier: 'bronze',
    icon: '🏷️',
    shape: 'hex',
    color: '#2a9d8f',
    group: 'السوق'
  },
  {
    key: 'seller_10',
    name: 'تاجر',
    desc: 'عشرة مبيعات في السوق الداخلي.',
    req: '10 مبيعات في سوق الأعضاء',
    metric: 'marketSales',
    target: 10,
    tier: 'silver',
    icon: '📦',
    shape: 'shield',
    color: '#457b9d',
    group: 'السوق'
  },
  {
    key: 'seller_earn',
    name: 'ثري العائلة',
    desc: 'أرباحك من السوق بلغت عشرة آلاف.',
    req: '10,000 من صافي أرباح السوق',
    metric: 'marketEarnings',
    target: 10000,
    tier: 'gold',
    icon: '💰',
    shape: 'diamond',
    color: '#f6c352',
    group: 'السوق'
  },
  {
    key: 'buyer_5',
    name: 'زبون دائم',
    desc: 'خمسة طلبات مكتملة من المتجر.',
    req: '5 طلبات مكتملة',
    metric: 'ordersCompleted',
    target: 5,
    tier: 'silver',
    icon: '🛒',
    shape: 'circle',
    color: '#48cae4',
    group: 'السوق'
  },

  /* ── الرتبة ── */
  {
    key: 'rank_member',
    name: 'عضو معتمد',
    desc: 'تجاوزت مرحلة الضيف وأصبحت عضوًا كاملًا.',
    req: 'الوصول إلى رتبة عضو',
    metric: 'rankLevel',
    target: 20,
    tier: 'bronze',
    icon: '🎗️',
    shape: 'circle',
    color: '#8d99ae',
    group: 'الرتبة'
  },
  {
    key: 'rank_business',
    name: 'رجل أعمال',
    desc: 'أدرت أموال العائلة وأصبح لك مكتب.',
    req: 'الوصول إلى رتبة الأعمال',
    metric: 'rankLevel',
    target: 60,
    tier: 'silver',
    icon: '💼',
    shape: 'hex',
    color: '#457b9d',
    group: 'الرتبة'
  },
  {
    key: 'rank_operations',
    name: 'قيادة العمليات',
    desc: 'أنت من يخطّط للعمليات لا من ينفّذها فقط.',
    req: 'الوصول إلى رتبة العمليات',
    metric: 'rankLevel',
    target: 80,
    tier: 'gold',
    icon: '🎖️',
    shape: 'shield',
    color: '#22c55e',
    group: 'الرتبة'
  },
  {
    key: 'rank_owner',
    name: 'العرش',
    desc: 'القمة. الإمبراطورية لا تُورَّث… تُنتزَع.',
    req: 'الوصول إلى رتبة المالك',
    metric: 'rankLevel',
    target: 100,
    tier: 'legend',
    icon: '♛',
    shape: 'crown',
    color: '#f6c352',
    group: 'الرتبة'
  }
];

const BY_KEY = new Map(CATALOG.map((item) => [item.key, item]));

function tierOf(tier) {
  return TIER_META[tier] || TIER_META.bronze;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/* ─────────── قياس بيانات العضو ─────────── */
async function measure(user) {
  const stats = (user && user.stats) || {};
  const minutes = Number(stats.totalMinutes) || 0;
  const tenureStart = user.joinedGuildAt || user.createdAt || new Date();
  const tenureDays = Math.max(0, Math.floor((Date.now() - new Date(tenureStart).getTime()) / 86400000));

  let ordersCompleted = 0;
  let marketSales = 0;
  let marketEarnings = 0;
  let rankLevel = 0;

  try {
    const Order = require('../models/Order');
    ordersCompleted = await Order.countDocuments({ user: user._id, status: 'completed' });
  } catch (error) {
    ordersCompleted = 0;
  }

  try {
    const MarketSale = require('../models/MarketSale');
    const totals = await MarketSale.aggregate([
      { $match: { seller: user._id } },
      { $group: { _id: null, count: { $sum: 1 }, net: { $sum: '$net' } } }
    ]);
    if (totals && totals.length) {
      marketSales = Number(totals[0].count) || 0;
      marketEarnings = Number(totals[0].net) || 0;
    }
  } catch (error) {
    marketSales = 0;
  }

  try {
    const ranksService = require('./ranks');
    const ranks = await ranksService.getRanks();
    const mine = ranks.find((rank) => rank.key === user.rank);
    rankLevel = mine ? Number(mine.level) || 0 : 0;
  } catch (error) {
    rankLevel = 0;
  }

  const warnings = Number(stats.warnings) || 0;
  const finesTotal = Number(stats.totalFines) || 0;

  return {
    pact: user.bloodPact && user.bloodPact.signed ? 1 : 0,
    pactVersion: Number(user.bloodPact && user.bloodPact.version) || 0,
    dutyHours: Math.round((minutes / 60) * 10) / 10,
    operations: Number(stats.operations) || 0,
    wins: Number(stats.wins) || 0,
    tenureDays,
    /* «أيام نظيفة»: العمر داخل العائلة يتحول إلى صفر عند وجود إنذار أو غرامة */
    cleanDays: warnings === 0 && finesTotal === 0 ? tenureDays : 0,
    ordersCompleted,
    marketSales,
    marketEarnings,
    rankLevel
  };
}

function progressOf(def, data) {
  const raw = Number(data[def.metric]) || 0;
  const progress = Math.max(0, Math.min(raw, def.target));
  return {
    raw,
    progress,
    target: def.target,
    percent: Math.max(0, Math.min(100, Math.round((progress / def.target) * 100))),
    unlocked: raw >= def.target
  };
}

function decorate(def, state) {
  const tier = tierOf(def.tier);
  return {
    key: def.key,
    name: def.name,
    desc: def.desc,
    req: def.req,
    group: def.group,
    icon: def.icon,
    shape: def.shape,
    color: def.color,
    tier: def.tier,
    tierLabel: tier.label,
    tierColor: tier.color,
    metric: def.metric,
    target: def.target,
    progress: state.progress,
    percent: state.percent,
    unlocked: state.unlocked,
    value: state.raw
  };
}

function summary(list) {
  const unlocked = list.filter((item) => item.unlocked);
  const byTier = {};
  for (const key of Object.keys(TIER_META)) byTier[key] = unlocked.filter((item) => item.tier === key).length;
  return {
    total: list.length,
    unlocked: unlocked.length,
    percent: list.length ? Math.round((unlocked.length / list.length) * 100) : 0,
    byTier
  };
}

async function forUser(user, options = {}) {
  const data = await measure(user);
  const list = CATALOG.map((def) => decorate(def, progressOf(def, data)));
  const result = { badges: list, stats: summary(list), measurements: data };
  if (options.award) result.awarded = await award(user, list);
  return result;
}

/* يمنح الأوسمة المستحقة غير الممنوحة بعد، ويُرجع المفاتيح الجديدة */
async function award(user, list = null) {
  const evaluated = list || (await forUser(user)).badges;
  const unlocked = evaluated.filter((item) => item.unlocked);
  if (!unlocked.length) return [];
  const Badge = require('../models/Badge');
  const existing = await Badge.find({ user: user._id }).select('key').lean();
  const owned = new Set(existing.map((row) => row.key));
  /* الأوسمة التي سحبها المسؤول لا تعود تلقائيًا */
  const blocked = new Set((user.badgeBlocklist || []).map(String));
  const fresh = unlocked.filter((item) => !owned.has(item.key) && !blocked.has(item.key));
  if (!fresh.length) return [];

  const created = [];
  for (const item of fresh) {
    try {
      const doc = await Badge.create({
        user: user._id,
        key: item.key,
        name: item.name,
        tier: item.tier,
        source: 'auto'
      });
      created.push(doc);
    } catch (error) {
      /* ممنوح مسبقًا (قيد فريد) */
    }
  }

  if (created.length) {
    try {
      const notify = require('./notify');
      await notify.push(user._id, {
        title: 'وسام جديد',
        body: created.length === 1 ? `حصلت على وسام «${created[0].name}»` : `حصلت على ${created.length} أوسمة جديدة`,
        type: 'success',
        link: '/#/achievements'
      });
    } catch (error) {
      /* ignore */
    }
  }

  return created.map((doc) => doc.key);
}

async function wallet(userId) {
  const Badge = require('../models/Badge');
  const rows = await Badge.find({ user: userId }).sort({ awardedAt: -1 }).lean();
  return rows;
}

async function leaders(limit = 8) {
  try {
    const Badge = require('../models/Badge');
    const User = require('../models/User');
    const rows = await Badge.aggregate([
      { $group: { _id: '$user', count: { $sum: 1 }, last: { $max: '$awardedAt' } } },
      { $sort: { count: -1, last: -1 } },
      { $limit: Math.max(1, Math.min(20, limit)) }
    ]);
    const users = await User.find({ _id: { $in: rows.map((row) => row._id) } })
      .select('displayName username avatar rank')
      .lean();
    const byId = new Map(users.map((item) => [String(item._id), item]));
    return rows
      .filter((row) => byId.has(String(row._id)))
      .map((row) => ({
        id: String(row._id),
        name: byId.get(String(row._id)).displayName || byId.get(String(row._id)).username || 'عضو',
        avatar: byId.get(String(row._id)).avatar || '',
        rank: byId.get(String(row._id)).rank || '',
        count: row.count
      }));
  } catch (error) {
    return [];
  }
}

async function grant({ userId, key, byUser = null, note = '' }) {
  const def = BY_KEY.get(key);
  if (!def) {
    const error = new Error('وسام غير معروف');
    error.status = 404;
    throw error;
  }
  const Badge = require('../models/Badge');
  return Badge.findOneAndUpdate(
    { user: userId, key },
    {
      $setOnInsert: {
        user: userId,
        key,
        name: def.name,
        tier: def.tier,
        source: 'manual',
        note: String(note || '').slice(0, 300),
        grantedBy: byUser ? byUser._id : null,
        grantedByName: byUser ? byUser.displayName || byUser.username || '' : '',
        awardedAt: new Date()
      }
    },
    { upsert: true, new: true }
  );
}

async function revoke({ userId, key, block = true }) {
  const Badge = require('../models/Badge');
  const User = require('../models/User');
  const def = BY_KEY.get(String(key));
  if (!def) {
    const error = new Error('وسام غير معروف');
    error.status = 404;
    throw error;
  }
  await Badge.deleteOne({ user: userId, key: def.key });
  if (block) await User.updateOne({ _id: userId }, { $addToSet: { badgeBlocklist: def.key } });
  try {
    const notify = require('./notify');
    await notify.push(userId, {
      title: 'سُحب وسام',
      body: `سُحب منك وسام «${def.name}»`,
      type: 'warning',
      link: '/#/achievements'
    });
  } catch (error) {
    /* ignore */
  }
  return true;
}

/* تصفير أوسمة عضو: تُمسح كلها وتُمنع من العودة تلقائيًا */
async function reset({ userId }) {
  const Badge = require('../models/Badge');
  const User = require('../models/User');
  const result = await Badge.deleteMany({ user: userId });
  await User.updateOne({ _id: userId }, { $set: { badgeBlocklist: CATALOG.map((item) => item.key) } });
  try {
    const notify = require('./notify');
    await notify.push(userId, {
      title: 'أُعيد تصفير أوسمتك',
      body: 'قامت القيادة بتصفير أوسمتك. تبدأ من جديد.',
      type: 'warning',
      link: '/#/achievements'
    });
  } catch (error) {
    /* ignore */
  }
  return { removed: result.deletedCount || 0 };
}

/* إعادة السماح بالمنح التلقائي (مسح قائمة المنع) */
async function allowAgain({ userId }) {
  const User = require('../models/User');
  const user = await User.findById(userId).select('badgeBlocklist').lean();
  const cleared = (user && user.badgeBlocklist ? user.badgeBlocklist.length : 0);
  await User.updateOne({ _id: userId }, { $set: { badgeBlocklist: [] } });
  return { cleared };
}

/* لوحة المسؤول: كل الأوسمة مع حالة العضو فيها */
async function manage(userId) {
  const Badge = require('../models/Badge');
  const User = require('../models/User');
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('العضو غير موجود');
    error.status = 404;
    throw error;
  }
  const [owned, evaluated] = await Promise.all([wallet(userId), forUser(user)]);
  const ownedMap = new Map(owned.map((row) => [row.key, row]));
  const blocked = new Set((user.badgeBlocklist || []).map(String));
  const items = evaluated.badges.map((badge) => ({
    key: badge.key,
    name: badge.name,
    desc: badge.desc,
    icon: badge.icon,
    color: badge.color,
    tier: badge.tier,
    group: badge.group,
    percent: badge.percent,
    unlocked: badge.unlocked,
    owned: ownedMap.has(badge.key),
    blocked: blocked.has(badge.key),
    awardedAt: ownedMap.has(badge.key) ? ownedMap.get(badge.key).awardedAt : null,
    source: ownedMap.has(badge.key) ? ownedMap.get(badge.key).source : null
  }));
  return {
    member: {
      _id: String(user._id),
      name: user.displayName || user.username || 'عضو',
      rank: user.rank || '',
      avatar: user.avatar || ''
    },
    items,
    ownedCount: items.filter((item) => item.owned).length,
    blockedCount: items.filter((item) => item.blocked).length
  };
}

module.exports = {
  CATALOG,
  TIER_META,
  BY_KEY,
  currency: config.system.currencyLabel,
  measure,
  forUser,
  award,
  wallet,
  leaders,
  grant,
  revoke,
  reset,
  allowAgain,
  manage,
  addDays
};
