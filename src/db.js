const mongoose = require('mongoose');

const state = {
  connected: false,
  mode: 'disconnected'
};

mongoose.set('strictQuery', true);

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    state.mode = 'memory-fallback';
    state.connected = false;
    console.warn(
      '\n[DB] MONGODB_URI غير محدد. سيعمل الخادم بوضع العرض المؤقت (بدون قاعدة بيانات).\n' +
        '[DB] أضف MONGODB_URI في متغيرات البيئة أو استخدم: npm run dev:mem\n'
    );
    return null;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      maxPoolSize: 20,
      retryWrites: true
    });
    state.connected = true;
    state.mode = 'mongodb';
    console.log(`[DB] تم الاتصال بقاعدة البيانات: ${mongoose.connection.name}`);
    /* صيانة مؤقتة: حذف الحسابات التي أنشأها استيراد ديسكورد غير المصرّح به */
    /* تشخيص سريع: أعداد الأعضاء والدوام — يظهر في سجلات Render */
    try {
      const User = require('./models/User');
      const Shift = require('./models/Shift');
      const [total, inGuild, guests, blocked, shifts] = await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ inGuild: true }),
        User.countDocuments({ rank: 'guest' }),
        User.countDocuments({ blocked: true }),
        Shift.countDocuments({})
      ]);
      console.log(`[DB] الأعضاء: ${total} — داخل السيرفر: ${inGuild} — بلا رتبة: ${guests} — محظورون: ${blocked} — سجلات الدوام: ${shifts}`);
      const sample = await User.find({ rank: { $ne: 'guest' } })
        .select('username displayName nick globalName')
        .limit(6)
        .lean();
      console.log('[DB] عيّنة أسماء:', sample.map((u) => `${u.username}⇒${u.displayName || '(فارغ)'}`).join(' | ') || '(لا يوجد)');
    } catch (error) {
      console.warn('[DB] تعذّر عدّ السجلات:', error.message);
    }
    return mongoose.connection;
  } catch (error) {
    state.connected = false;
    state.mode = 'disconnected';
    console.error('[DB] فشل الاتصال بقاعدة البيانات:', error.message);
    throw error;
  }
}

function isReady() {
  return state.connected && mongoose.connection.readyState === 1;
}

function createSessionStore(session) {
  if (!process.env.MONGODB_URI) {
    console.warn('[Session] استخدام MemoryStore مؤقت — الجلسات ستُفقد عند إعادة التشغيل.');
    return new session.MemoryStore();
  }
  const MongoStore = require('connect-mongo');
  return MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 60 * 60 * 24 * 7,
    autoRemove: 'native',
    touchAfter: 3600
  });
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  state.connected = false;
  state.mode = 'disconnected';
}

module.exports = { connectDB, disconnectDB, isReady, dbState: state, createSessionStore };
