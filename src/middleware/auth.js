const { getRank, permissionsOf } = require('../services/ranks');

function dbReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

async function attachUser(req, res, next) {
  req.user = null;
  req.rank = null;
  req.permissions = [];
  try {
    if (!req.session || !req.session.userId || !dbReady()) return next();
    const User = require('../models/User');
    const user = await User.findById(req.session.userId);
    if (!user || user.blocked || user.sessionInvalid || !user.inGuild) {
      if (user && (user.blocked || user.sessionInvalid)) {
        console.warn(`[Auth] session rejected for ${user.displayName || user.discordId}`);
      }
      req.session.userId = null;
      return next();
    }
    const rank = await getRank(user.rank);
    req.user = user;
    req.rank = rank;
    req.permissions = permissionsOf(rank);
    if (!user.lastSeen || Date.now() - new Date(user.lastSeen).getTime() > 120000) {
      User.updateOne({ _id: user._id }, { $set: { lastSeen: new Date() } }).catch(() => null);
    }
    res.locals.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'يجب تسجيل الدخول عبر ديسكورد أولاً', code: 'UNAUTHENTICATED' });
  }
  return next();
}

function requirePermission(permission) {
  return function permissionGuard(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً', code: 'UNAUTHENTICATED' });
    }
    if (req.user.rank === 'owner' || req.permissions.includes(permission)) return next();
    return res.status(403).json({ error: 'لا تملك الصلاحية الكافية لهذا الإجراء', code: 'FORBIDDEN' });
  };
}

function requireAnyPermission(permissions = []) {
  return function anyPermissionGuard(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً', code: 'UNAUTHENTICATED' });
    }
    if (req.user.rank === 'owner' || permissions.some((permission) => req.permissions.includes(permission))) {
      return next();
    }
    return res.status(403).json({ error: 'لا تملك الصلاحية الكافية لهذا الإجراء', code: 'FORBIDDEN' });
  };
}

function requireRankLevel(level) {
  return async function rankGuard(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً', code: 'UNAUTHENTICATED' });
    }
    if (req.user.rank === 'owner') return next();
    const rank = req.rank || (await getRank(req.user.rank));
    if (rank && rank.level >= level) return next();
    return res.status(403).json({ error: 'رتبتك لا تسمح بهذا الإجراء', code: 'RANK_TOO_LOW' });
  };
}

function isSelfOrPermission(user, permission, targetId) {
  if (!user) return false;
  if (String(user._id) === String(targetId)) return true;
  return user.rank === 'owner' || (user.permissions || []).includes(permission);
}

module.exports = {
  attachUser,
  requireAuth,
  requirePermission,
  requireAnyPermission,
  requireRankLevel,
  isSelfOrPermission
};
