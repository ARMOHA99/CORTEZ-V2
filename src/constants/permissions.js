/**
 * نظام الصلاحيات المركزي
 * كل صلاحية مفتاح دقيق يمكن منحه لأي رتبة من لوحة التحكم.
 */

const PERMISSIONS = {
  'dashboard:view': 'عرض لوحة القيادة',
  'attendance:view': 'عرض جدول الحضور',
  'leaderboard:view': 'عرض لوحة الشرف',
  'members:view': 'عرض ملفات الأعضاء',
  'members:manage': 'إدارة الأعضاء (تعديل / طرد)',
  'members:ban': 'حظر الأعضاء وفك الحظر',
  'ranks:manage': 'إدارة الرتب والتصاريح',
  'duty:manage': 'إدارة الدوام والخصم من الساعات',
  'duty:night': 'تجاوز القفل الليلي للدوام',
  'operations:view': 'عرض غرفة العمليات',
  'operations:manage': 'تسجيل وإدارة العمليات',
  'treasury:view': 'عرض الخزينة',
  'treasury:manage': 'إدارة الخزينة (إيداع / سحب)',
  'store:view': 'عرض المتجر الخارجي',
  'store:internal': 'طلب العتاد من المتجر الداخلي',
  'store:manage': 'إدارة المنتجات والأسعار',
  'orders:view': 'عرض طلبات المتجر',
  'orders:manage': 'إدارة حالات الطلبات',
  'discipline:view': 'عرض سجل الانضباط',
  'discipline:manage': 'إصدار العقوبات والتحذيرات',
  'tickets:view': 'عرض التذاكر',
  'tickets:manage': 'البت في التذاكر',
  'votes:view': 'عرض غرفة التصويت',
  'votes:create': 'إنشاء التصويتات',
  'votes:veto': 'حق النقض (Veto)',
  'pacts:view': 'عرض سجل عقود الدم',
  'pacts:manage': 'إدارة نص عقد الدم',
  'announcements:manage': 'إدارة الإعلانات',
  'settings:manage': 'إدارة إعدادات النظام',
  'audit:view': 'عرض سجل التدقيق',
  'system:admin': 'تحكم كامل بالنظام'
};

const ALL_PERMISSIONS = Object.keys(PERMISSIONS);

const RANKS = [
  {
    key: 'owner',
    name: 'مدير عام',
    short: 'DON',
    level: 100,
    color: '#e63946',
    icon: '♛',
    isSystem: true,
    order: 1,
    permissions: ALL_PERMISSIONS
  },
  {
    key: 'operations',
    name: 'ضابط عمليات',
    short: 'OPS',
    level: 80,
    color: '#ff8f3f',
    icon: '⚔',
    isSystem: true,
    order: 2,
    permissions: [
      'dashboard:view',
      'attendance:view',
      'leaderboard:view',
      'members:view',
      'operations:view',
      'operations:manage',
      'duty:manage',
      'discipline:view',
      'discipline:manage',
      'tickets:view',
      'tickets:manage',
      'votes:view',
      'votes:create',
      'pacts:view',
      'treasury:view',
      'store:view'
    ]
  },
  {
    key: 'business',
    name: 'بزنس مانجر',
    short: 'BIZ',
    level: 70,
    color: '#4ecdc4',
    icon: '◈',
    isSystem: true,
    order: 3,
    permissions: [
      'dashboard:view',
      'attendance:view',
      'leaderboard:view',
      'members:view',
      'treasury:view',
      'treasury:manage',
      'store:view',
      'store:internal',
      'store:manage',
      'orders:view',
      'orders:manage',
      'votes:view',
      'tickets:view'
    ]
  },
  {
    key: 'member',
    name: 'عضو',
    short: 'SOLDATO',
    level: 20,
    color: '#c7b8ba',
    icon: '◆',
    isSystem: true,
    order: 4,
    permissions: [
      'dashboard:view',
      'attendance:view',
      'leaderboard:view',
      'operations:view',
      'store:view',
      'store:internal',
      'orders:view',
      'votes:view',
      'tickets:view'
    ]
  },
  {
    key: 'store',
    name: 'متجر',
    short: 'SHOP',
    level: 10,
    color: '#b58cff',
    icon: '▣',
    isSystem: true,
    order: 5,
    permissions: ['dashboard:view', 'store:view', 'store:internal', 'orders:view', 'leaderboard:view']
  },
  {
    key: 'guest',
    name: 'زائر',
    short: 'GUEST',
    level: 0,
    color: '#6b6668',
    icon: '○',
    isSystem: true,
    order: 6,
    permissions: []
  }
];

function rankByKey(key) {
  return RANKS.find((rank) => rank.key === key) || RANKS[RANKS.length - 1];
}

module.exports = { PERMISSIONS, ALL_PERMISSIONS, RANKS, rankByKey };
