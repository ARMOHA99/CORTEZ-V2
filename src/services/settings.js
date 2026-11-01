const config = require('../../config');

let cache = null;
let cacheAt = 0;
const TTL = 10 * 1000;

function mongooseReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

function defaultSettings() {
  return {
    'pact.title': config.pact.title,
    'pact.subtitle': config.pact.subtitle,
    'pact.text': config.pact.text,
    'pact.version': config.pact.version,
    'pact.requireResign': false,
    'organization.name': 'CORTEZ',
    'organization.logoUrl': '',
    'attendance.enabled': true,
    'access.requireDiscordRole': true,
    'discord.inviteUrl': '',
    'discord.channel.orders': '',
    'discord.channel.internalOrders': '',
    'discord.channel.operations': '',
    'organization.tagline': config.org.tagline,
    'organization.description': config.org.description,
    'system.weekStartDay': config.system.weekStartDay,
    'system.nightShift': config.system.nightShift,
    'system.weeklyGoalTarget': config.system.weeklyGoalTarget,
    'system.currencyLabel': config.system.currencyLabel,
    'system.maintenance': false,
    'system.maintenanceMessage': 'المنصة تحت صيانة مؤقتة. سنعود قريباً.',
    'system.ordersDiscordNotify': true,
    'system.autoCloseDutyHours': 14,
    'system.audienceUrl': '',
    'system.announcementBanner': '',
    'system.attendanceVisibleRanks': ['owner', 'operations', 'business', 'member', 'store'],
    'store.externalEnabled': config.features.publicStore,
    'store.externalTitle': 'المتجر الخارجي',
    'store.externalDescription': 'يمكن للجميع تقديم طلب عبر هذا المتجر',
    'store.internalEnabled': config.features.internalStore,
    'leaderboard.public': false,
    'discipline.discordNotify': true,
    'votes.discordNotify': true
  };
}

function merge(defaults, rows) {
  const result = { ...defaults };
  for (const row of rows) {
    result[row.key] = row.value;
    result.__meta = result.__meta || {};
    result.__meta[row.key] = {
      updatedAt: row.updatedAt,
      updatedByName: row.updatedByName || ''
    };
  }
  return result;
}

async function loadAll(force = false) {
  const now = Date.now();
  if (!force && cache && now - cacheAt < TTL) return cache;

  const defaults = defaultSettings();
  if (!mongooseReady()) {
    cache = merge(defaults, []);
    cacheAt = now;
    return cache;
  }

  const Setting = require('../models/Setting');
  const rows = await Setting.find({}).lean();
  cache = merge(defaults, rows);
  cacheAt = now;
  return cache;
}

async function get(key, fallback = null) {
  const all = await loadAll();
  if (Object.prototype.hasOwnProperty.call(all, key)) return all[key];
  return fallback;
}

async function getAll() {
  return loadAll();
}

async function set(key, value, user = null) {
  const Setting = require('../models/Setting');
  const updated = await Setting.findOneAndUpdate(
    { key },
    {
      key,
      value,
      updatedBy: user ? user._id : null,
      updatedByName: user ? user.displayName || user.username || '' : ''
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  cache = null;
  cacheAt = 0;
  return updated;
}

async function setMany(entries, user = null) {
  const operations = Object.entries(entries).map(([key, value]) => ({
    updateOne: {
      filter: { key },
      update: {
        $set: {
          key,
          value,
          updatedBy: user ? user._id : null,
          updatedByName: user ? user.displayName || user.username || '' : ''
        }
      },
      upsert: true
    }
  }));
  if (operations.length) {
    const Setting = require('../models/Setting');
    await Setting.bulkWrite(operations);
  }
  cache = null;
  cacheAt = 0;
  return loadAll(true);
}

function invalidate() {
  cache = null;
  cacheAt = 0;
}

async function currentPact() {
  const all = await loadAll();
  return {
    title: all['pact.title'] || config.pact.title,
    subtitle: all['pact.subtitle'] || config.pact.subtitle,
    text: all['pact.text'] || config.pact.text,
    version: Number(all['pact.version'] || config.pact.version),
    fingerprintLabel: config.pact.fingerprintLabel
  };
}

module.exports = { get, getAll, set, setMany, invalidate, defaultSettings, currentPact, loadAll };
