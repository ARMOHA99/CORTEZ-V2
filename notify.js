const realtime = require('../realtime');
let pushService = null;
try {
  pushService = require('./push');
} catch (error) {
  console.warn('[Notify] إشعارات الويب معطّلة — src/services/push.js مفقود:', error.message);
}

async function push(userId, { title, body = '', type = 'info', link = '' }) {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return null;
    const Notification = require('../models/Notification');
    const notification = await Notification.create({ user: userId, title, body, type, link });
    realtime.emitToUser(userId, 'notification:new', notification.toJSON());
    // إشعار المتصفح (يُتجاهل بهدوء إن لم تُهيّأ مفاتيح VAPID أو غاب الملف)
    if (pushService) {
      pushService
        .sendToUser(userId, { title, body, url: link || '/', tag: type || 'cortez' })
        .catch(() => null);
    }
    return notification;
  } catch (error) {
    console.error('[Notify]', error.message);
    return null;
  }
}

async function pushMany(userIds, payload) {
  const results = [];
  for (const userId of userIds) {
    results.push(await push(userId, payload));
  }
  return results;
}

async function unreadCount(userId) {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 0;
    const Notification = require('../models/Notification');
    return Notification.countDocuments({ user: userId, read: false });
  } catch (error) {
    return 0;
  }
}

async function broadcastMembers(payload) {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return;
    const User = require('../models/User');
    const users = await User.find({ blocked: false, inGuild: true }).select('_id').lean();
    await pushMany(users.map((user) => user._id), payload);
  } catch (error) {
    console.error('[Notify broadcast]', error.message);
  }
}

module.exports = { push, pushMany, unreadCount, broadcastMembers };
