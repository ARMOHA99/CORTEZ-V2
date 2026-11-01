/* ═══════════════════════ سوق الأعضاء ═══════════════════════
   يسمح للعضو بعرض منتجاته في المتجر الداخلي ضمن حدود يحددها القائد:
   عدد الإعلانات في الأسبوع، نسبة العمولة، حدود السعر، مدة العرض، والموافقة. */

const settingsService = require('./settings');
const treasuryService = require('./treasury');
const images = require('../utils/images');
const config = require('../../config');

const ALLOWED_CATEGORIES = ['weapon', 'drug', 'gear', 'vehicle', 'service', 'other'];

function httpError(status, message, code = '') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function mongooseReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

function num(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/* ─────────── الحدود القادمة من الإعدادات ─────────── */
async function limits() {
  const settings = await settingsService.getAll();
  return {
    enabled: settings['market.enabled'] !== false,
    maxPerWeek: num(settings['market.maxPerWeek'], 2, 0, 50),
    commissionPercent: num(settings['market.commissionPercent'], 10, 0, 50),
    requireApproval: settings['market.requireApproval'] !== false,
    maxQty: num(settings['market.maxQty'], 5, 1, 99),
    durationDays: num(settings['market.durationDays'], 14, 1, 90),
    minPrice: num(settings['market.minPrice'], 1, 1, 1000000),
    maxPrice: num(settings['market.maxPrice'], 100000, 1, 100000000),
    minRankLevel: num(settings['market.minRankLevel'], 20, 0, 1000),
    weekStartDay: num(settings['system.weekStartDay'], 6, 0, 6)
  };
}

/* مفتاح الأسبوع حسب بداية الأسبوع المضبوطة في الإعدادات */
function weekKey(date = new Date(), weekStartDay = 6) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day - weekStartDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${dayOfMonth}`;
}

async function rankLevelOf(user) {
  try {
    const ranksService = require('./ranks');
    const ranks = await ranksService.getRanks();
    const mine = ranks.find((rank) => rank.key === user.rank);
    return mine ? Number(mine.level) || 0 : 0;
  } catch (error) {
    return 0;
  }
}

/* ─────────── استهلاك حصة الأسبوع ─────────── */
async function usage(sellerId, limitsOverride = null) {
  const bounds = limitsOverride || (await limits());
  const key = weekKey(new Date(), bounds.weekStartDay);
  const MarketListing = require('../models/MarketListing');
  const used = await MarketListing.countDocuments({
    seller: sellerId,
    weekKey: key,
    status: { $nin: ['cancelled', 'rejected'] }
  });
  return {
    weekKey: key,
    used,
    max: bounds.maxPerWeek,
    remaining: Math.max(0, bounds.maxPerWeek - used)
  };
}

/* إغلاق الإعلانات المنتهية قبل أي قراءة */
async function expireOld() {
  if (!mongooseReady()) return;
  try {
    const MarketListing = require('../models/MarketListing');
    await MarketListing.updateMany(
      { status: { $in: ['active', 'pending'] }, expiresAt: { $ne: null, $lt: new Date() } },
      { $set: { status: 'expired' } }
    );
  } catch (error) {
    /* ignore */
  }
}

async function create({ user, body = {} }) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const bounds = await limits();
  if (!bounds.enabled) throw httpError(403, 'سوق الأعضاء مغلق حالياً', 'MARKET_OFF');

  const level = await rankLevelOf(user);
  if (level < bounds.minRankLevel) {
    throw httpError(403, 'سوق الأعضاء متاح للأعضاء المعتمدين فقط', 'MARKET_RANK');
  }

  const quota = await usage(user._id, bounds);
  if (bounds.maxPerWeek <= 0) throw httpError(403, 'عرض المنتجات في السوق غير مسموح حالياً', 'MARKET_QUOTA_OFF');
  if (quota.remaining <= 0) {
    throw httpError(429, `استهلكت حصتك لهذا الأسبوع (${quota.max} إعلان). تتجدد في بداية الأسبوع القادم.`, 'MARKET_QUOTA');
  }

  const name = String(body.name || '').trim().slice(0, 120);
  if (name.length < 3) throw httpError(400, 'اسم المنتج قصير جدًا', 'INVALID_NAME');

  const price = Math.round(Number(body.price) || 0);
  if (price < bounds.minPrice || price > bounds.maxPrice) {
    throw httpError(400, `السعر يجب أن يكون بين ${bounds.minPrice} و ${bounds.maxPrice} ${config.system.currencyLabel}`, 'INVALID_PRICE');
  }

  const qty = num(body.qty, 1, 1, bounds.maxQty);
  const category = ALLOWED_CATEGORIES.includes(body.category) ? body.category : 'other';
  const image = images.validateImage(body.image, 'رابط صورة المنتج غير صالح');
  const gallery = images.validateGallery(body.gallery || [], 'رابط صورة غير صالح في المعرض');
  const description = String(body.description || '').slice(0, 600);

  const MarketListing = require('../models/MarketListing');
  const status = bounds.requireApproval ? 'pending' : 'active';
  const listing = await MarketListing.create({
    seller: user._id,
    sellerName: user.displayName || user.username || 'عضو',
    name,
    description,
    category,
    price,
    qty,
    remaining: qty,
    image,
    gallery,
    weekKey: quota.weekKey,
    status,
    expiresAt: new Date(Date.now() + bounds.durationDays * 86400000)
  });

  try {
    const realtime = require('../realtime');
    realtime.emit('market:update', { action: 'created', id: String(listing._id) });
  } catch (error) {
    /* ignore */
  }

  if (bounds.requireApproval) {
    try {
      const notify = require('./notify');
      const User = require('../models/User');
      const staff = await User.find({ rank: { $in: ['owner', 'operations', 'business'] }, blocked: false }).select('_id').lean();
      await notify.pushMany(staff.map((row) => row._id), {
        title: 'إعلان سوق بانتظار الموافقة',
        body: `${listing.sellerName} عرض «${listing.name}» بـ ${listing.price} ${config.system.currencyLabel}`,
        type: 'info',
        link: '/#/admin'
      });
    } catch (error) {
      /* ignore */
    }
  }

  return { listing, quota: { ...quota, used: quota.used + 1, remaining: quota.remaining - 1 } };
}

async function review({ id, approve, note = '', user }) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const MarketListing = require('../models/MarketListing');
  const listing = await MarketListing.findById(id);
  if (!listing) throw httpError(404, 'الإعلان غير موجود', 'NOT_FOUND');
  if (!['pending', 'rejected', 'active', 'paused'].includes(listing.status)) {
    throw httpError(400, 'لا يمكن مراجعة إعلان منتهٍ', 'MARKET_FINAL');
  }
  listing.status = approve ? 'active' : 'rejected';
  listing.adminNote = String(note || '').slice(0, 300);
  listing.reviewedBy = user ? user._id : null;
  listing.reviewedByName = user ? user.displayName || user.username || '' : '';
  listing.reviewedAt = new Date();
  if (approve) listing.expiresAt = new Date(Date.now() + (await limits()).durationDays * 86400000);
  await listing.save();

  try {
    const notify = require('./notify');
    await notify.push(listing.seller, {
      title: approve ? 'تمت الموافقة على إعلانك' : 'رُفض إعلانك في السوق',
      body: approve ? `«${listing.name}» ظهر الآن في المتجر الداخلي` : String(note || 'راجع شروط السوق'),
      type: approve ? 'success' : 'warning',
      link: '/#/store-internal'
    });
    const realtime = require('../realtime');
    realtime.emit('market:update', { action: 'reviewed', id: String(listing._id), status: listing.status });
  } catch (error) {
    /* ignore */
  }
  return listing;
}

async function update({ id, user, body = {} }) {
  const MarketListing = require('../models/MarketListing');
  const listing = await MarketListing.findById(id);
  if (!listing) throw httpError(404, 'الإعلان غير موجود', 'NOT_FOUND');
  const isOwner = String(listing.seller) === String(user._id);
  if (!isOwner) throw httpError(403, 'ليس إعلانك', 'FORBIDDEN');
  if (['sold', 'rejected', 'expired', 'cancelled'].includes(listing.status)) {
    throw httpError(400, 'لا يمكن تعديل إعلان مغلق', 'MARKET_FINAL');
  }

  const bounds = await limits();
  if (body.status && isOwner) {
    if (body.status === 'paused' && listing.status === 'active') listing.status = 'paused';
    else if (body.status === 'active' && listing.status === 'paused') listing.status = 'active';
    else if (body.status === 'cancelled') listing.status = 'cancelled';
  }
  if (body.price !== undefined) {
    const price = Math.round(Number(body.price) || 0);
    if (price < bounds.minPrice || price > bounds.maxPrice) throw httpError(400, 'السعر خارج الحدود المسموحة', 'INVALID_PRICE');
    listing.price = price;
  }
  if (body.description !== undefined) listing.description = String(body.description).slice(0, 600);
  if (body.image !== undefined) listing.image = images.validateImage(body.image, 'رابط صورة المنتج غير صالح');
  if (body.qty !== undefined && listing.status !== 'active') {
    listing.qty = num(body.qty, listing.qty, 1, bounds.maxQty);
    listing.remaining = listing.qty;
  }
  await listing.save();
  try {
    const realtime = require('../realtime');
    realtime.emit('market:update', { action: 'updated', id: String(listing._id) });
  } catch (error) {
    /* ignore */
  }
  return listing;
}

function serialize(listing, viewerId = null) {
  const row = listing.toJSON ? listing.toJSON() : listing;
  const commission = Math.round((Number(row.price) || 0) * 0.0);
  return {
    _id: String(row._id),
    id: String(row._id),
    sellerId: String(row.seller),
    sellerName: row.sellerName || 'عضو',
    mine: viewerId ? String(row.seller) === String(viewerId) : false,
    name: row.name,
    description: row.description,
    category: row.category,
    price: row.price,
    qty: row.qty,
    remaining: row.remaining,
    image: row.image,
    gallery: row.gallery || [],
    status: row.status,
    weekKey: row.weekKey,
    adminNote: row.adminNote || '',
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    soldCount: row.soldCount || 0,
    netTotal: row.netTotal || 0,
    commission,
    available: row.status === 'active' && (row.remaining === null || row.remaining > 0)
  };
}

async function listActive(viewerId = null) {
  if (!mongooseReady()) return [];
  await expireOld();
  const MarketListing = require('../models/MarketListing');
  const rows = await MarketListing.find({ status: 'active', remaining: { $gt: 0 } })
    .sort({ createdAt: -1 })
    .limit(120)
    .lean();
  return rows.map((row) => serialize(row, viewerId));
}

async function listMine(userId) {
  if (!mongooseReady()) return [];
  await expireOld();
  const MarketListing = require('../models/MarketListing');
  const rows = await MarketListing.find({ seller: userId }).sort({ createdAt: -1 }).limit(60).lean();
  return rows.map((row) => serialize(row, userId));
}

async function listForReview() {
  if (!mongooseReady()) return [];
  const MarketListing = require('../models/MarketListing');
  const rows = await MarketListing.find({ status: { $in: ['pending', 'rejected', 'active', 'paused', 'expired'] } })
    .sort({ status: 1, createdAt: -1 })
    .limit(120)
    .lean();
  return rows.map((row) => ({ ...serialize(row), reviewedByName: row.reviewedByName || '' }));
}

async function myEarnings(userId) {
  if (!mongooseReady()) return { count: 0, gross: 0, commission: 0, net: 0, pendingPayout: 0, recent: [] };
  const MarketSale = require('../models/MarketSale');
  const rows = await MarketSale.find({ seller: userId }).sort({ at: -1 }).limit(20).lean();
  const totals = await MarketSale.aggregate([
    { $match: { seller: userId } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        gross: { $sum: '$gross' },
        commission: { $sum: '$commission' },
        net: { $sum: '$net' },
        unpaid: { $sum: { $cond: [{ $eq: ['$paidOut', false] }, '$net', 0] } }
      }
    }
  ]);
  const agg = totals[0] || { count: 0, gross: 0, commission: 0, net: 0, unpaid: 0 };
  return {
    count: agg.count || 0,
    gross: agg.gross || 0,
    commission: agg.commission || 0,
    net: agg.net || 0,
    pendingPayout: agg.unpaid || 0,
    recent: rows
  };
}

/* يُستدعى من إنهاء الطلب: يسجّل البيع، يحسب العمولة للخزينة، ويخبر البائع */
async function recordSale({ listingId, qty, order, buyer }) {
  if (!mongooseReady()) return null;
  const MarketListing = require('../models/MarketListing');
  const MarketSale = require('../models/MarketSale');
  const listing = await MarketListing.findById(listingId);
  if (!listing) return null;

  const amount = Math.max(1, Math.round(Number(qty) || 1));
  const gross = (Number(listing.price) || 0) * amount;
  const bounds = await limits();
  const percent = bounds.commissionPercent;
  const commission = Math.min(gross, Math.round((gross * percent) / 100));
  const net = Math.max(0, gross - commission);

  const sale = await MarketSale.create({
    listing: listing._id,
    seller: listing.seller,
    buyer: buyer ? buyer._id : null,
    order: order ? order._id : null,
    orderCode: order ? order.code : '',
    itemName: listing.name,
    qty: amount,
    gross,
    commissionPercent: percent,
    commission,
    net
  });

  listing.soldCount = (listing.soldCount || 0) + amount;
  listing.grossTotal = (listing.grossTotal || 0) + gross;
  listing.commissionTotal = (listing.commissionTotal || 0) + commission;
  listing.netTotal = (listing.netTotal || 0) + net;
  if (listing.remaining !== null && listing.remaining !== undefined) {
    listing.remaining = Math.max(0, listing.remaining - amount);
    if (listing.remaining === 0) listing.status = 'sold';
  }
  await listing.save();

  if (commission > 0) {
    try {
      await treasuryService.record({
        type: 'income',
        amount: commission,
        category: 'سوق الأعضاء',
        description: `عمولة بيع «${listing.name}» — ${percent}% من ${gross} (الطلب ${order ? order.code : '—'})`,
        refType: 'purchase',
        refId: listing._id,
        user: buyer || null
      });
    } catch (error) {
      console.error('[Market] تعذّر تسجيل العمولة:', error.message);
    }
  }

  try {
    const notify = require('./notify');
    await notify.push(listing.seller, {
      title: 'بيعت سلعتك في السوق',
      body: `«${listing.name}» × ${amount} — صافي أرباحك ${net} ${config.system.currencyLabel} بعد عمولة ${commission}`,
      type: 'success',
      link: '/#/store-internal'
    });
  } catch (error) {
    /* ignore */
  }

  return { sale, commission, net, gross };
}

module.exports = {
  limits,
  weekKey,
  usage,
  create,
  review,
  update,
  listActive,
  listMine,
  listForReview,
  myEarnings,
  recordSale,
  serialize,
  expireOld,
  httpError,
  ALLOWED_CATEGORIES
};
