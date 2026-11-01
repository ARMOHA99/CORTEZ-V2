const config = require('../../config');
const realtime = require('../realtime');
const discordService = require('./discord');
const { getRankByDiscordRole } = require('./ranks');

function mongooseReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

async function resolveRank(user, member) {
  if (config.discord.ownerIds.includes(user.discordId)) return 'owner';
  const mapped = await getRankByDiscordRole(member.roles || []);
  return mapped ? mapped.key : null;
}

async function syncUser(user, options = {}) {
  const { emit = true } = options;
  if (!mongooseReady()) return { skipped: true, reason: 'db' };
  if (!discordService.hasBot() || !config.discord.guildId) return { skipped: true, reason: 'bot' };
  if (!user || !user.discordId || String(user.discordId).startsWith('dev-')) {
    return { skipped: true, reason: 'dev-user' };
  }

  let member;
  try {
    member = await discordService.getGuildMember(user.discordId);
  } catch (error) {
    return { skipped: true, reason: 'fetch-failed', error: error.message };
  }

  const User = require('../models/User');

  if (!member) {
    if (user.inGuild || !user.sessionInvalid) {
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            inGuild: false,
            sessionInvalid: true,
            'duty.status': 'off',
            'duty.shiftId': null
          }
        }
      );
      if (emit) {
        realtime.emitToUser(user._id, 'auth:revoked', {
          reason: 'لم يعد حسابك عضواً في خادم ديسكورد'
        });
        setTimeout(() => realtime.refreshUserSockets(user._id), 700);
      }
    }
    return { revoked: true, reason: 'left-guild' };
  }

  const bannedRole = config.discord.roles.banned;
  if (bannedRole && (member.roles || []).includes(bannedRole)) {
    await User.updateOne(
      { _id: user._id },
      { $set: { blocked: true, sessionInvalid: true, blockReason: 'محظور في خادم ديسكورد' } }
    );
    if (emit) {
      realtime.emitToUser(user._id, 'auth:revoked', { reason: 'تم حظرك في خادم ديسكورد' });
      setTimeout(() => realtime.refreshUserSockets(user._id), 700);
    }
    return { revoked: true, reason: 'banned' };
  }

  const computedRank = await resolveRank(user, member);
  const displayName = member.nick || member.user.globalName || member.user.username || user.username;
  const update = {
    roles: member.roles || [],
    inGuild: true,
    username: member.user.username || user.username,
    globalName: member.user.globalName || user.globalName || '',
    avatar: member.user.avatar || '',
    discriminator: member.user.discriminator || '0',
    displayName,
    joinedGuildAt: member.joinedAt ? new Date(member.joinedAt) : user.joinedGuildAt,
    lastSeen: new Date()
  };

  let rankChanged = false;
  let revoked = false;
  let requireRole = true;
  try {
    requireRole = (await require('./settings').get('access.requireDiscordRole', true)) !== false;
  } catch (error) {
    requireRole = true;
  }

  if (computedRank) {
    if (computedRank !== user.rank) {
      update.rank = computedRank;
      update.rankAssignedAt = new Date();
      update.sessionInvalid = false;
      rankChanged = true;
    }
  } else if (user.rank !== 'guest') {
    update.rank = 'guest';
    update.sessionInvalid = requireRole;
    rankChanged = true;
    revoked = requireRole;
  } else if (requireRole && !user.sessionInvalid) {
    update.sessionInvalid = true;
    revoked = true;
  } else if (!requireRole && user.sessionInvalid) {
    update.sessionInvalid = false;
  }

  await User.updateOne({ _id: user._id }, { $set: update });

  if (emit && (rankChanged || update.displayName !== user.displayName)) {
    realtime.emitToUser(user._id, 'auth:refresh', {
      reason: rankChanged ? 'rank-changed' : 'profile-changed',
      rank: update.rank || user.rank
    });
    if (rankChanged) setTimeout(() => realtime.refreshUserSockets(user._id), 900);
  }

  if (revoked && emit) {
    realtime.emitToUser(user._id, 'auth:revoked', { reason: 'تم سحب رتبتك في ديسكورد' });
  }

  return {
    user: { ...user, ...update },
    member,
    rankChanged,
    revoked,
    oldRank: user.rank,
    newRank: update.rank || user.rank
  };
}

async function syncOnlineUsers() {
  if (!mongooseReady() || !discordService.hasBot()) return 0;
  const presence = realtime.snapshotPresence();
  if (!presence.users.length) return 0;
  let count = 0;
  for (const entry of presence.users.slice(0, 100)) {
    try {
      const User = require('../models/User');
      const user = await User.findById(entry.userId).lean();
      if (!user || String(user.discordId).startsWith('dev-')) continue;
      await syncUser(user);
      count += 1;
    } catch (error) {
      console.error('[Sync] user:', error.message);
    }
  }
  return count;
}

let syncingAll = false;

/* يحدّث أسماء (اسم الشخص داخل سيرفرنا) ورتب كل الأعضاء، وليس المتصلين فقط */
async function syncAllUsers({ delayMs = 150 } = {}) {
  if (syncingAll) return { running: true };
  if (!mongooseReady() || !discordService.hasBot() || !config.discord.guildId) return { skipped: true };
  syncingAll = true;
  const result = { total: 0, renamed: 0, rankChanged: 0, failed: 0 };
  try {
    const User = require('../models/User');
    const users = await User.find({ discordId: { $not: /^dev-/ } }).lean();
    result.total = users.length;
    for (const user of users) {
      try {
        const out = await syncUser(user, { emit: true });
        if (out && out.skipped) {
          result.failed += 1;
        } else if (out && out.user) {
          if (out.user.displayName !== user.displayName) result.renamed += 1;
          if (out.rankChanged) result.rankChanged += 1;
        }
      } catch (error) {
        result.failed += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  } finally {
    syncingAll = false;
  }
  return result;
}

module.exports = { syncUser, syncOnlineUsers, syncAllUsers, resolveRank };
