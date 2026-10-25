const config = require('../config');
const { RANKS } = require('./constants/permissions');
const settingsService = require('./services/settings');
const goalService = require('./services/goal');
const time = require('./utils/time');

const DEFAULT_PRODUCTS = [
  {
    name: 'مسدس مائي حاد',
    sku: 'WPN-001',
    category: 'weapon',
    scope: 'both',
    price: 45000,
    cost: 32000,
    description: 'قطعة أساسية لكل عضو في العائلة. تتضمن ذخيرة مبدئية.',
    image: '',
    featured: true,
    order: 1
  },
  {
    name: 'بندقية هجومية',
    sku: 'WPN-002',
    category: 'weapon',
    scope: 'internal',
    price: 180000,
    cost: 140000,
    description: 'سلاح ثقيل يُسلَّم لعناصر العمليات فقط بعد موافقة ضابط العمليات.',
    image: '',
    featured: false,
    order: 2
  },
  {
    name: 'سترة واقية',
    sku: 'GER-001',
    category: 'gear',
    scope: 'both',
    price: 60000,
    cost: 40000,
    description: 'سترة باليستية سوداء تحمل شعار العائلة.',
    image: '',
    featured: true,
    order: 3
  },
  {
    name: 'حقيبة إسعاف ميداني',
    sku: 'GER-002',
    category: 'gear',
    scope: 'internal',
    price: 25000,
    cost: 15000,
    description: 'حقيبة طبية كاملة لعناصر العمليات.',
    image: '',
    featured: false,
    order: 4
  },
  {
    name: 'شحنة سلع مهربة',
    sku: 'DRG-001',
    category: 'drug',
    scope: 'external',
    price: 120000,
    cost: 90000,
    description: 'شحنة حصرية لعملاء العائلة الموثوقين. التسليم في نقطة محددة.',
    image: '',
    featured: true,
    order: 5
  },
  {
    name: 'خدمة حماية شخصية',
    sku: 'SRV-001',
    category: 'service',
    scope: 'external',
    price: 75000,
    cost: 0,
    description: 'مرافقة وحماية لمدة ساعة كاملة من عناصر العائلة.',
    image: '',
    featured: false,
    order: 6
  },
  {
    name: 'سيارة هروب مصفحة',
    sku: 'VEH-001',
    category: 'vehicle',
    scope: 'internal',
    price: 350000,
    cost: 280000,
    description: 'سيارة مصفحة بزجاج مقاوم ولوحة معدلة.',
    image: '',
    featured: false,
    order: 7
  },
  {
    name: 'عتاد عمليات ليلي',
    sku: 'GER-003',
    category: 'gear',
    scope: 'internal',
    price: 90000,
    cost: 65000,
    description: 'طقم تسلل ليلي: منظار حراري، كواتم صوت، وأجهزة اتصال مشفرة.',
    image: '',
    featured: false,
    order: 8
  }
];

function mongooseReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

async function seedRanks() {
  const Rank = require('./models/Rank');
  const operations = RANKS.map((rank) => ({
    updateOne: {
      filter: { key: rank.key },
      update: {
        $setOnInsert: {
          key: rank.key,
          name: rank.name,
          short: rank.short,
          level: rank.level,
          color: rank.color,
          icon: rank.icon,
          permissions: rank.permissions,
          discordRoleId: '',
          isSystem: true,
          order: rank.order
        }
      },
      upsert: true
    }
  }));
  await Rank.bulkWrite(operations);

  const roleMap = {
    owner: config.discord.roles.owner,
    operations: config.discord.roles.operations,
    business: config.discord.roles.business,
    member: config.discord.roles.member,
    store: config.discord.roles.store
  };
  for (const [key, roleId] of Object.entries(roleMap)) {
    if (roleId) {
      await Rank.updateOne(
        { key, $or: [{ discordRoleId: '' }, { discordRoleId: { $exists: false } }, { discordRoleId: null }] },
        { $set: { discordRoleId: roleId } }
      );
    }
  }
}

async function seedSettings() {
  const Setting = require('./models/Setting');
  const defaults = settingsService.defaultSettings();
  const operations = Object.entries(defaults).map(([key, value]) => ({
    updateOne: {
      filter: { key },
      update: { $setOnInsert: { key, value } },
      upsert: true
    }
  }));
  if (operations.length) await Setting.bulkWrite(operations);
}

async function seedProducts() {
  const Product = require('./models/Product');
  const count = await Product.countDocuments({});
  if (count > 0) return 0;
  await Product.insertMany(DEFAULT_PRODUCTS);
  return DEFAULT_PRODUCTS.length;
}

async function seedWelcomeAnnouncement() {
  const Announcement = require('./models/Announcement');
  const count = await Announcement.countDocuments({});
  if (count > 0) return false;
  await Announcement.create({
    title: `أهلاً بكم في منصة ${config.org.name}`,
    body: `تم تشغيل المنصة بنجاح. يا أهل ${config.org.name}، الدم لا ينسى، والولاء يُكتب في السجل. تابعوا الدوام، العمليات، والخزينة من لوحة القيادة.`,
    severity: 'normal',
    active: true,
    pinned: true,
    createdByName: 'النظام'
  });
  return true;
}

async function ensureSeed() {
  if (!mongooseReady()) {
    console.warn('[Seed] تخطي التهيئة — قاعدة البيانات غير متصلة.');
    return { skipped: true };
  }
  await seedRanks();
  await seedSettings();
  await seedProducts();
  await seedWelcomeAnnouncement();
  const { goal, context } = await goalService.getCurrentGoal({ create: true });
  console.log(
    `[Seed] جاهز — رتب، إعدادات، منتجات، هدف الأسبوع ${goal.weekKey} (بداية الأسبوع: ${time.ARABIC_DAYS[context.weekStartDay]})`
  );
  return { ranks: RANKS.length, goalWeek: context.weekKey };
}

module.exports = { ensureSeed, DEFAULT_PRODUCTS };
