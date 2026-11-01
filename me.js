const express = require('express');
const config = require('../../config');
const { asyncHandler, httpError } = require('../utils/http');
const { requireAuth } = require('../middleware/auth');
const { permissionsOf } = require('../services/ranks');
const pactService = require('../services/pact');
const dutyService = require('../services/duty');
const notify = require('../services/notify');
const memberCard = require('../services/memberCard');
const syncService = require('../services/sync');
const realtime = require('../realtime');

const router = express.Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const pactStatus = await pactService.statusFor(req.user);
    const unread = await notify.unreadCount(req.user._id);
    const Notifications = require('../models/Notification');
    const latest = await Notifications.find({ user: req.user._id, read: false })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();
    const duty = await dutyService.personalSummary(req.user._id);
    res.json({
      user: req.user.toJSON(),
      rank: req.rank,
      permissions: permissionsOf(req.rank),
      pact: pactStatus,
      notifications: { unread, items: latest },
      duty,
      release: require('../release').version,
      serverTime: new Date().toISOString(),
      online: realtime.onlineCount()
    });
  })
);

router.get(
  '/sync-check',
  requireAuth,
  asyncHandler(async (req, res) => {
    const discordService = require('../services/discord');
    const { getRanks } = require('../services/ranks');
    const out = {
      botTokenSet: Boolean(config.bot.token),
      botEnabled: Boolean(config.bot.enabled),
      botReady: discordService.isReady(),
      guildIdSet: Boolean(config.discord.guildId),
      yourDiscordIdIsInOwnerIds: config.discord.ownerIds.includes(String(req.user.discordId)),
      yourCurrentRank: req.user.rank
    };
    try {
      const status = await discordService.getBotStatus();
      out.botName = status.tag || '';
      out.botInsideServer = status.guildFound;
      out.botError = status.lastError || '';
    } catch (error) {
      out.botName = '';
    }
    if (!out.botTokenSet || !out.guildIdSet) {
      out.problem = 'توكن البوت أو رقم السيرفر غير مضبوط على Render لهذا الموقع، لذلك لا تحدث أي مزامنة للرولات.';
      return res.json(out);
    }
    try {
      const member = await discordService.getGuildMember(req.user.discordId);
      out.memberFound = Boolean(member);
      out.yourDiscordRoleIds = member ? member.roles : [];
      const ranks = await getRanks(true);
      out.ranksLinkedToDiscordRoles = ranks
        .filter((rank) => rank.discordRoleId)
        .map((rank) => ({ rank: rank.key, roleId: rank.discordRoleId, roleName: rank.discordRoleName || '' }));
      const matched = ranks
        .filter((rank) => rank.discordRoleId && (out.yourDiscordRoleIds || []).includes(rank.discordRoleId))
        .sort((a, b) => b.level - a.level)[0];
      out.rankFromYourRoles = matched ? matched.key : null;
      if (!member) out.problem = 'البوت لا يرى حسابك داخل السيرفر (تأكد أن البوت داخل نفس السيرفر وأن DISCORD_GUILD_ID صحيح).';
      else if (!out.ranksLinkedToDiscordRoles.length) out.problem = 'لا توجد أي رتبة في الموقع مربوطة برول ديسكورد. اربط الرتب من لوحة الإدارة ثم الرتب.';
      else if (!matched) out.problem = 'أنت لا تملك أي رول من الرولات المربوطة بالرتب.';
      else out.problem = '';
    } catch (error) {
      out.problem = 'البوت لم يستطع قراءة العضو من ديسكورد: ' + error.message + ' (غالبًا التوكن خاطئ أو البوت ليس داخل السيرفر).';
    }
    return res.json(out);
  })
);

router.post(
  '/sync',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await syncService.syncUser(req.user, { emit: false });
    if (result.revoked) {
      throw httpError(403, 'تم سحب صلاحيتك أو حظرك في ديسكورد', 'REVOKED');
    }
    const User = require('../models/User');
    const fresh = await User.findById(req.user._id);
    res.json({
      ok: true,
      user: fresh.toJSON(),
      rank: await require('../services/ranks').getRank(fresh.rank),
      skipped: Boolean(result.skipped)
    });
  })
);

router.get(
  '/pact',
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = await pactService.statusFor(req.user);
    res.json(status);
  })
);

router.post(
  '/pact/sign',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await pactService.sign({ user: req.user, req });
    res.json({ ok: true, ...result });
  })
);

router.get(
  '/notifications',
  requireAuth,
  asyncHandler(async (req, res) => {
    const Notification = require('../models/Notification');
    const items = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(60).lean();
    const unread = items.filter((item) => !item.read).length;
    res.json({ items, unread });
  })
);

router.post(
  '/notifications/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    const Notification = require('../models/Notification');
    await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } });
    res.json({ ok: true });
  })
);

router.post(
  '/notifications/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const Notification = require('../models/Notification');
    await Notification.updateOne(
      { _id: req.params.id, user: req.user._id },
      { $set: { read: true } }
    );
    res.json({ ok: true });
  })
);

router.patch(
  '/preferences',
  requireAuth,
  asyncHandler(async (req, res) => {
    const sound = Boolean(req.body.sound);
    const User = require('../models/User');
    await User.updateOne({ _id: req.user._id }, { $set: { 'preferences.sound': sound } });
    res.json({ ok: true, sound });
  })
);

router.get(
  '/card',
  requireAuth,
  asyncHandler(async (req, res) => {
    const card = await memberCard.build(req.user._id, req.user);
    res.json({ card });
  })
);

router.get(
  '/export',
  requireAuth,
  asyncHandler(async (req, res) => {
    const summary = await dutyService.personalSummary(req.user._id);
    res.json({
      user: { name: req.user.displayName, discordId: req.user.discordId, rank: req.rank ? req.rank.name : req.user.rank },
      summary,
      currency: config.system.currencyLabel
    });
  })
);

module.exports = router;
