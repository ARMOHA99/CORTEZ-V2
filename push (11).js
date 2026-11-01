/* ═══════════════════════════════════════════════════════════════════════
   إشعارات الويب (Web Push) — تعمل فقط عند وجود مفاتيح VAPID.
   بلا مفاتيح: تتوقف بهدوء، وكل بقية النظام يعمل عاديًا.
   المفاتيح: npx web-push generate-vapid-keys
   ═══════════════════════════════════════════════════════════════════════ */

let webpush = null;
let initialized = false;
let enabled = false;

function publicKey() {
  return String(process.env.VAPID_PUBLIC_KEY || '').trim();
}

function init() {
  if (initialized) return enabled;
  initialized = true;
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey() || !privateKey) return false;
  try {
    webpush = require('web-push');
    webpush.setVapidDetails(
      String(process.env.VAPID_SUBJECT || 'mailto:cortez@example.com').trim(),
      publicKey(),
      privateKey
    );
    enabled = true;
  } catch (error) {
    console.warn('[Push] web-push غير مثبّت — شغّل npm install web-push:', error.message);
    enabled = false;
  }
  return enabled;
}

function isEnabled() {
  return init();
}

function shape(subscription) {
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys?.p256dh || '',
      auth: subscription.keys?.auth || ''
    }
  };
}

async function sendToUser(userId, payload = {}) {
  if (!init() || !userId) return 0;
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) return 0;
  const PushSubscription = require('../models/PushSubscription');
  const subscriptions = await PushSubscription.find({ user: userId }).lean().catch(() => []);
  if (!subscriptions.length) return 0;

  const body = JSON.stringify({
    title: String(payload.title || 'CORTEZ').slice(0, 120),
    body: String(payload.body || '').slice(0, 300),
    url: String(payload.url || '/').slice(0, 300),
    tag: String(payload.tag || 'cortez').slice(0, 60),
    at: Date.now()
  });

  let sent = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(shape(subscription), body, { TTL: 3600 });
      sent += 1;
    } catch (error) {
      const status = error?.statusCode;
      if (status === 404 || status === 410) {
        await PushSubscription.deleteOne({ _id: subscription._id }).catch(() => null);
      } else {
        await PushSubscription.updateOne(
          { _id: subscription._id },
          { $inc: { failCount: 1 }, $set: { lastSeen: new Date() } }
        ).catch(() => null);
      }
    }
  }
  return sent;
}

async function subscribe(user, subscription, userAgent = '') {
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh) {
    const error = new Error('بيانات الاشتراك غير مكتملة');
    error.status = 400;
    error.code = 'INVALID_SUBSCRIPTION';
    throw error;
  }
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) {
    const error = new Error('قاعدة البيانات غير متصلة حالياً');
    error.status = 503;
    error.code = 'DB_OFFLINE';
    throw error;
  }
  const PushSubscription = require('../models/PushSubscription');
  await PushSubscription.updateOne(
    { endpoint: String(subscription.endpoint).slice(0, 700) },
    {
      $set: {
        user: user._id,
        keys: {
          p256dh: String(subscription.keys.p256dh || '').slice(0, 300),
          auth: String(subscription.keys.auth || '').slice(0, 200)
        },
        userAgent: String(userAgent || '').slice(0, 300),
        lastSeen: new Date(),
        failCount: 0
      }
    },
    { upsert: true }
  );
  return PushSubscription.countDocuments({ user: user._id });
}

async function unsubscribe(user, endpoint) {
  const PushSubscription = require('../models/PushSubscription');
  if (endpoint) await PushSubscription.deleteOne({ user: user._id, endpoint: String(endpoint) });
  else await PushSubscription.deleteMany({ user: user._id });
  return PushSubscription.countDocuments({ user: user._id });
}

module.exports = { init, isEnabled, publicKey, sendToUser, subscribe, unsubscribe };
