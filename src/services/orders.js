const crypto = require('crypto');
const config = require('../../config');
const realtime = require('../realtime');
const discordService = require('./discord');
const notify = require('./notify');

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

function orderCode(seq) {
  return `ORD-${seq}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

async function buildItems(rawItems, scope) {
  const Product = require('../models/Product');
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw httpError(400, 'سلة الطلب فارغة', 'EMPTY_CART');
  }
  const items = [];
  for (const raw of rawItems.slice(0, 30)) {
    const qty = Math.max(1, Math.min(99, Math.round(Number(raw.qty) || 1)));
    const product = await Product.findById(raw.productId || raw.product).catch(() => null);
    if (!product || !product.active) continue;
    if (scope === 'external' && !['external', 'both'].includes(product.scope)) continue;
    if (scope === 'internal' && !['internal', 'both'].includes(product.scope)) continue;
    if (product.stock !== null && product.stock !== undefined && product.stock < qty) {
      throw httpError(400, `الكمية المتوفرة من «${product.name}» غير كافية`, 'STOCK');
    }
    if (!items.find((item) => String(item.product) === String(product._id))) {
      items.push({
        product: product._id,
        name: product.name,
        price: Number(product.price) || 0,
        qty,
        total: (Number(product.price) || 0) * qty
      });
    }
  }
  if (!items.length) throw httpError(400, 'لا توجد منتجات صالحة في السلة', 'INVALID_CART');
  return items;
}

async function createOrder({ type = 'external', user = null, customer = {}, items = [], note = '', req = null }) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const Order = require('../models/Order');
  const Counter = require('../models/Counter');

  if (type === 'internal' && !user) throw httpError(401, 'الدخول مطلوب للطلب الداخلي', 'UNAUTHENTICATED');
  if (type === 'external' && !user) {
    if (!String(customer.name || '').trim()) throw httpError(400, 'الاسم مطلوب لإتمام الطلب', 'NAME_REQUIRED');
    if (!String(customer.contact || '').trim()) throw httpError(400, 'وسيلة التواصل مطلوبة', 'CONTACT_REQUIRED');
  }

  const normalizedItems = await buildItems(items, type);
  const total = normalizedItems.reduce((sum, item) => sum + item.total, 0);
  const seq = await Counter.next('order', 1000);
  const code = orderCode(seq);

  const order = await Order.create({
    code,
    type,
    user: user ? user._id : null,
    customer: {
      name: user ? user.displayName || user.username || '' : String(customer.name || '').slice(0, 120),
      contact: String(customer.contact || (user ? user.discordId : '')).slice(0, 160),
      discord: String(customer.discord || (user ? user.username : '')).slice(0, 120)
    },
    items: normalizedItems,
    total,
    note: String(note || '').slice(0, 600),
    status: 'pending',
    history: [{ status: 'pending', at: new Date(), byName: user ? user.displayName || user.username || '' : 'الزبون', note: 'تم إنشاء الطلب' }]
  });

  realtime.emit('orders:update', { action: 'created', orderId: String(order._id), code: order.code, total: order.total });
  realtime.emit('dashboard:refresh', { reason: 'order' });

  try {
    discordService.notifyOrder(order.toJSON()).catch(() => null);
  } catch (error) {
    /* ignore */
  }

  try {
    const User = require('../models/User');
    const staff = await User.find({ rank: { $in: ['owner', 'operations', 'business'] }, blocked: false }).select('_id').lean();
    await notify.pushMany(staff.map((entry) => entry._id), {
      title: 'طلب متجر جديد',
      body: `الطلب ${order.code} بقيمة ${order.total} ${config.system.currencyLabel}`,
      type: 'info',
      link: '/#/orders'
    });
  } catch (error) {
    /* ignore */
  }

  return order;
}

async function updateStatus({ orderId, status, user, note = '' }) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const Order = require('../models/Order');
  const allowed = ['pending', 'accepted', 'completed', 'cancelled'];
  if (!allowed.includes(status)) throw httpError(400, 'حالة غير صالحة', 'INVALID_STATUS');
  const order = await Order.findById(orderId);
  if (!order) throw httpError(404, 'الطلب غير موجود', 'NOT_FOUND');
  if (['completed', 'cancelled'].includes(order.status)) {
    throw httpError(400, 'لا يمكن تعديل طلب منتهٍ', 'ORDER_FINAL');
  }
  if (order.status === status) return order;

  order.status = status;
  order.staffNote = String(note || order.staffNote || '').slice(0, 600);
  order.handledBy = user ? user._id : null;
  order.handledByName = user ? user.displayName || user.username || '' : '';
  order.history.push({
    status,
    at: new Date(),
    byName: order.handledByName,
    note: String(note || '').slice(0, 300)
  });
  await order.save();

  realtime.emit('orders:update', { action: 'status', orderId: String(order._id), code: order.code, status });
  realtime.emit('dashboard:refresh', { reason: 'order-status' });
  if (order.user) {
    realtime.emitToUser(order.user, 'order:update', {
      orderId: String(order._id),
      code: order.code,
      status
    });
    await notify.push(order.user, {
      title: 'تحديث حالة طلبك',
      body: `الطلب ${order.code} أصبح: ${
        { pending: 'قيد الانتظار', accepted: 'مقبول', completed: 'مكتمل', cancelled: 'ملغى' }[status]
      }`,
      type: status === 'cancelled' ? 'warning' : 'success',
      link: '/#/orders'
    });
  }
  return order;
}

function serializePublic(order) {
  return {
    code: order.code,
    type: order.type,
    status: order.status,
    total: order.total,
    items: order.items,
    customerName: order.customer ? order.customer.name : '',
    note: order.note,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    history: order.history,
    handledByName: order.handledByName
  };
}

async function findByCode(code) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const Order = require('../models/Order');
  return Order.findOne({ code: String(code).trim().toUpperCase() });
}

module.exports = {
  createOrder,
  updateStatus,
  serializePublic,
  findByCode,
  buildItems,
  httpError
};
