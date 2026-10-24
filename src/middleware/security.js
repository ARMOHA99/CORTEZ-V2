const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('../../config');

const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function sanitizeString(value) {
  if (typeof value !== 'string') return value;
  let cleaned = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*\/?\s*[a-z][^>]*>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .trim();
  if (cleaned.length > 20000) cleaned = cleaned.slice(0, 20000);
  return cleaned;
}

function sanitizeValue(value, depth = 0) {
  if (depth > 8) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 500).map((entry) => sanitizeValue(entry, depth + 1));
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.') || BLOCKED_KEYS.has(key)) continue;
      const cleaned = sanitizeValue(entry, depth + 1);
      if (cleaned !== undefined) result[key] = cleaned;
    }
    return result;
  }
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return undefined;
}

function sanitizeInputs(req, res, next) {
  try {
    if (req.body && typeof req.body === 'object') req.body = sanitizeValue(req.body);
    if (req.query && typeof req.query === 'object') {
      const cleanedQuery = sanitizeValue(req.query);
      for (const key of Object.keys(req.query)) delete req.query[key];
      Object.assign(req.query, cleanedQuery);
    }
    if (req.params && typeof req.params === 'object') {
      for (const [key, value] of Object.entries(req.params)) {
        req.params[key] = sanitizeString(value);
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

function csrfProtection(req, res, next) {
  if (!req.session) return next();
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) return next();
  if (req.path.startsWith('/auth/discord')) return next();

  const token = req.get('x-csrf-token') || (req.body && req.body._csrf);
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).json({ error: 'رمز الحماية غير صالح. أعد تحميل الصفحة وحاول مجدداً.', code: 'CSRF' });
  }
  return next();
}

function helmetMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://cdn.discordapp.com', 'https://res.cloudinary.com', 'https:'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'https:'],
        mediaSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.isProduction ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: config.isProduction
      ? { maxAge: 15552000, includeSubDomains: true, preload: false }
      : false
  });
}

const globalLimiter = rateLimit({
  windowMs: config.security.rateWindowMinutes * 60 * 1000,
  max: config.security.rateMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز عدد الطلبات المسموح. حاول بعد قليل.', code: 'RATE_LIMIT' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.security.authRateMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات دخول كثيرة. انتظر 15 دقيقة.', code: 'AUTH_RATE_LIMIT' }
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'أنت سريع جداً. خفّف الطلبات قليلاً.', code: 'WRITE_RATE_LIMIT' }
});

module.exports = {
  sanitizeInputs,
  csrfProtection,
  helmetMiddleware,
  globalLimiter,
  authLimiter,
  writeLimiter,
  sanitizeString
};
