const express = require('express');
const config = require('../../config');
const release = require('../release');
const publicConfig = require('../publicConfig');
const { asyncHandler, httpError } = require('../utils/http');
const ordersService = require('../services/orders');
const realtime = require('../realtime');
const settingsService = require('../services/settings');

const router = express.Router();

function dbReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

router.get(
  '/discord-health',
  asyncHandler(async (req, res) => {
    const discordService = require('../services/discord');
    const probe = await discordService.probeDiscord();
    const diag = discordService.getOAuthDiagnostics();
    res.json({
      time: new Date().toISOString(),
      apiProxyInUse: Boolean(process.env.DISCORD_API_BASE),
      clientConfigured: Boolean(config.discord.clientId && config.discord.clientSecret),
      botTokenSet: Boolean(config.bot.token),
      probeDiscordFromThisServer: probe,
      lastLoginFailure: diag.lastFailure,
      lastLoginSuccessAt: diag.lastSuccessAt,
      verdict: !probe.reachable
        ? 'الخادم لا يستطيع الوصول إلى ديسكورد إطلاقاً'
        : probe.cloudflareBlock
          ? 'ديسكورد/Cloudflare يحظر عنوان هذا الخادم (حظر على مستوى IP)'
          : probe.status === 429
            ? 'ديسكورد يحدّ من طلبات هذا الخادم مؤقتاً'
            : probe.ok
              ? 'الاتصال بديسكورد سليم من هذا الخادم'
              : 'ديسكورد يرد بحالة غير متوقعة: ' + probe.status
    });
  })
);

router.get(
  '/config',
  asyncHandler(async (req, res) => {
    const payload = publicConfig(req);
    let settings = {};
    try {
      settings = await settingsService.getAll();
    } catch (error) {
      settings = {};
    }
    const invite = String(settings['discord.inviteUrl'] || '').trim();
    res.json({
      ...payload,
      discord: { ...(payload.discord || {}), inviteUrl: invite },
      links: { ...(payload.links || {}), discordInvite: invite },
      nightShift: settings['system.nightShift'] || (payload.system && payload.system.nightShift) || null,
      org: {
        ...(payload.org || {}),
        name: settings['organization.name'] || 'CORTEZ',
        logoUrl: settings['organization.logoUrl'] || ''
      },
      attendanceEnabled: settings['attendance.enabled'] !== false,
      release: release.version,
      serverTime: new Date().toISOString()
    });
  })
);

router.get('/version', (req, res) => {
  res.json({ release: release.version, at: release.builtAt });
});

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    if (!dbReady()) {
      return res.json({
        members: 0,
        operations: 0,
        wins: 0,
        online: realtime.onlineCount(),
        weekLabel: '',
        db: false
      });
    }
    const User = require('../models/User');
    const Operation = require('../models/Operation');
    const goalService = require('../services/goal');
    const context = await goalService.weekContext();
    const weekKey = context.weekKey;
    const [members, ops, wins] = await Promise.all([
      User.countDocuments({ inGuild: true, blocked: false }),
      Operation.countDocuments({}),
      Operation.countDocuments({ result: 'win' })
    ]);
    return res.json({
      members,
      operations: ops,
      wins,
      online: realtime.onlineCount(),
      weekKey,
      db: true
    });
  })
);

/* المتجر الخارجي لم يعد عاماً: يلزم تسجيل الدخول برتبة تملك صلاحية المتجر (store:view) */
router.use(['/products', '/orders'], (req, res) => {
  res.status(401).json({
    error: 'المتجر الخارجي لحاملي رول المتجر فقط. سجّل الدخول عبر ديسكورد.',
    code: 'SHOP_LOGIN_REQUIRED'
  });
});

module.exports = router;
