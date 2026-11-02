/* ═══════════════════════════════════════════════════════════════════════
   هوية قابلة للمشاركة: /u/:id  (صفحة) و /u/:id.png (صورة ديناميكية)
   أي رابط بطاقة يُشارك في ديسكورد أو واتساب يظهر بصورته لا بمربع فارغ.
   ═══════════════════════════════════════════════════════════════════════ */

const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../../config');
const { asyncHandler } = require('../utils/http');
const streakService = require('../services/streak');

const router = express.Router();

const IMAGE_TTL = 5 * 60 * 1000;
const imageCache = new Map();

const cardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'طلبات كثيرة على البطاقات. حاول بعد قليل.', code: 'CARD_RATE_LIMIT' }
});

function dbReady() {
  return require('mongoose').connection.readyState === 1;
}

async function findUser(raw) {
  if (!dbReady()) return null;
  const mongoose = require('mongoose');
  const User = require('../models/User');
  const value = String(raw || '').trim();
  if (!value) return null;
  const query = mongoose.isValidObjectId(value) ? { _id: value } : { discordId: value };
  return User.findOne(query);
}

function baseUrl(req) {
  const configured = String(process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  return `${req.protocol}://${req.get('host')}`;
}

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatHours(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return hours ? `${hours} س ${mins} د` : `${mins} د`;
}

async function buildCardData(raw) {
  const user = await findUser(raw);
  if (!user) return null;
  if (user.blocked || !user.inGuild) return null;
  const memberCard = require('../services/memberCard');
  const card = await memberCard.build(user._id);
  if (!card) return null;
  const streak = await streakService.compute(user._id).catch(() => null);
  return { card, streak, id: String(user._id) };
}

async function renderPng(raw) {
  const cached = imageCache.get(raw);
  if (cached && Date.now() - cached.at < IMAGE_TTL) return cached.buffer;

  const data = await buildCardData(raw);
  if (!data) return null;
  const { generateCard } = require('../bot/card');
  const buffer = await generateCard({ ...data.card, streak: data.streak });
  if (imageCache.size > 200) imageCache.clear();
  imageCache.set(raw, { buffer, at: Date.now() });
  return buffer;
}

router.get(
  '/u/:id.png',
  cardLimiter,
  asyncHandler(async (req, res) => {
    const buffer = await renderPng(req.params.id);
    if (!buffer) {
      return res.status(404).type('text/plain').send('CORTEZ — بطاقة غير موجودة');
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    res.send(buffer);
  })
);

router.get(
  '/u/:id',
  cardLimiter,
  asyncHandler(async (req, res) => {
    const data = await buildCardData(req.params.id).catch(() => null);
    const origin = baseUrl(req);
    const pageUrl = `${origin}/u/${encodeURIComponent(req.params.id)}`;
    const imageUrl = `${pageUrl}.png`;
    const org = config.org;

    if (!data) {
      return res.status(404).type('html').send(`<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>بطاقة غير موجودة — ${escapeHtml(org.nameLatin)}</title>
<meta name="robots" content="noindex" />
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0c;color:#f4f1f2;font-family:system-ui,sans-serif;text-align:center}a{color:#22c55e}</style>
</head><body><div><h1>بطاقة غير موجودة</h1><p style="color:#9b9296">هذا العضو غير مسجّل أو غير مفعّل.</p><a href="/">العودة إلى ${escapeHtml(org.name)}</a></div></body></html>`);
    }

    const { card, streak } = data;
    const name = card.user?.name || 'عضو';
    const rankName = card.rank?.name || 'عضو';
    const hours = formatHours(card.duty?.totalMinutes || 0);
    const weekHours = formatHours(card.duty?.weeklyMinutes || 0);
    const ops = Number(card.operations?.total || 0);
    const wins = Number(card.operations?.wins || 0);
    const winRate = Number(card.operations?.winRate || 0);
    const streakDays = streak?.currentStreak || 0;
    const medals = Array.isArray(streak?.medals) ? streak.medals.slice(0, 4) : [];

    const description = streakDays
      ? `سلسلة ${streakDays} يوم متتالٍ على الدوام • ${hours} إجمالي • ${ops} عملية`
      : `${hours} ساعات دوام • ${ops} عملية • ${wins} انتصار`;

    /* أوسمة الإنجازات: أيقونات صغيرة بلون كل وسام */
    const badgeItems = Array.isArray(card.badges?.items) ? card.badges.items : [];
    const badgeTotal = Number(card.badges?.total || badgeItems.length);
    const badgeHtml = badgeItems
      .map(
        (item) =>
          `<span class="badge-chip" style="--bc:${escapeHtml(item.color || '#22c55e')}" title="${escapeHtml(item.name)}"><span class="badge-ico">${escapeHtml(item.icon)}</span><span class="badge-name">${escapeHtml(item.name)}</span></span>`
      )
      .join('');

    const medalHtml = medals
      .map(
        (medal) =>
          `<span class="medal medal-${escapeHtml(medal.tone || 'info')}">${escapeHtml(medal.icon)} ${escapeHtml(medal.label)}</span>`
      )
      .join('');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<title>${escapeHtml(name)} — ${escapeHtml(rankName)} | ${escapeHtml(org.nameLatin)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:type" content="profile" />
<meta property="og:site_name" content="${escapeHtml(org.nameLatin)}" />
<meta property="og:title" content="${escapeHtml(name)} — ${escapeHtml(rankName)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(imageUrl)}" />
<meta property="og:image:width" content="1000" />
<meta property="og:image:height" content="600" />
<meta property="og:url" content="${escapeHtml(pageUrl)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(name)} — ${escapeHtml(rankName)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
<style>
  :root{--primary:#22c55e;--surface:#111114;--line:rgba(255,255,255,.09);--text:#f4f1f2;--muted:#9b9296}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;background:radial-gradient(1200px 600px at 50% -10%,rgba(230,57,70,.18),transparent 60%),#0a0a0c;color:var(--text);font-family:"Tajawal","Cairo",system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;padding:28px 16px 56px}
  .wrap{width:100%;max-width:720px}
  .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
  .brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.08em;text-decoration:none;color:var(--text)}
  .sigil{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:rgba(230,57,70,.16);border:1px solid rgba(230,57,70,.45);color:var(--primary);font-weight:900}
  .card{background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.015));border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:0 30px 80px rgba(0,0,0,.55)}
  .card img{width:100%;height:auto;border-radius:14px;display:block;border:1px solid var(--line)}
  .meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
  .pill{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid var(--line);font-size:14px;font-weight:600}
  .pill b{font-weight:800;font-size:16px}
  .streak{background:rgba(255,143,163,.12);border-color:rgba(255,143,163,.4);color:#ffd5dc}
  .medals{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .medal{font-size:13px;padding:7px 12px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.03)}
  .medal-primary{color:#ffb3bb;border-color:rgba(230,57,70,.45);background:rgba(230,57,70,.12)}
  .medal-success{color:#a7f3c9;border-color:rgba(46,204,113,.4);background:rgba(46,204,113,.1)}
  .medal-warning{color:#ffd9a3;border-color:rgba(245,166,35,.4);background:rgba(245,166,35,.1)}
  .medal-danger{color:#ffb3bb;border-color:rgba(230,57,70,.5);background:rgba(230,57,70,.14)}
  .badges-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
  .badge-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700;color:var(--text);background:color-mix(in srgb,var(--bc) 16%,transparent);border:1px solid color-mix(in srgb,var(--bc) 45%,transparent)}
  .badge-ico{font-size:13px;line-height:1}
  .badge-more{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;font-size:11px;color:var(--muted);border:1px solid var(--line);background:rgba(255,255,255,.03)}
  .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;border:1px solid transparent}
  .btn-primary{background:var(--primary);color:#fff}
  .btn-ghost{background:rgba(255,255,255,.04);border-color:var(--line);color:var(--text)}
  .muted{color:var(--muted);font-size:13px;margin-top:18px;text-align:center}
</style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <a class="brand" href="/"><span class="sigil">C</span><span>${escapeHtml(org.nameLatin)}</span></a>
      <a class="btn btn-ghost" href="/">المنصة</a>
    </div>
    <div class="card">
      <img src="${escapeHtml(imageUrl)}" alt="بطاقة ${escapeHtml(name)}" width="1000" height="600" />
      <div class="meta">
        <span class="pill">⏱ إجمالي <b>${escapeHtml(hours)}</b></span>
        <span class="pill">📅 هذا الأسبوع <b>${escapeHtml(weekHours)}</b></span>
        <span class="pill">⚔ ${ops} عملية</span>
        <span class="pill">🏆 ${winRate}% فوز</span>
        ${streakDays ? `<span class="pill streak">🔥 سلسلة <b>${streakDays}</b> يوم</span>` : ''}
      </div>
      ${badgeHtml ? `<div class="badges-row">${badgeHtml}${badgeTotal > badgeItems.length ? `<span class="badge-more">+${badgeTotal - badgeItems.length}</span>` : ''}</div>` : ''}
      ${medalHtml ? `<div class="medals">${medalHtml}</div>` : ''}
      <div class="actions">
        <a class="btn btn-primary" href="${escapeHtml(imageUrl)}" download="cortez-${escapeHtml(data.id)}.png">تحميل البطاقة</a>
        <a class="btn btn-ghost" href="/#/leaderboard">المتصدّرون</a>
      </div>
    </div>
    <p class="muted">${escapeHtml(org.motto || '')} — ${escapeHtml(org.nameLatin)}</p>
  </div>
</body>
</html>`);
  })
);

module.exports = router;
