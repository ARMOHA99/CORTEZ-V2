/* ═══════════════════════════════════════════════════════════════════════════
   ملف جديد: src/bot/duty.js
   لوحة الدوام في ديسكورد: زر بدء الدوام، ثم مؤقت حيّ + أزرار استراحة/إنهاء.

   المبدأ المهم: كل العمليات تمرّ على src/services/duty.js نفسه الذي يستخدمه
   الموقع، فلا يوجد منطق مكرر ولا سجلّان مختلفان. البوت مجرد "واجهة" أخرى.

   المؤقت: نستخدم طوابع ديسكورد <t:UNIX:R> فتتحدّث تلقائيًا في عميل كل عضو
   بدون أي تعديل رسائل من السيرفر (صفر حمل مقابل موقع به عشرات الأعضاء).
   ═══════════════════════════════════════════════════════════════════════════ */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');

const config = require('../../config');
const dutyService = require('../services/duty');
const settingsService = require('../services/settings');
const audit = require('../services/audit');
const discordService = require('../services/discord');

const EPHEMERAL = MessageFlags.Ephemeral;

/* ───────────────────────────── أدوات مساعدة ───────────────────────────── */

function formatMinutes(total) {
  const mins = Math.max(0, Math.round(Number(total) || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} دقيقة`;
  return `${h} س ${m} د`;
}

function ts(date) {
  return Math.floor(new Date(date).getTime() / 1000);
}

/** يبني زرًا بأسلوب موحّد */
function btn(customId, label, style, emoji) {
  const button = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
  if (emoji) button.setEmoji(emoji);
  return button;
}

/* ─────────────────────────── لوحة القناة الثابتة ─────────────────────────── */

/**
 * الرسالة الثابتة في القناة. الأزرار هنا عامة (ليست خاصة بعضو)،
 * فكل عضو يضغطها ويحصل على ردّ خاص به (ephemeral).
 */
function panelPayload() {
  return {
    embeds: [
      discordService.embed(
        'سجل الدوام',
        [
          'اضغط **بدء الدوام** ليسجّل البوت حضورك مباشرة من ديسكورد.',
          'ستظهر لك أزرار **استراحة** و**إنهاء الدوام** مع مؤقّت حيّ.',
          '',
          'الساعات المسجّلة هنا تظهر فورًا في لوحة العضو وفي كشف الحضور على المنصة.'
        ].join('\n'),
        config.bot.embedColor,
        [
          { name: 'القفل الليلي', value: 'إن كان مفعّلًا يمنع البدء خارج النافذة المسموحة.', inline: true },
          { name: 'الاستراحات', value: 'تُحسب وتُخصم تلقائيًا من صافي الساعات.', inline: true }
        ]
      )
    ],
    components: [
      new ActionRowBuilder().addComponents(
        btn('duty:start', 'بدء الدوام', ButtonStyle.Success, '🩸'),
        btn('duty:status', 'دوامي', ButtonStyle.Secondary, '📊')
      )
    ]
  };
}

/** ينشر اللوحة في القناة الحالية (يُستدعى من الأمر /duty) */
async function postPanel(channel) {
  if (!channel || !channel.send) return null;
  return channel.send(panelPayload());
}

/* ─────────────────────── رد خاص حسب حالة العضو ─────────────────────── */

function statePayload(user, shift) {
  const rows = [];

  if (!shift) {
    rows.push(
      new ActionRowBuilder().addComponents(
        btn('duty:start', 'بدء الدوام', ButtonStyle.Success, '🩸'),
        btn('duty:status', 'تحديث', ButtonStyle.Secondary, '🔄')
      )
    );
    return {
      embeds: [
        discordService.embed(
          'لا يوجد دوام نشط',
          `${user.displayName || user.username || 'عضو'} — ساعاتك المسجّلة هذه الجلسة: **0 دقيقة**.\nاضغط الزر أدناه للبدء.`,
          config.bot.embedColor
        )
      ],
      components: rows,
      flags: EPHEMERAL
    };
  }

  const started = ts(shift.startAt);
  const isPaused = shift.status === 'paused';
  const breakStart = shift.breakStartedAt ? ts(shift.breakStartedAt) : null;

  const lines = [
    isPaused ? '⏸ **الدوام موقوف — أنت في استراحة.**' : '🟢 **الدوام جارٍ الآن.**',
    '',
    `⏱ بدأت: <t:${started}:t> (مضى <t:${started}:R>)`,
    `✅ الوقت المحتسب: **${formatMinutes(shift.liveMinutes)}**`
  ];

  if (isPaused && breakStart) {
    lines.push(`☕ الاستراحة بدأت <t:${breakStart}:R> (${formatMinutes(shift.breakLiveMinutes)})`);
  } else if (shift.breakMinutes) {
    lines.push(`☕ إجمالي الاستراحات: ${formatMinutes(shift.breakMinutes)}`);
  }

  if (isPaused) {
    rows.push(
      new ActionRowBuilder().addComponents(
        btn('duty:resume', 'متابعة الدوام', ButtonStyle.Primary, '▶'),
        btn('duty:end', 'إنهاء الدوام', ButtonStyle.Danger, '⏹'),
        btn('duty:status', 'تحديث', ButtonStyle.Secondary, '🔄')
      )
    );
  } else {
    rows.push(
      new ActionRowBuilder().addComponents(
        btn('duty:break', 'استراحة', ButtonStyle.Secondary, '☕'),
        btn('duty:end', 'إنهاء الدوام', ButtonStyle.Danger, '⏹'),
        btn('duty:status', 'تحديث', ButtonStyle.Secondary, '🔄')
      )
    );
  }

  return {
    embeds: [
      discordService.embed(
        'دوامي',
        lines.join('\n'),
        isPaused ? 0xf5a623 : 0x2ecc71,
        [
          { name: 'الأسبوع', value: shift.weekKey || '—', inline: true },
          { name: 'الرتبة', value: shift.userSnapshot?.rank || user.rank || '—', inline: true }
        ]
      )
    ],
    components: rows,
    flags: EPHEMERAL
  };
}

/* ────────────────────────── إيجاد العضو من ديسكورد ────────────────────────── */

async function resolveUser(discordId) {
  const User = require('../models/User');
  const user = await User.findOne({ discordId: String(discordId) });
  if (!user) return { user: null, reason: 'not_registered' };
  if (user.blocked) return { user: null, reason: 'blocked', user };
  if (user.sessionInvalid) return { user: null, reason: 'session_invalid', user };
  if (!user.inGuild) return { user: null, reason: 'not_in_guild', user };
  return { user, reason: '' };
}

function explain(reason) {
  switch (reason) {
    case 'not_registered':
      return `هذا الحساب غير مسجّل في منصة ${config.org.name}. ادخل عبر ديسكورد من الموقع مرة واحدة، ثم عد إلى هنا.`;
    case 'blocked':
      return 'حسابك موقوف حاليًا، لا يمكنك تسجيل الدوام.';
    case 'session_invalid':
      return 'جلستك على المنصة أُبطلت. سجّل الدخول من الموقع من جديد.';
    case 'not_in_guild':
      return 'يجب أن تكون عضوًا في سيرفر العصابة لتسجيل الدوام.';
    default:
      return 'تعذّر التحقق من حسابك.';
  }
}

/* ───────────────────────────── معالج الأزرار ───────────────────────────── */

async function handleButton(interaction) {
  const { user, reason } = await resolveUser(interaction.user.id);
  if (!user) {
    return interaction.reply({ content: explain(reason), flags: EPHEMERAL });
  }

  await interaction.deferReply({ flags: EPHEMERAL });

  const action = interaction.customId.split(':')[1];

  try {
    if (action === 'start') {
      const attendanceEnabled = await settingsService.get('attendance.enabled', true);
      if (attendanceEnabled === false) {
        return interaction.editReply({ content: '⛔ تسجيل الحضور متوقف حاليًا من الإدارة.' });
      }
      // نفس شرط الموقع بالضبط: القفل يطبَّق إلا على الرتب المستثناة في الإعدادات
      const result = await dutyService.startDuty(user, null);
      if (result.alreadyActive) {
        // لا ننشئ دوامًا ثانيًا — نعرض الحالة بدل ذلك
        return interaction.editReply(statePayload(user, result.shift));
      }
      await audit.log({
        actor: user,
        action: 'duty.start.discord',
        description: 'بدء دوام من ديسكورد',
        targetType: 'Shift',
        targetId: result.shift._id || result.shift.id,
        meta: { source: 'discord' }
      });
      return interaction.editReply(statePayload(user, result.shift));
    }

    if (action === 'break') {
      const result = await dutyService.pauseDuty(user);
      return interaction.editReply(statePayload(user, result.shift));
    }

    if (action === 'resume') {
      const result = await dutyService.resumeDuty(user);
      return interaction.editReply(statePayload(user, result.shift));
    }

    if (action === 'end') {
      const result = await dutyService.endDuty(user);
      await audit.log({
        actor: user,
        action: 'duty.end.discord',
        description: `إنهاء دوام من ديسكورد (${formatMinutes(result.shift.totalMinutes)})`,
        targetType: 'Shift',
        targetId: result.shift._id || result.shift.id,
        meta: { source: 'discord', totalMinutes: result.shift.totalMinutes }
      });
      return interaction.editReply({
        embeds: [
          discordService.embed(
            'انتهى الدوام',
            [
              `⏹ سُجّل خروجك بنجاح.`,
              '',
              `⏱ إجمالي الجلسة: **${formatMinutes(result.shift.totalMinutes)}**`,
              `☕ الاستراحات: ${formatMinutes(result.shift.breakMinutes)}`,
              `📅 الأسبوع: ${result.shift.weekKey || '—'}`
            ].join('\n'),
            0x2ecc71
          )
        ],
        components: [
          new ActionRowBuilder().addComponents(
            btn('duty:start', 'بدء دوام جديد', ButtonStyle.Success, '🩸')
          )
        ],
        flags: EPHEMERAL
      });
    }

    if (action === 'status') {
      const shift = await dutyService.findActiveShift(user._id);
      return interaction.editReply(
        statePayload(user, shift ? dutyService.serializeShift(shift) : null)
      );
    }

    return interaction.editReply({ content: 'إجراء غير معروف.' });
  } catch (error) {
    console.error('[Bot:duty]', error);
    const message = error && error.message ? error.message : 'حدث خطأ غير متوقع.';
    return interaction.editReply({
      content: `⚠️ ${message}${error.code ? `\n\`${error.code}\`` : ''}`
    });
  }
}


/* ═════ /duty: رسالة حالة حيّة تتحدّث كل دقيقة ═════ */

/* بناء الإمبد من قاعدة البيانات (يُستخدم عند الأمر وعند التحديث الدوري) */
async function buildEmbed() {
  const agentService = require('../services/agent');
  const Shift = require('../models/Shift');
  const AgentDevice = require('../models/AgentDevice');
  const window = await agentService.windowInfo().catch(() => null);
  const agentCfg = await agentService.cfg().catch(() => null);
  const onlineWindow = agentService.onlineWindow(agentCfg || { intervalSeconds: 30 });

  const shifts = await Shift.find({ status: { $in: ['active', 'paused'] }, kind: 'shift' })
    .sort({ startAt: 1 })
    .limit(40)
    .lean();

  const now = Date.now();
  const lines = shifts.map((shift, index) => {
    const name = (shift.userSnapshot && shift.userSnapshot.name) || 'عضو';
    const rank = (shift.userSnapshot && shift.userSnapshot.rank) || '';
    const since = Math.floor(new Date(shift.startAt).getTime() / 1000);
    const mins = Math.max(0, Math.round((now - new Date(shift.startAt).getTime()) / 60000));
    const state = shift.status === 'paused' ? '⏸ استراحة' : '🟢 داخل السيرفر';
    return `**${index + 1}.** ${name}${rank ? ` — \`${rank}\`` : ''}\n${state} • من <t:${since}> • ${formatMinutes(mins)}`;
  });

  const devices = await AgentDevice.find({ revokedAt: null, duty: false })
    .populate('user', 'displayName username blocked')
    .sort({ lastSeenAt: -1 })
    .limit(40)
    .lean();
  const away = devices
    .filter((d) => d.user && !d.user.blocked)
    .map((d) => {
      const name = d.user.displayName || d.user.username || 'عضو';
      const seen = d.lastSeenAt ? Math.floor(new Date(d.lastSeenAt).getTime() / 1000) : null;
      const lag = d.lastSeenAt ? Date.now() - new Date(d.lastSeenAt).getTime() : null;
      const state = lag !== null && lag <= onlineWindow ? '🟡 متصل بالموقع، خارج السيرفر' : '⚫ الجهاز غير متصل';
      return `• ${name} — ${state}${seen ? ` • آخر ظهور <t:${seen}:R>` : ''}`;
    });

  const updatedAt = Math.floor(now / 1000);
  return {
    color: 0x22c55e,
    title: `الحاضرون الآن — ${shifts.length}`,
    description: lines.length ? lines.join('\n\n') : 'لا أحد داخل السيرفر الآن.',
    fields: away.length
      ? [{ name: `خارج الدوام الآن — ${away.length}`, value: away.slice(0, 15).join('\n').slice(0, 1020) }]
      : [],
    footer: {
      text: `${window && window.enabled ? `نافذة الدوام ${window.start} → ${window.end} (الجزائر) • ` : ''}آخر تحديث`
    },
    timestamp: new Date(now).toISOString()
  };
}

async function status(interaction) {
  try {
    const settings = await settingsService.loadAll().catch(() => ({}));
    const channelId = String(settings['duty.statusChannelId'] || '').trim();
    if (channelId && interaction.channelId !== channelId) {
      return interaction.reply({ content: `استخدم الأمر في القناة المخصّصة للدوام: <#${channelId}>`, ephemeral: true });
    }
    if (!dbReady()) {
      return interaction.reply({ content: 'قاعدة البيانات غير متصلة حالياً.', ephemeral: true });
    }
    await interaction.deferReply();

    const embed = await buildEmbed();
    /* رسالة واحدة حيّة لكل قناة: لو فيه رسالة سابقة نحدّثها بدل تكرار الرسائل */
    const DutyStatus = require('../models/DutyStatus');
    const existing = await DutyStatus.findOne({ channelId: interaction.channelId }).lean();
    let messageId = null;
    if (existing) {
      try {
        const channel = interaction.channel || (await interaction.client.channels.fetch(interaction.channelId));
        const message = await channel.messages.fetch(existing.messageId);
        await message.edit({ embeds: [embed] });
        messageId = existing.messageId;
      } catch (error) {
        await DutyStatus.deleteOne({ channelId: interaction.channelId }).catch(() => null);
      }
    }
    await interaction.editReply({ embeds: [embed] });
    if (!messageId) {
      const message = await interaction.fetchReply().catch(() => null);
      if (message && message.id) {
        await DutyStatus.updateOne(
          { channelId: interaction.channelId },
          { $set: { channelId: interaction.channelId, messageId: message.id, guildId: interaction.guildId || '', lastRefreshAt: new Date(), failedCount: 0 } },
          { upsert: true }
        ).catch(() => null);
      }
    } else {
      await DutyStatus.updateOne({ channelId: interaction.channelId }, { $set: { lastRefreshAt: new Date() } }).catch(() => null);
    }
    return null;
  } catch (error) {
    console.error('[Bot] /duty status:', error);
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content: 'تعذّر قراءة حالة الدوام.' }).catch(() => null);
    } else if (!interaction.replied) {
      await interaction.reply({ content: 'تعذّر قراءة حالة الدوام.', ephemeral: true }).catch(() => null);
    }
    return null;
  }
}

/* تحديث كل رسائل الحالة الحيّة (تُنادى كل 45 ثانية من البوت) */
async function refreshAll(client) {
  if (!client || !dbReady()) return 0;
  const DutyStatus = require('../models/DutyStatus');
  const rows = await DutyStatus.find({}).limit(10).lean();
  if (!rows.length) return 0;
  const embed = await buildEmbed();
  let updated = 0;
  for (const row of rows) {
    try {
      const channel = client.channels.cache.get(row.channelId) || (await client.channels.fetch(row.channelId));
      if (!channel || !channel.messages) throw new Error('قناة غير متاحة');
      const message = await channel.messages.fetch(row.messageId);
      await message.edit({ embeds: [embed] });
      await DutyStatus.updateOne({ _id: row._id }, { $set: { lastRefreshAt: new Date(), failedCount: 0 } }).catch(() => null);
      updated += 1;
    } catch (error) {
      const failed = (row.failedCount || 0) + 1;
      /* الرسالة انحذفت أو القناة اختفت: نوقف المحاولة */
      if (failed >= 3) await DutyStatus.deleteOne({ _id: row._id }).catch(() => null);
      else await DutyStatus.updateOne({ _id: row._id }, { $set: { failedCount: failed } }).catch(() => null);
    }
  }
  return updated;
}

function dbReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

module.exports = { status, refreshAll, buildEmbed, handleButton, panelPayload, postPanel, formatMinutes };
