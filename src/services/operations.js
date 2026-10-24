const config = require('../../config');
const realtime = require('../realtime');
const goalService = require('./goal');
const treasuryService = require('./treasury');
const discordService = require('./discord');

function mongooseReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

function httpError(status, message, code = '') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function normalizeItems(items = [], { allowPriceLookup = true } = {}) {
  const Product = require('../models/Product');
  const normalized = [];
  for (const item of Array.isArray(items) ? items.slice(0, 40) : []) {
    const qty = Math.max(1, Math.min(1000000, Math.round(Number(item.qty) || 0)));
    let product = null;
    if (item.productId) {
      product = await Product.findById(item.productId).lean().catch(() => null);
    }
    if (!product && item.product) {
      product = await Product.findById(item.product).lean().catch(() => null);
    }
    if (!product && allowPriceLookup && item.name) {
      product = await Product.findOne({ name: String(item.name).trim() }).lean();
    }
    const name = String(item.name || (product && product.name) || 'غرض').trim().slice(0, 120);
    let unitPrice = Number(item.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      unitPrice = product ? Number(product.price) || 0 : 0;
    }
    unitPrice = Math.max(0, Math.round(unitPrice));
    normalized.push({
      product: product ? product._id : null,
      name,
      qty,
      unitPrice,
      total: qty * unitPrice
    });
  }
  return normalized;
}

function mapType(value) {
  const allowed = ['heist', 'supply', 'defense', 'territory', 'collection', 'other'];
  return allowed.includes(value) ? value : 'other';
}

async function createOperation({ data, user }) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const Operation = require('../models/Operation');
  const User = require('../models/User');
  const Counter = require('../models/Counter');

  const title = String(data.title || '').trim();
  if (!title) throw httpError(400, 'عنوان العملية مطلوب', 'TITLE_REQUIRED');
  const result = data.result === 'loss' ? 'loss' : 'win';
  const participants = Array.isArray(data.participants)
    ? Array.from(new Set(data.participants.map(String))).slice(0, 100)
    : [];
  const users = participants.length
    ? await User.find({ _id: { $in: participants } }).select('_id displayName username').lean()
    : [];

  const looted = await normalizeItems(data.looted, { allowPriceLookup: true });
  const lost = await normalizeItems(data.lost, { allowPriceLookup: true });
  const money = Math.max(0, Math.round(Number(data.money) || 0));
  const lootValue = looted.reduce((sum, item) => sum + item.total, 0);
  const lostValue = lost.reduce((sum, item) => sum + item.total, 0);
  const netValue = money + lootValue - lostValue;
  const intendedDelta = result === 'win' ? Math.max(0, netValue) : -Math.max(0, lostValue + money);

  const seq = await Counter.next('operation', 1000);
  const code = `OP-${seq}`;
  const { context } = await goalService.getCurrentGoal({ create: true });

  const operation = await Operation.create({
    code,
    title: title.slice(0, 140),
    type: mapType(data.type),
    result,
    participants: users.map((entry) => entry._id),
    participantNames: users.map((entry) => entry.displayName || entry.username || 'عضو'),
    looted,
    lost,
    money,
    lootValue,
    lostValue,
    netValue,
    goalDelta: intendedDelta,
    weekKey: context.weekKey,
    notes: String(data.notes || '').slice(0, 1200),
    createdBy: user._id,
    createdByName: user.displayName || user.username || ''
  });

  if (users.length) {
    await User.updateMany(
      { _id: { $in: users.map((entry) => entry._id) } },
      {
        $inc: {
          'stats.operations': 1,
          [result === 'win' ? 'stats.wins' : 'stats.losses']: 1
        }
      }
    );
  }

  await goalService.addToGoal(intendedDelta, {
    reason: `عملية ${code} — ${title}`,
    refType: 'operation',
    refId: operation._id,
    user
  });

  try {
    if (result === 'win' && money > 0) {
      await treasuryService.record({
        type: 'income',
        amount: money,
        category: 'عمليات',
        description: `دخل عملية ${code} — ${title}`,
        refType: 'operation',
        refId: operation._id,
        user
      });
    }
    if (result === 'loss' && money > 0) {
      await treasuryService.record({
        type: 'expense',
        amount: money,
        category: 'عمليات',
        description: `خسارة نقدية في عملية ${code} — ${title}`,
        refType: 'operation',
        refId: operation._id,
        user
      });
    }
    if (lostValue > 0) {
      await treasuryService.record({
        type: 'expense',
        amount: lostValue,
        category: 'مفقودات',
        description: `قيمة مفقودات عملية ${code} (${lost.length} صنف)`,
        refType: 'operation',
        refId: operation._id,
        user
      });
    }
  } catch (error) {
    console.error('[Operations] treasury sync:', error.message);
  }

  try {
    if (config.discord.channels.operations) {
      discordService.notifyOperation(operation.toJSON()).catch(() => null);
    }
  } catch (error) {
    /* ignore */
  }

  realtime.emit('operations:update', { operation: operation.toJSON() });
  realtime.emit('dashboard:refresh', { reason: 'operation' });
  realtime.emit('leaderboard:refresh', { reason: 'operation' });
  return operation;
}

async function listOperations({ page = 1, limit = 20, result = '', type = '', search = '' } = {}) {
  if (!mongooseReady()) return { items: [], total: 0, page: 1, pages: 1 };
  const Operation = require('../models/Operation');
  const query = {};
  if (result) query.result = result;
  if (type) query.type = type;
  if (search) {
    const regex = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ title: regex }, { code: regex }, { participantNames: regex }];
  }
  const safeLimit = Math.min(60, Math.max(1, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const [items, total] = await Promise.all([
    Operation.find(query).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
    Operation.countDocuments(query)
  ]);
  return { items, total, page: safePage, pages: Math.max(1, Math.ceil(total / safeLimit)) };
}

async function operationStats() {
  if (!mongooseReady()) return { total: 0, wins: 0, losses: 0, winRate: 0, netValue: 0 };
  const Operation = require('../models/Operation');
  const rows = await Operation.aggregate([
    {
      $group: {
        _id: '$result',
        count: { $sum: 1 },
        net: { $sum: '$netValue' }
      }
    }
  ]);
  const wins = rows.find((row) => row._id === 'win')?.count || 0;
  const losses = rows.find((row) => row._id === 'loss')?.count || 0;
  const netValue = rows.reduce((sum, row) => sum + (row.net || 0), 0);
  return {
    total: wins + losses,
    wins,
    losses,
    winRate: wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0,
    netValue
  };
}

async function deleteOperation(operationId, user) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const Operation = require('../models/Operation');
  const User = require('../models/User');
  const Transaction = require('../models/Transaction');
  const operation = await Operation.findById(operationId);
  if (!operation) throw httpError(404, 'العملية غير موجودة', 'NOT_FOUND');

  if (operation.goalDelta) {
    await goalService.addToGoal(-operation.goalDelta, {
      reason: `حذف عملية ${operation.code}`,
      refType: 'operation-delete',
      user
    });
  }
  if (operation.participants && operation.participants.length) {
    await User.updateMany(
      { _id: { $in: operation.participants } },
      {
        $inc: {
          'stats.operations': -1,
          [operation.result === 'win' ? 'stats.wins' : 'stats.losses']: -1
        }
      }
    );
  }
  await Transaction.deleteMany({ refType: 'operation', refId: operation._id });
  await Operation.deleteOne({ _id: operation._id });
  realtime.emit('operations:update', { deleted: String(operation._id) });
  realtime.emit('dashboard:refresh', { reason: 'operation-deleted' });
  return true;
}

module.exports = {
  createOperation,
  listOperations,
  operationStats,
  deleteOperation,
  normalizeItems,
  httpError
};
