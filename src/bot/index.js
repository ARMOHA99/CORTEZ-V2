const config = require('../../config');
const discordService = require('../services/discord');
const memberCard = require('../services/memberCard');

let client = null;
const cooldowns = new Map();

async function buildCardFor(userId) {
  const User = require('../models/User');
  const user = await User.findOne({ discordId: String(userId) });
  if (!user) return null;
  const card = await memberCard.build(user._id);
  if (!card) return null;
  const { generateCard } = require('./card');
  return {
    card,
    buffer: await generateCard(card)
  };
}

async function handleCard(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  const key = `${interaction.user.id}:${targetUser.id}`;
  const now = Date.now();
  const until = cooldowns.get(key) || 0;
  if (now < until) {
    return interaction.reply({
      content: `انتظر ${Math.ceil((until - now) / 1000)} ثانية قبل طلب بطاقة أخرى.`,
      ephemeral: true
    });
  }
  cooldowns.set(key, now + config.bot.cardCooldownSeconds * 1000);

  await interaction.deferReply();
  try {
    const result = await buildCardFor(targetUser.id);
    if (!result) {
      return interaction.editReply({
        content: 'هذا العضو غير مسجل في منصة كورتاس بعد.'
      });
    }
    const { AttachmentBuilder } = require('discord.js');
    const attachment = new AttachmentBuilder(result.buffer, { name: `cortez-card-${targetUser.id}.png` });
    return interaction.editReply({
      content: `🩸 بطاقة العضو <@${targetUser.id}>`,
      files: [attachment]
    });
  } catch (error) {
    console.error('[Bot] card:', error);
    return interaction.editReply({ content: 'تعذّر توليد البطاقة حالياً. حاول لاحقاً.' });
  }
}

async function registerCommands() {
  if (!client || !client.isReady()) return;
  const { SlashCommandBuilder } = require('discord.js');
  const commands = [
    new SlashCommandBuilder()
      .setName(config.bot.cardCommand)
      .setDescription('عرض بطاقة العضو الإلكترونية الخاصة بكورتاس')
      .addUserOption((option) =>
        option.setName('user').setDescription('عضو آخر لعرض بطاقته').setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('cortez')
      .setDescription('روابط ومعلومات منصة كورتاس')
  ].map((command) => command.toJSON());

  try {
    const guildId = config.discord.guildId;
    if (guildId) {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        await guild.commands.set(commands);
        console.log(`[Bot] تم تسجيل أوامر الرتبة في ${guild.name}`);
        return;
      }
    }
    await client.application.commands.set(commands);
    console.log('[Bot] تم تسجيل الأوامر عالمياً');
  } catch (error) {
    console.error('[Bot] register commands:', error.message);
  }
}

async function handleCortez(interaction) {
  const payload = {
    embeds: [
      discordService.embed(
        `${config.org.name} • ${config.org.nameLatin}`,
        config.org.description,
        config.bot.embedColor,
        [
          { name: 'الشعار', value: config.org.motto, inline: false },
          { name: 'المنصة', value: process.env.BASE_URL || 'http://localhost:3000', inline: false },
          { name: 'التوقيع', value: 'وقّع عقد الدم لتثبت انتماءك.', inline: false }
        ]
      )
    ],
    ephemeral: true
  };
  return interaction.reply(payload);
}

function startBot() {
  if (!config.bot.enabled) {
    console.log('[Bot] معطّل من الإعدادات.');
    return null;
  }
  if (!config.bot.token) {
    console.log('[Bot] لا يوجد توكن. شغّل البوت بإضافة DISCORD_BOT_TOKEN.');
    return null;
  }
  try {
    const {
      Client,
      GatewayIntentBits,
      Partials,
      Events,
      ActivityType
    } = require('discord.js');

    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
      ],
      partials: [Partials.GuildMember, Partials.User]
    });

    discordService.setClient(client);

    client.once(Events.ClientReady, async (readyClient) => {
      console.log(`[Bot] متصل كـ ${readyClient.user.tag}`);
      try {
        readyClient.user.setActivity(config.bot.activity, { type: ActivityType.Watching });
      } catch (error) {
        /* ignore */
      }
      await registerCommands();
    });

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      try {
        if (interaction.commandName === config.bot.cardCommand) {
          await handleCard(interaction);
        } else if (interaction.commandName === 'cortez') {
          await handleCortez(interaction);
        }
      } catch (error) {
        console.error('[Bot] interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
          interaction.reply({ content: 'حدث خطأ غير متوقع.', ephemeral: true }).catch(() => null);
        }
      }
    });

    client.on(Events.GuildMemberAdd, async (member) => {
      try {
        if (config.discord.guildId && member.guild.id !== config.discord.guildId) return;
        if (config.discord.roles.member) {
          await member.roles.add(config.discord.roles.member, 'CORTEZ Welcome').catch(() => null);
        }
        await discordService.sendChannel('announcements', {
          content: `🩸 <@${member.id}> انضم إلى عائلة ${config.org.name}. وقّع عقد الدم لتثبت ولاءك.`,
          allowedMentions: { users: [member.id] }
        });
      } catch (error) {
        console.error('[Bot] member add:', error.message);
      }
    });

    client.on(Events.Error, (error) => {
      console.error('[Bot] client error:', error.message);
    });

    client.login(config.bot.token).catch((error) => {
      console.error('[Bot] login failed:', error.message);
    });

    return client;
  } catch (error) {
    console.error('[Bot] start failed:', error.message);
    return null;
  }
}

function stopBot() {
  if (client) {
    try {
      client.destroy();
    } catch (error) {
      /* ignore */
    }
    client = null;
  }
  discordService.setClient(null);
}

module.exports = { startBot, stopBot, buildCardFor };
