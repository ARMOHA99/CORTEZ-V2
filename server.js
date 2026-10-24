require('dotenv').config();

const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const compression = require('compression');

const config = require('./config');
const release = require('./src/release');
const { connectDB, disconnectDB, isReady, createSessionStore } = require('./src/db');
const realtime = require('./src/realtime');
const { ensureSeed } = require('./src/bootstrap');
const { startTasks, stopTasks } = require('./src/services/tasks');
const { startBot, stopBot } = require('./src/bot');
const authRoutes = require('./src/routes/auth');
const apiRoutes = require('./src/routes');
const { attachUser } = require('./src/middleware/auth');
const {
  helmetMiddleware,
  sanitizeInputs,
  csrfProtection,
  globalLimiter,
  authLimiter
} = require('./src/middleware/security');
const { jsonErrorHandler } = require('./src/utils/http');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

let server = null;
let shuttingDown = false;

async function buildApp() {
  const app = express();
  app.set('trust proxy', config.security.trustProxy ? 1 : false);
  app.disable('x-powered-by');
  app.set('etag', 'strong');

  app.use(helmetMiddleware());
  app.use(compression());
  app.use(express.json({ limit: '300kb' }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(sanitizeInputs);

  app.use(
    express.static(PUBLIC_DIR, {
      index: false,
      maxAge: config.isProduction ? '1h' : 0,
      etag: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
        else if (/\.(js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
      }
    })
  );

  const sessionMiddleware = session({
    name: 'cortez.sid',
    secret: config.security.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: createSessionStore(session),
    proxy: config.isProduction,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: config.system.sessionDays * 24 * 60 * 60 * 1000
    }
  });
  app.use(sessionMiddleware);
  app.use(csrfProtection);
  app.use(attachUser);

  app.use((req, res, next) => {
    res.setHeader('X-Cortez-Release', release.version);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.use('/auth', authLimiter, authRoutes);
  app.use('/api', globalLimiter, apiRoutes);

  app.get('/healthz', (req, res) => {
    res.json({
      status: isReady() ? 'ok' : 'degraded',
      db: isReady() ? 'connected' : 'disconnected',
      release: release.version,
      uptime: Math.round(process.uptime()),
      online: realtime.onlineCount(),
      at: new Date().toISOString()
    });
  });

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /api/\nDisallow: /auth/\n');
  });

  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'المسار غير موجود', code: 'NOT_FOUND' });
  });

  let htmlTemplate = '<h1>CORTEZ</h1>';
  try {
    htmlTemplate = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  } catch (error) {
    console.error('[Server] index.html missing:', error.message);
  }

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) return next();
    if (req.path === '/favicon.ico' || req.path.startsWith('/uploads/')) return next();
    const csrfToken = req.session ? req.session.csrfToken || '' : '';
    const html = htmlTemplate
      .replace(/__RELEASE__/g, release.version)
      .replace(/__CSRF__/g, csrfToken);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.type('html').send(html);
  });

  app.use(jsonErrorHandler);

  return { app, sessionMiddleware };
}

async function main() {
  console.log('──────────────────────────────────────────────');
  console.log(`  ${config.org.name} • ${config.org.nameLatin} — منصة المافيا`);
  console.log(`  الإصدار: ${release.version}`);
  console.log('──────────────────────────────────────────────');

  try {
    await connectDB();
  } catch (error) {
    console.error('[Boot] سيعمل الخادم بوضع محدود بدون قاعدة بيانات.');
  }

  if (isReady()) {
    try {
      await ensureSeed();
    } catch (error) {
      console.error('[Boot] seed:', error.message);
    }
  }

  const { app, sessionMiddleware } = await buildApp();

  server = http.createServer(app);
  await realtime.init(server, sessionMiddleware, { release: release.version });

  server.listen(PORT, () => {
    console.log(`[Server] يعمل على المنفذ ${PORT} — http://localhost:${PORT}`);
    if (config.isProduction) console.log('[Server] بيئة إنتاج — الكوكيز آمنة و HSTS مفعّل.');
  });

  if (isReady()) {
    startTasks();
    try {
      startBot();
    } catch (error) {
      console.error('[Boot] bot:', error.message);
    }
  } else {
    console.warn('[Boot] المهام الخلفية والبوت معطّلة حتى تتصل قاعدة البيانات.');
  }

  if (isReady()) {
    setTimeout(() => realtime.broadcastRelease(release.version), 3000);
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[Shutdown] إشارة ${signal} — إغلاق تدريجي...`);
  stopTasks();
  stopBot();
  try {
    if (realtime.getIO()) realtime.getIO().close();
  } catch (error) {
    /* ignore */
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    await disconnectDB();
  } catch (error) {
    /* ignore */
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[UncaughtException]', error);
});

main().catch((error) => {
  console.error('[Boot] فشل إقلاع الخادم:', error);
  process.exit(1);
});
