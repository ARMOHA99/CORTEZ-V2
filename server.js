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
let cardRoutes = null;
try {
  cardRoutes = require('./src/routes/cardpage');
} catch (error) {
  console.warn('[Server] صفحات المشاركة /u/:id معطّلة — ملف src/routes/cardpage.js مفقود:', error.message);
}
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

  /* ══ أصول بإصدار: كل ملف JS يُقدَّم بمعامل الإصدار داخل استيراداته،
     فيُخزَّن في المتصفح سنة كاملة (immutable) وأي نشر يغيّر الرابط بالكامل ══ */
  const ASSET_CACHE = 'public, max-age=31536000, immutable';
  const jsCache = new Map();
  let cssBundle = { key: '', body: '' };

  function versionImports(code, version) {
    const withV = (spec) => (spec.includes('?v=') ? spec : `${spec}?v=${version}`);
    code = code.replace(/(\bfrom\s*['"])(\.[^'"]+?)(['"])/g, (m, a, spec, c) => a + withV(spec) + c);
    code = code.replace(/(\bimport\(\s*['"])(\.[^'"]+?)(['"]\s*\))/g, (m, a, spec, c) => a + withV(spec) + c);
    return code;
  }

  function minifyCss(css) {
    return css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      /* لا نلمس + لأن حذف المسافات حولها يُبطل calc() ويُسقط الخاصية كاملة */
      .replace(/\s*([{}:;,>~])\s*/g, '$1')
      .replace(/\s+and\s+/g, ' and ')
      .replace(/;}/g, '}')
      .trim();
  }

  app.use('/js', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!req.path.endsWith('.js')) return next();
    const rel = decodeURIComponent(req.path).replace(/^\/+/, '');
    if (!rel || rel.includes('..')) return next();
    const file = path.join(PUBLIC_DIR, 'js', rel);
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) return next();
      const key = `${file}:${stat.mtimeMs}`;
      let body = jsCache.get(key);
      if (!body) {
        try {
          body = versionImports(fs.readFileSync(file, 'utf8'), release.version);
        } catch (readError) {
          return next();
        }
        if (jsCache.size > 400) jsCache.clear();
        jsCache.set(key, body);
      }
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', ASSET_CACHE);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(body);
    });
  });

  app.get('/css/app.css', (req, res) => {
    const files = ['style.css', 'views.css', 'extras.css', 'identity.css'].map((name) => path.join(PUBLIC_DIR, 'css', name));
    let key = release.version;
    const parts = [];
    for (const file of files) {
      try {
        const stat = fs.statSync(file);
        key += `:${stat.mtimeMs}:${stat.size}`;
        parts.push(fs.readFileSync(file, 'utf8'));
      } catch (error) {
        /* ملف مفقود: نتجاوزه */
      }
    }
    if (!parts.length) return res.status(404).type('text/plain').send('CSS bundle unavailable');
    if (cssBundle.key !== key) cssBundle = { key, body: minifyCss(parts.join('\n')) };
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    res.setHeader('Cache-Control', ASSET_CACHE);
    return res.send(cssBundle.body);
  });

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

  /* ملفات محركات البحث: تُبنى من النطاق الفعلي فتظل صحيحة عند تغيير الدومين */
  function publicBaseUrl(req) {
    const configured = (process.env.BASE_URL || '').trim();
    if (configured) return configured.replace(/\/+$/, '');
    return `${req.protocol}://${req.get('host')}`;
  }

  app.get('/robots.txt', (req, res) => {
    const base = publicBaseUrl(req);
    res.type('text/plain').send([
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /auth/',
      '',
      `Sitemap: ${base}/sitemap.xml`,
      ''
    ].join('\n'));
  });

  app.get('/sitemap.xml', (req, res) => {
    const base = publicBaseUrl(req);
    const pages = [['/', '1.0', 'daily']];
    const urls = pages.map(([route, priority, freq]) => [
      '  <url>',
      `    <loc>${base}${route}</loc>`,
      `    <changefreq>${freq}</changefreq>`,
      `    <priority>${priority}</priority>`,
      '  </url>'
    ].join('\n')).join('\n');
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
    );
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

  /* صفحات المشاركة: /u/:id وصورة البطاقة /u/:id.png */
  if (cardRoutes) app.use('/', cardRoutes);

  /* إنقاذ المتصفحات العالقة على نسخة قديمة من الـ Service Worker:
     يمسح كل الكاش والتسجيلات ثم يعيد الزائر إلى الصفحة الرئيسية بكود جديد. */
  app.get('/reset-app', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.type('html').send(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>تحديث CORTEZ</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0c;color:#f4f1f2;font-family:system-ui,sans-serif;text-align:center;padding:24px}
h1{font-size:22px;margin-bottom:10px}p{color:#9b9296;line-height:1.7;margin:4px 0}a{color:#e63946;font-weight:700}</style></head>
<body><div><h1>جارٍ تحديث نسختك من الموقع…</h1><p id="msg">نمسح الملفات القديمة</p>
<p><a id="manual" href="/" style="display:none">افتح الموقع</a></p></div>
<script>
(async function () {
  var msg = document.getElementById('msg');
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      var regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(function (r) { return r.unregister(); }));
    }
  } catch (e) {}
  try {
    if (window.caches && caches.keys) {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }
  } catch (e) {}
  try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
  msg.textContent = 'تم. نفتح الموقع الآن…';
  setTimeout(function () { window.location.replace('/?_v=' + Date.now()); }, 700);
  setTimeout(function () { document.getElementById('manual').style.display = 'inline-block'; }, 3500);
})();
</script></body></html>`);
  });

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) return next();
    if (req.path === '/favicon.ico' || req.path.startsWith('/uploads/')) return next();
    const csrfToken = req.session ? req.session.csrfToken || '' : '';
    const html = htmlTemplate
      .replace(/__RELEASE__/g, release.version)
      .replace(/__RELEASE_SHORT__/g, release.version.slice(0, 7))
      .replace(/__CSRF__/g, csrfToken);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.type('html').send(html);
  });

  app.use(jsonErrorHandler);

  return { app, sessionMiddleware };
}

/* بناء الفهارس المركّبة بعد الإقلاع — لا يعطّل تشغيل الخادم */
async function ensureIndexes() {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return;
    const models = ['Order', 'Transaction', 'Badge', 'MarketListing', 'Shift', 'Discipline'];
    for (const name of models) {
      try {
        await require(`./src/models/${name}`).createIndexes();
      } catch (error) {
        /* نموذج بلا فهارس جديدة */
      }
    }
    console.log('[DB] الفهارس المركّبة جاهزة');
  } catch (error) {
    console.error('[DB] ensureIndexes:', error.message);
  }
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
  setTimeout(() => { ensureIndexes(); }, 5000);

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
