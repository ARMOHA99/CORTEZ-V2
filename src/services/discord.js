const config = require('../../config');

let client = null;

const API = config.discord.api;

function setClient(discordClient) {
  client = discordClient;
}

function getClient() {
  return client;
}

function hasBot() {
  return Boolean(config.bot.token && config.bot.enabled);
}

function isReady() {
  return Boolean(client && client.isReady());
}

async function rest(path, options = {}) {
  if (!hasBot()) {
    const error = new Error('بوت ديسكورد غير مهيأ');
    error.code = 'BOT_NOT_CONFIGURED';
    throw error;
  }
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const headers = {
    Authorization: `Bot ${config.bot.token}`,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(12000)
  });
  if (response.status === 429) {
    const data = await response.json().catch(() => ({}));
    await new Promise((resolve) => setTimeout(resolve, Math.min(5000, (data.retry_after || 1) * 1000)));
    return rest(path, options);
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Discord API ${response.status}: ${text.slice(0, 300)}`);
  }
  if (response.status === 204) return true;
  return response.json();
}

async function exchangeCode(code) {
  if (!config.discord.clientId || !config.discord.clientSecret) {
    throw new Error('DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET غير مهيأة');
  }
  const body = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.discord.redirectUri
  });
  const response = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`فشل تبادل كود OAuth2: ${data.error_description || response.status}`);
  }
  return data;
}

async function refreshToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });
  const response = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) return null;
  return response.json();
}

async function fetchOAuthUser(accessToken) {
  const response = await fetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error('فشل جلب بيانات حساب ديسكورد');
  return response.json();
}

async function fetchOAuthGuilds(accessToken) {
  const response = await fetch(`${API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) return [];
  return response.json();
}

function normalizeMember(member) {
  if (!member) return null;
  const user = member.user || member;
  return {
    inGuild: true,
    roles: Array.isArray(member.roles) ? member.roles.map(String) : [],
    nick: member.nick || null,
    joinedAt: member.joined_at || member.joinedAt || null,
    user: {
      id: String(user.id),
      username: user.username || '',
      globalName: user.global_name || user.globalName || '',
      avatar: user.avatar || '',
      discriminator: user.discriminator || '0',
      bot: Boolean(user.bot)
    }
  };
}

async function getGuildMember(discordId) {
  if (!config.discord.guildId) return null;
  if (isReady()) {
    try {
      const guild = client.guilds.cache.get(config.discord.guildId);
      if (!guild) return null;
      const member = await guild.members.fetch({ user: discordId, force: true });
      return normalizeMember(member);
    } catch (error) {
      if (error.code === 10007 || error.status === 404) return null;
      console.error('[Discord] fetch member:', error.message);
    }
  }
  if (!hasBot()) return null;
  try {
    const member = await rest(`/guilds/${config.discord.guildId}/members/${discordId}`);
    return normalizeMember(member);
  } catch (error) {
    console.error('[Discord] REST member:', error.message);
    return null;
  }
}

async function assignRole(discordId, roleId) {
  if (!roleId) return false;
  if (isReady()) {
    try {
      const guild = client.guilds.cache.get(config.discord.guildId);
      if (!guild) return false;
      const member = await guild.members.fetch({ user: discordId, force: true }).catch(() => null);
      if (!member) return false;
      await member.roles.add(roleId, 'CORTEZ Platform Sync');
      return true;
    } catch (error) {
      console.error('[Discord] assign role:', error.message);
      return false;
    }
  }
  if (!hasBot()) return false;
  try {
    await rest(`/guilds/${config.discord.guildId}/members/${discordId}/roles/${roleId}`, { method: 'PUT' });
    return true;
  } catch (error) {
    console.error('[Discord] assign role REST:', error.message);
    return false;
  }
}

async function removeRole(discordId, roleId) {
  if (!roleId) return false;
  if (isReady()) {
    try {
      const guild = client.guilds.cache.get(config.discord.guildId);
      if (!guild) return false;
      const member = await guild.members.fetch({ user: discordId, force: true }).catch(() => null);
      if (!member) return false;
      await member.roles.remove(roleId, 'CORTEZ Platform Sync');
      return true;
    } catch (error) {
      console.error('[Discord] remove role:', error.message);
      return false;
    }
  }
  if (!hasBot()) return false;
  try {
    await rest(`/guilds/${config.discord.guildId}/members/${discordId}/roles/${roleId}`, { method: 'DELETE' });
    return true;
  } catch (error) {
    console.error('[Discord] remove role REST:', error.message);
    return false;
  }
}

async function syncRankRole(discordId, newRankKey, oldRankKey = null) {
  try {
    const { getRanks } = require('./ranks');
    const ranks = await getRanks();
    const newRank = ranks.find((rank) => rank.key === newRankKey);
    const oldRank = ranks.find((rank) => rank.key === oldRankKey);
    if (oldRank && oldRank.discordRoleId && oldRank.discordRoleId !== (newRank && newRank.discordRoleId)) {
      await removeRole(discordId, oldRank.discordRoleId);
    }
    if (newRank && newRank.discordRoleId) {
      await assignRole(discordId, newRank.discordRoleId);
    }
    return true;
  } catch (error) {
    console.error('[Discord] syncRankRole:', error.message);
    return false;
  }
}

async function addWarningRole(discordId, roleId) {
  return assignRole(discordId, roleId);
}

async function removeWarningRole(discordId, roleId) {
  return removeRole(discordId, roleId);
}

async function sendChannel(channelKey, payload) {
  const channelId = config.discord.channels[channelKey];
  if (!channelId) return null;
  try {
    if (isReady()) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return null;
      return await channel.send(payload);
    }
    if (!hasBot()) return null;
    return await rest(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: {
        content: payload.content || undefined,
        embeds: payload.embeds || undefined,
        allowed_mentions: payload.allowedMentions || { parse: ['users'] }
      }
    });
  } catch (error) {
    console.error(`[Discord] send channel ${channelKey}:`, error.message);
    return null;
  }
}

function embed(title, description, color = config.bot.embedColor, fields = []) {
  return {
    title,
    description,
    color,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: `${config.org.name} • ${config.org.nameLatin}` }
  };
}

async function notifyDiscipline(targetUser, { type, reason, amount, issuedByName }) {
  if (!targetUser || !targetUser.discordId) return false;
  const isFine = type === 'fine';
  const roleId = isFine ? config.discord.roles.fine : config.discord.roles.warning;
  if (roleId) await assignRole(targetUser.discordId, roleId);
  const mention = `<@${targetUser.discordId}>`;
  const payload = {
    content: `${mention} ⚠️ تم تسجيل إجراء انضباطي بحقك في منصة ${config.org.name}.`,
    embeds: [
      embed(
        isFine ? 'غرامة مالية مسجلة' : 'تحذير رسمي مسجل',
        reason,
        isFine ? 0xf5a623 : 0xe63946,
        [
          { name: 'العضو', value: targetUser.displayName || targetUser.username || mention, inline: true },
          { name: 'النوع', value: isFine ? 'غرامة مالية' : 'تحذير', inline: true },
          { name: 'القيمة', value: isFine ? `${Number(amount || 0).toLocaleString('en-US')} ${config.system.currencyLabel}` : '—', inline: true },
          { name: 'المُصدر', value: issuedByName || 'الإدارة', inline: true }
        ]
      )
    ]
  };
  const sent = await sendChannel('discipline', payload);
  return Boolean(sent);
}

async function notifyVoteResult(vote) {
  if (!vote) return false;
  const approved = Boolean(vote.result && vote.result.approved);
  const tallies = vote.result && vote.result.tallies ? vote.result.tallies : {};
  const tallyText = Object.entries(tallies)
    .map(([key, value]) => `• ${key}: **${value}**`)
    .join('\n');
  const payload = {
    embeds: [
      embed(
        approved ? 'أُقِرّ القرار — ختم الدم' : 'رُفِض القرار — ختم الدم',
        vote.description || 'انتهى التصويت الداخلي.',
        0xe63946,
        [
          { name: 'التصويت', value: vote.title, inline: false },
          { name: 'النتيجة', value: approved ? '✅ أُقِرّ' : '⛔ رُفِض', inline: true },
          { name: 'المشاركة', value: `${vote.result ? vote.result.totalVotes : 0} عضو`, inline: true },
          { name: 'الأصوات', value: tallyText || '—', inline: false }
        ]
      )
    ]
  };
  const sent = await sendChannel('votes', payload);
  return Boolean(sent);
}

async function notifyOperation(operation) {
  if (!operation) return false;
  const win = operation.result === 'win';
  const payload = {
    embeds: [
      embed(
        win ? 'عملية ناجحة' : 'عملية فاشلة',
        operation.title,
        win ? 0x2ecc71 : 0xe63946,
        [
          { name: 'النتيجة', value: win ? 'فوز' : 'خسارة', inline: true },
          { name: 'الغنائم', value: String((operation.looted || []).length), inline: true },
          { name: 'المفقودات', value: String((operation.lost || []).length), inline: true },
          { name: 'المشاركون', value: (operation.participantNames || []).join(' • ') || '—', inline: false }
        ]
      )
    ]
  };
  const sent = await sendChannel('operations', payload);
  return Boolean(sent);
}

async function notifyOrder(order) {
  if (!order) return false;
  const items = (order.items || [])
    .map((item) => `• ${item.name} × ${item.qty}`)
    .join('\n');
  const payload = {
    content: `📦 طلب جديد \`${order.code}\` من ${order.type === 'internal' ? 'عضو' : 'زبون'}`,
    embeds: [
      embed(
        'طلب متجر جديد',
        order.note || 'طلب جديد بانتظار المعالجة.',
        0xe63946,
        [
          { name: 'العميل', value: order.customer?.name || order.customer?.discord || '—', inline: true },
          { name: 'الإجمالي', value: `${Number(order.total || 0).toLocaleString('en-US')} ${config.system.currencyLabel}`, inline: true },
          { name: 'العناصر', value: items || '—', inline: false }
        ]
      )
    ]
  };
  const sent = await sendChannel('orders', payload);
  return Boolean(sent);
}

async function notifyAnnouncement(announcement) {
  if (!announcement) return false;
  const payload = {
    embeds: [
      embed(
        announcement.severity === 'urgent' || announcement.severity === 'critical' ? '🚨 إعلان عاجل' : '📢 إعلان',
        announcement.body,
        announcement.severity === 'normal' ? 0xe63946 : 0xff3b30,
        [{ name: 'العنوان', value: announcement.title, inline: false }]
      )
    ]
  };
  const sent = await sendChannel('announcements', payload);
  return Boolean(sent);
}

function avatarUrl(user) {
  if (!user || !user.avatar) return null;
  const ext = String(user.avatar).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.${ext}?size=256`;
}

function isConfigured() {
  return Boolean(config.discord.clientId && config.discord.clientSecret);
}

function guildUrl() {
  return config.discord.inviteUrl;
}

module.exports = {
  setClient,
  getClient,
  hasBot,
  isReady,
  isConfigured,
  rest,
  exchangeCode,
  refreshToken,
  fetchOAuthUser,
  fetchOAuthGuilds,
  getGuildMember,
  assignRole,
  removeRole,
  syncRankRole,
  addWarningRole,
  removeWarningRole,
  sendChannel,
  notifyDiscipline,
  notifyVoteResult,
  notifyOperation,
  notifyOrder,
  notifyAnnouncement,
  avatarUrl,
  guildUrl,
  embed
};
