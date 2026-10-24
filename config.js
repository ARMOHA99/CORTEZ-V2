/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ملف الإعدادات المركزي — منظمة كورتاس
 *  Central configuration file — edit this file to rebrand the whole platform.
 *  كل ما تعدّله هنا (الاسم، الألوان، النصوص، الروابط، الأدوار) ينعكس فوراً.
 * ═══════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();

const config = {
  /* ───────────────────────────── هوية المنظمة ───────────────────────────── */
  org: {
    name: 'كورتاس',
    nameLatin: 'CORTEZ',
    tagline: 'الإمبراطورية لا تُورَّث… تُنتزَع',
    motto: 'الدم يوحّدنا، والولاء يخلّدنا',
    description:
      'كورتاس ليست مجرد عائلة، بل كيان اقتصادي وعسكري يتحكم بشوارع لوس سانتوس من الظل. انضم، أثبت ولاءك، واكتب اسمك بدمك في سجل الخالدين.',
    city: 'Los Santos',
    founded: '2021',
    currency: 'دولار',
    contact: 'discord.gg/cortez',
    logo: '',
    favicon: ''
  },

  /* ───────────────────────────── الهوية البصرية ───────────────────────────── */
  theme: {
    primary: '#e63946',
    primaryDark: '#9d1420',
    primarySoft: 'rgba(230, 57, 70, 0.16)',
    accent: '#ff8fa3',
    bg: '#0a0a0c',
    bgDeep: '#050506',
    surface: '#111114',
    text: '#f4f1f2',
    muted: '#9b9296',
    success: '#2ecc71',
    warning: '#f5a623',
    danger: '#e63946',
    font: 'Tajawal',
    fontDisplay: 'Cairo'
  },

  /* ───────────────────────────── ديسكورد ───────────────────────────── */
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
    redirectUri:
      process.env.DISCORD_REDIRECT_URI ||
      `${process.env.BASE_URL || 'http://localhost:3000'}/auth/discord/callback`,
    inviteUrl: process.env.DISCORD_INVITE_URL || 'https://discord.gg/cortez',
    scopes: ['identify', 'guilds'],
    api: 'https://discord.com/api/v10',
    ownerIds: (process.env.DISCORD_OWNER_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
    /* معرّفات رتب ديسكورد المستخدمة للمزامنة التلقائية */
    roles: {
      owner: process.env.ROLE_OWNER || '',
      operations: process.env.ROLE_OPERATIONS || '',
      business: process.env.ROLE_BUSINESS || '',
      member: process.env.ROLE_MEMBER || '',
      store: process.env.ROLE_STORE || '',
      warning: process.env.ROLE_WARNING || '',
      fine: process.env.ROLE_FINE || '',
      banned: process.env.ROLE_BANNED || ''
    },
    /* معرّفات الرومات المستخدمة من البوت */
    channels: {
      announcements: process.env.CHANNEL_ANNOUNCEMENTS || '',
      operations: process.env.CHANNEL_OPERATIONS || '',
      discipline: process.env.CHANNEL_DISCIPLINE || '',
      votes: process.env.CHANNEL_VOTES || '',
      orders: process.env.CHANNEL_ORDERS || '',
      audit: process.env.CHANNEL_AUDIT || ''
    }
  },

  /* ───────────────────────────── بوت ديسكورد ───────────────────────────── */
  bot: {
    enabled: process.env.BOT_ENABLED !== 'false',
    token: process.env.DISCORD_BOT_TOKEN || '',
    cardCommand: 'card',
    cardCooldownSeconds: 20,
    activity: 'الدم لا ينسى • CORTEZ',
    embedColor: 0xe63946
  },

  /* ───────────────────────────── الصوت ───────────────────────────── */
  audio: {
    enabled: true,
    defaultMuted: false,
    clickVolume: 0.18,
    chargeVolume: 0.22,
    stampVolume: 0.55,
    ambientVolume: 0.05
  },

  /* ───────────────────────────── الروابط ───────────────────────────── */
  links: {
    discord: process.env.DISCORD_INVITE_URL || 'https://discord.gg/cortez',
    support: process.env.SUPPORT_URL || '',
    rules: process.env.RULES_URL || '',
    store: '/#/store',
    status: '/#/orders'
  },

  /* ───────────────────────────── مزامنة الدوام ───────────────────────────── */
  system: {
    timezone: process.env.TZ || 'Asia/Riyadh',
    sessionDays: Number(process.env.SESSION_DAYS || 7),
    weekStartDay: Number(process.env.WEEK_START_DAY ?? 6), // 0=الأحد ... 6=السبت
    nightShift: {
      enabled: true,
      start: '22:00',
      end: '06:00',
      lock: false
    },
    syncIntervalSeconds: 120,
    idleDisconnectMinutes: 0,
    attendanceDefaultDays: 7,
    maxUploadMb: 6,
    currencyLabel: 'دولار',
    weeklyGoalTarget: 500000,
    minOperationValue: 1000,
    taxPercent: 0
  },

  /* ───────────────────────────── عقد الدم ───────────────────────────── */
  pact: {
    version: 1,
    title: 'عقد الدم',
    subtitle: 'وثيقة الولاء والانتماء — إصدار',
    text: `بسم الدم والولاء، وباسم عائلة كورتاس، أُقرّ أنا الموقّع أدناه بما يلي:

١. أولائي المطلق لعائلة كورتاس قبل أي مصلحة شخصية، وأقسم ألّا أرفع سلاحاً ضدها أو أتآمر عليها.

٢. السرية مقدسة. كل ما أراه أو أسمعه داخل جدران العائلة يبقى في القبر، ولا يخرج منه أبداً.

٣. أحترم التسلسل القيادي، وأنفّذ أوامر الرتب الأعلى ما لم تخالف شرف العائلة.

٤. ألتزم بالدوام والعمليات المشتركة، وأعلم أن الغياب المتكرر خيانة تُحاسَب عليها.

٥. دمي ليس ملكي، بل ملك العائلة. أقدّمه حين يُطلب، دون تردد أو مقابل.

٦. التوقيع على هذا العقد لا يُلغى إلا بالموت أو بالخيانة، والخيانة عقابها الدم.

بصمتي أدناه شاهد على كلامي، والدم لا ينسى.`,
    fingerprintLabel: 'بصمة الدم'
  },

  /* ───────────────────────────── الأمان ───────────────────────────── */
  security: {
    sessionSecret: process.env.SESSION_SECRET || 'cortez-blood-secret-change-me',
    trustProxy: true,
    rateWindowMinutes: 15,
    rateMax: 600,
    authRateMax: 30,
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  },

  /* ───────────────────────────── الخدمات ───────────────────────────── */
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: process.env.CLOUDINARY_FOLDER || 'cortez'
  },

  /* ───────────────────────────── الميزات ───────────────────────────── */
  features: {
    publicStore: true,
    internalStore: true,
    voting: true,
    bloodPact: true,
    duty: true,
    operations: true,
    treasury: true,
    tickets: true,
    leaderboard: true,
    memberCards: true,
    guestOrders: true
  },

  devLogin: process.env.DEV_LOGIN === 'true',

  isProduction: process.env.NODE_ENV === 'production'
};

/* النسخة العامة التي تُرسَل للمتصفح — لا تحتوي أي أسرار */
config.publicConfig = function publicConfig() {
  return {
    org: config.org,
    theme: config.theme,
    links: config.links,
    audio: config.audio,
    features: config.features,
    system: {
      timezone: config.system.timezone,
      currencyLabel: config.system.currencyLabel,
      weekStartDay: config.system.weekStartDay,
      nightShift: config.system.nightShift,
      maxUploadMb: config.system.maxUploadMb
    },
    pact: {
      title: config.pact.title,
      subtitle: config.pact.subtitle,
      fingerprintLabel: config.pact.fingerprintLabel
    },
    discord: {
      inviteUrl: config.discord.inviteUrl
    },
    bot: {
      enabled: Boolean(config.bot.token) && config.bot.enabled,
      cardCommand: config.bot.cardCommand
    },
    devLogin: config.devLogin && !config.isProduction
  };
};

module.exports = config;
