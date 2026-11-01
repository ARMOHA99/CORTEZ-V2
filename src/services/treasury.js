const config = require('../../config');
const realtime = require('../realtime');

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

async function totals() {
  if (!mongooseReady()) return { income: 0, expense: 0, balance: 0 };
  const Transaction = require('../models/Transaction');
  const rows = await Transaction.aggregate([
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' }
      }
    }
  ]);
  const income = rows.find((row) => row._id === 'income')?.total || 0;
  const expense = rows.find((row) => row._id === 'expense')?.total || 0;
  return { income, expense, balance: income - expense };
}

async function record({ type, amount, category = 'general', description, refType = 'manual', refId = null, user = null }) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  if (!['income', 'expense'].includes(type)) throw httpError(400, 'نوع الحركة غير صالح', 'INVALID_TYPE');
  const value = Math.round(Number(amount) || 0);
  if (value <= 0) throw httpError(400, 'المبلغ يجب أن يكون أكبر من صفر', 'INVALID_AMOUNT');
  const Transaction = require('../models/Transaction');
  const current = await totals();
  const balanceAfter = type === 'income' ? current.balance + value : current.balance - value;
  const transaction = await Transaction.create({
    type,
    amount: value,
    category: String(category || 'general').slice(0, 60),
    description: String(description || '').slice(0, 400),
    refType,
    refId,
    balanceAfter,
    createdBy: user ? user._id : null,
    createdByName: user ? user.displayName || user.username || '' : 'النظام'
  });
  realtime.emit('treasury:update', { balance: balanceAfter, type, amount: value });
  realtime.emit('dashboard:refresh', { reason: 'treasury' });
  return transaction;
}

async function summary({ limit = 60, days = 30 } = {}) {
  if (!mongooseReady()) {
    return {
      income: 0,
      expense: 0,
      balance: 0,
      transactions: [],
      series: [],
      categories: [],
      currency: config.system.currencyLabel
    };
  }
  const Transaction = require('../models/Transaction');
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [aggregate, transactions, series, categories] = await Promise.all([
    totals(),
    Transaction.find({}).sort({ createdAt: -1 }).limit(Math.min(200, Number(limit) || 60)).lean(),
    Transaction.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: config.system.timezone } },
            type: '$type'
          },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.day': 1 } }
    ]),
    Transaction.aggregate([
      { $group: { _id: { type: '$type', category: '$category' }, total: { $sum: '$amount' } } },
      { $sort: { total: -1 } }
    ])
  ]);

  const dayMap = new Map();
  for (const row of series) {
    const day = row._id.day;
    if (!dayMap.has(day)) dayMap.set(day, { day, income: 0, expense: 0 });
    dayMap.get(day)[row._id.type] = row.total;
  }

  return {
    ...aggregate,
    currency: config.system.currencyLabel,
    transactions,
    series: Array.from(dayMap.values()).sort((a, b) => (a.day > b.day ? 1 : -1)),
    categories: categories.map((row) => ({
      type: row._id.type,
      category: row._id.category,
      total: row.total
    }))
  };
}

async function ledgerBalance() {
  return totals();
}

module.exports = { record, summary, totals, ledgerBalance, httpError };
