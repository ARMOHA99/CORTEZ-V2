const express = require('express');
const crypto = require('crypto');
const config = require('../../config');
const discordService = require('../services/discord');
const { getRankByDiscordRole, getRank } = require('../services/ranks');
const { asyncHandler } = require('../utils/http');
const audit = require('../services/audit');

const router = express.Router();

const GUILD_ID = () => config.discord.guildId;

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      return resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) return reject(error);
      return resolve();
    });
  });
}

router.get('/discord', (req, res) => {
  if (!discordService.isConfigured()) {
    return res.redirect('/?error=discord_not_configured');
  }
  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state;
  req.session.oauthAt = Date.now();
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: config.discord.redirectUri,
    response_type: 'code',
    scope: config.discord.scopes.join(' '),
    state,
    prompt: 'consent'
  });
  return res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

router.get(
  '/discord/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`/?error=${encodeURIComponent(String(error))}`);
    if (!code) return res.redirect('/?error=missing_code');
    if (!state || !req.session.oauthState || state !== req.session.oauthState) {
      return res.redirect('/?error=invalid_state');
    }
    if (!req.session.oauthAt || Date.now() - req.session.oauthAt > 10 * 60 * 1000) {
      return res.redirect('/?error=state_expired');
    }
    delete req.session.oauthState;
    delete req.session.oauthAt;

    let tokenData;
    let oauthUser;
    try {
      tokenData = await discordService.exchangeCode(String(code));
      oauthUser = await discordService.fetchOAuthUser(tokenData.access_token);
    } catch (exchangeError) {
      console.error('[Auth] OAuth:', exchangeError.message);
      return res.redirect('/?error=oauth_failed');
    }

    let member = null;
    try {
      member = await discordService.getGuildMember(oauthUser.id);
    } catch (memberError) {
      console.warn('[Auth] member lookup:', memberError.message);
    }

    let inGuild = Boolean(member);
    if (!inGuild) {
      try {
        const guilds = await discordService.fetchOAuthGuilds(tokenData.access_token);
        inGuild = Array.isArray(guilds) && guilds.some((guild) => guild.id === GUILD_ID());
      } catch (guildError) {
        inGuild = false;
      }
    }

    if (!inGuild) {
      return res.redirect('/?error=not_in_guild');
    }

    if (member) {
      const bannedRole = config.discord.roles.banned;
      if (bannedRole && (member.roles || []).includes(bannedRole)) {
        return res.redirect('/?error=banned');
      }
    }

    const User = require('../models/User');
    const existing = await User.findOne({ discordId: String(oauthUser.id) });
    if (existing && existing.blocked) {
      return res.redirect('/?error=blocked');
    }

    let rankKey = existing ? existing.rank : 'guest';
    if (config.discord.ownerIds.includes(String(oauthUser.id))) {
      rankKey = 'owner';
    } else if (member) {
      const mappedRank = await getRankByDiscordRole(member.roles || []);
      if (mappedRank) rankKey = mappedRank.key;
    }

    const rank = await getRank(rankKey);
    if (!rank) rankKey = 'guest';

    const displayName =
      (member && member.nick) ||
      oauthUser.global_name ||
      oauthUser.username ||
      (existing && existing.displayName) ||
      'عضو';

    const update = {
      username: oauthUser.username || '',
      globalName: oauthUser.global_name || '',
      displayName,
      avatar: oauthUser.avatar || '',
      discriminator: oauthUser.discriminator || '0',
      roles: member ? member.roles || [] : existing ? existing.roles : [],
      inGuild: true,
      blocked: false,
      sessionInvalid: false,
      verifiedAt: new Date(),
      lastLogin: new Date(),
      lastSeen: new Date(),
      rank: rankKey,
      rankAssignedAt:
        existing && existing.rank === rankKey ? existing.rankAssignedAt || new Date() : new Date(),
      joinedGuildAt: member && member.joinedAt ? new Date(member.joinedAt) : existing ? existing.joinedGuildAt : null
    };

    const user = await User.findOneAndUpdate(
      { discordId: String(oauthUser.id) },
      { $set: update, $setOnInsert: { 'preferences.sound': true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await regenerateSession(req);
    req.session.userId = user._id;
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    req.session.loggedInAt = Date.now();
    await saveSession(req);

    await audit.log({
      actor: user,
      action: 'auth.login',
      description: `تسجيل دخول عبر ديسكورد (${user.displayName})`,
      targetType: 'user',
      targetId: String(user._id),
      req
    });

    return res.redirect('/#/dashboard');
  })
);

router.post(
  '/dev',
  asyncHandler(async (req, res) => {
    if (!config.devLogin || config.isProduction) {
      return res.status(403).json({ error: 'تسجيل الدخول التجريبي معطل', code: 'DEV_DISABLED' });
    }
    const requested = String(req.body.rankKey || 'owner');
    const { RANKS } = require('../constants/permissions');
    const rank = RANKS.find((entry) => entry.key === requested) || RANKS[0];
    const names = {
      owner: 'دون كورتاس',
      operations: 'ضابط العمليات',
      business: 'البزنس مانجر',
      member: 'عضو كورتاس',
      store: 'مسؤول المتجر',
      guest: 'زائر'
    };
    const User = require('../models/User');
    const discordId = `dev-${rank.key}`;
    const user = await User.findOneAndUpdate(
      { discordId },
      {
        $set: {
          username: `dev_${rank.key}`,
          displayName: names[rank.key] || rank.name,
          globalName: names[rank.key] || rank.name,
          avatar: '',
          rank: rank.key,
          inGuild: true,
          blocked: false,
          sessionInvalid: false,
          verifiedAt: new Date(),
          lastLogin: new Date(),
          lastSeen: new Date()
        },
        $setOnInsert: { roles: [], stats: {}, bloodPact: { signed: false, version: 0 } }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await regenerateSession(req);
    req.session.userId = user._id;
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    req.session.loggedInAt = Date.now();
    await saveSession(req);

    await audit.log({
      actor: user,
      action: 'auth.dev-login',
      description: `دخول تجريبي برتبة ${rank.name}`,
      targetType: 'user',
      targetId: String(user._id),
      req
    });

    return res.json({
      ok: true,
      user: user.toJSON(),
      redirect: '/#/dashboard',
      note: 'هذا الدخول التجريبي متاح فقط خارج بيئة الإنتاج.'
    });
  })
);

router.post('/logout', (req, res) => {
  const cookieName = 'cortez.sid';
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie(cookieName);
      res.json({ ok: true });
    });
  } else {
    res.clearCookie(cookieName);
    res.json({ ok: true });
  }
});

module.exports = router;
