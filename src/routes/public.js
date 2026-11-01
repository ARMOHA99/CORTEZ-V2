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
        logoUrl: settings['organization.logoUrl'] || '',
        tagline: settings['organization.tagline'] || (payload.org && payload.org.tagline) || '',
        motto: settings['organization.motto'] || (payload.org && payload.org.motto) || '',
        description: settings['organization.description'] || (payload.org && payload.org.description) || ''
      },
      landing: {
        eyebrow: settings['landing.eyebrow'] || '',
        ctaPrimary: settings['landing.ctaPrimary'] || '',
        ctaStore: settings['landing.ctaStore'] || '',
        statMembers: settings['landing.statMembers'] || '',
        statOperations: settings['landing.statOperations'] || '',
        statOnline: settings['landing.statOnline'] || '',
        footerNote: settings['landing.footerNote'] || ''
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

/* ── من في الدوام الآن: يُستخدم في الشريط الحيّ ───────────────────────── */
router.get(
  '/on-duty',
  asyncHandler(async (req, res) => {
    if (!dbReady()) return res.json({ count: 0, items: [], db: false });
    const Shift = require('../models/Shift');
    const dutyService = require('../services/duty');
    const shifts = await Shift.find({ status: { $in: ['active', 'paused'] } })
      .sort({ startAt: -1 })
      .limit(40)
      .populate({ path: 'user', select: 'displayName username rank avatar avatarUrl blocked inGuild' })
      .lean();

    const visible = shifts.filter((shift) => shift.user && !shift.user.blocked && shift.user.inGuild);
    const isMember = Boolean(req.user);
    const items = visible.slice(0, 12).map((shift) => {
      const payload = dutyService.serializeShift(shift);
      const displayName = shift.user.displayName || shift.user.username || 'عضو';
      return {
        id: String(shift.user._id),
        name: isMember ? displayName : '',
        initial: displayName.slice(0, 1),
        rank: shift.user.rank || '',
        avatar: shift.user.avatar || '',
        since: shift.startAt,
        status: shift.status,
        liveMinutes: payload.liveMinutes || 0,
        breakLiveMinutes: payload.breakLiveMinutes || 0
      };
    });

    res.json({ count: visible.length, items, member: isMember, at: new Date().toISOString() });
  })
);

/* ── غرفة الأخبار: شريط أحداث مبني على AuditLog ─────────────────────────── */
const FEED_LABELS = {
  'duty.start.discord': { label: 'بدأ دوامه من ديسكورد', tone: 'success' },
  'duty.end.discord': { label: 'أنهى دوامه من ديسكورد', tone: 'muted' },
  'duty.penalty': { label: 'خصم ساعات دوام', tone: 'warning' },
  'operation.create': { label: 'سُجّلت عملية', tone: 'primary' },
  'member.rank': { label: 'ترقية/تعديل رتبة', tone: 'primary' },
  'treasury.transaction': { label: 'حركة في الخزينة', tone: 'muted' },
  'order.create': { label: 'طلب جديد في المتجر', tone: 'info' },
  'order.status': { label: 'تحديث حالة طلب', tone: 'info' },
  'announcement.create': { label: 'إعلان جديد', tone: 'warning' },
  'pact.updated': { label: 'تحديث عقد الدم', tone: 'muted' },
  'auth.login': { label: 'دخول إلى المنصة', tone: 'muted' }
};

router.get(
  '/feed',
  asyncHandler(async (req, res) => {
    if (!dbReady()) return res.json({ items: [], db: false });
    const AuditLog = require('../models/AuditLog');
    const rows = await AuditLog.find({ action: { $in: Object.keys(FEED_LABELS) } })
      .sort({ createdAt: -1 })
      .limit(24)
      .select('action actorName description targetType createdAt')
      .lean();

    res.json({
      items: rows.map((row) => {
        const meta = FEED_LABELS[row.action] || { label: row.action, tone: 'muted' };
        return {
          id: String(row._id),
          action: row.action,
          label: meta.label,
          tone: meta.tone,
          actor: row.actorName || 'النظام',
          description: String(row.description || '').slice(0, 160),
          at: row.createdAt
        };
      }),
      at: new Date().toISOString()
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
