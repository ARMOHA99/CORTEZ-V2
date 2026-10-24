const { RANKS, ALL_PERMISSIONS } = require('../constants/permissions');

let cache = null;
let cacheAt = 0;
const TTL = 15 * 1000;

function mongooseReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

function fallbackRanks() {
  return RANKS.map((rank) => ({
    key: rank.key,
    name: rank.name,
    short: rank.short,
    level: rank.level,
    color: rank.color,
    icon: rank.icon,
    permissions: rank.permissions,
    discordRoleId: '',
    isSystem: rank.isSystem,
    order: rank.order,
    description: ''
  }));
}

async function getRanks(force = false) {
  const now = Date.now();
  if (!force && cache && now - cacheAt < TTL) return cache;
  if (!mongooseReady()) {
    cache = fallbackRanks();
    cacheAt = now;
    return cache;
  }
  const Rank = require('../models/Rank');
  let ranks = await Rank.find({}).sort({ level: -1 }).lean();
  if (!ranks.length) {
    const fallback = fallbackRanks();
    try {
      await Rank.insertMany(fallback);
    } catch (error) {
      console.error('[Ranks] seed fallback:', error.message);
    }
    ranks = await Rank.find({}).sort({ level: -1 }).lean();
  }
  cache = ranks;
  cacheAt = now;
  return ranks;
}

async function getRank(key) {
  if (!key) return null;
  const ranks = await getRanks();
  return ranks.find((rank) => rank.key === key) || null;
}

async function getRankByDiscordRole(roleIds = []) {
  const ranks = await getRanks();
  const matching = ranks
    .filter((rank) => rank.discordRoleId && roleIds.includes(rank.discordRoleId))
    .sort((a, b) => b.level - a.level);
  return matching[0] || null;
}

function permissionsOf(rank) {
  if (!rank) return [];
  if (rank.key === 'owner') return ALL_PERMISSIONS;
  const perms = new Set(rank.permissions || []);
  if (perms.has('system:admin')) {
    for (const permission of ALL_PERMISSIONS) perms.add(permission);
  }
  return Array.from(perms);
}

function hasPermission(user, permission, rank = null) {
  if (!user || user.blocked) return false;
  if (user.rank === 'owner') return true;
  const effectiveRank = rank || { key: user.rank, permissions: [] };
  const perms = permissionsOf(effectiveRank);
  return perms.includes(permission);
}

function hasAnyPermission(user, permissions, rank = null) {
  return permissions.some((permission) => hasPermission(user, permission, rank));
}

async function resolvePermissions(user) {
  if (!user) return { rank: null, permissions: [] };
  const rank = await getRank(user.rank);
  return { rank, permissions: permissionsOf(rank) };
}

function invalidate() {
  cache = null;
  cacheAt = 0;
}

module.exports = {
  getRanks,
  getRank,
  getRankByDiscordRole,
  permissionsOf,
  hasPermission,
  hasAnyPermission,
  resolvePermissions,
  invalidate,
  fallbackRanks
};
