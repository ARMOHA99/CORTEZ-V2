const express = require('express');
const { asyncHandler, httpError } = require('../utils/http');
const { requireAuth, requirePermission } = require('../middleware/auth');
const attendance = require('../services/attendance');
const audit = require('../services/audit');

const router = express.Router();

function dbReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

/* حالة العضو اليوم: حضوره، سلسلة غيابه، إنذاراته، والأيام القابلة للتبرير */
router.get(
  '/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    res.json(await attendance.myStatus(req.user));
  })
);

/* تقديم تبرير غياب */
router.post(
  '/justify',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const body = req.body || {};
    const result = await attendance.submitJustification(req.user, {
      dateKey: body.dateKey,
      text: body.text
    });
    await audit.log({
      actor: req.user,
      action: 'attendance.justify',
      description: `قدّم تبرير غياب ليوم ${body.dateKey}`,
      targetType: 'attendance',
      targetId: body.dateKey,
      req
    }).catch(() => null);
    res.json(result);
  })
);

/* لوحة الإدارة: حضور يوم + التبريرات المعلّقة */
router.get(
  '/review',
  requireAuth,
  requirePermission('attendance:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const [roster, pending, warnings, config] = await Promise.all([
      attendance.roster(req.query.date),
      attendance.pendingReviews(),
      attendance.warningsList({ status: 'active', limit: 40 }),
      attendance.cfg()
    ]);
    res.json({ ...roster, pending, warnings, config });
  })
);

/* اعتماد أو رفض تبرير */
router.post(
  '/review',
  requireAuth,
  requirePermission('attendance:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const body = req.body || {};
    if (!body.id) throw httpError(400, 'حدد السجل', 'ID_REQUIRED');
    const result = await attendance.reviewJustification({
      id: body.id,
      approve: Boolean(body.approve),
      note: body.note,
      admin: req.user
    });
    await audit.log({
      actor: req.user,
      action: body.approve ? 'attendance.approve' : 'attendance.reject',
      description: `${body.approve ? 'قبل' : 'رفض'} تبرير غياب`,
      targetType: 'attendance',
      targetId: body.id,
      req
    }).catch(() => null);
    res.json(result);
  })
);

/* تشغيل التقييم يدويًا (اليوم أو يوم محدد) */
router.post(
  '/run',
  requireAuth,
  requirePermission('attendance:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const body = req.body || {};
    const result = body.dateKey
      ? await attendance.evaluateDate(body.dateKey, { force: true })
      : await attendance.runDue();
    res.json({ ok: true, result });
  })
);

/* إصلاح: حذف الغيابات المحسوبة قبل انضمام العضو للموقع */
router.post(
  '/repair-prejoin',
  requireAuth,
  requirePermission('attendance:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const apply = (req.body || {}).apply !== false;
    const result = await attendance.repairPreJoin({ apply });
    await audit.log({
      actor: req.user,
      action: 'attendance.repair-prejoin',
      description: `إصلاح غيابات قبل الانضمام (${result.removedDays} يوم، ${result.clearedWarnings} إنذار)`,
      req
    }).catch(() => null);
    res.json({ ok: true, ...result });
  })
);

/* رفع إنذار بيد الإدارة */
router.post(
  '/warnings/:id/clear',
  requireAuth,
  requirePermission('attendance:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const result = await attendance.clearWarning(req.params.id, {
      admin: req.user,
      reason: (req.body || {}).reason
    });
    await audit.log({
      actor: req.user,
      action: 'attendance.clear-warning',
      description: 'رفع إنذار غياب',
      targetType: 'warning',
      targetId: req.params.id,
      req
    }).catch(() => null);
    res.json(result);
  })
);

/* حذف سجلات يوم كامل (إعادة تقييم نظيفة) */
router.post(
  '/reset',
  requireAuth,
  requirePermission('attendance:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const key = String((req.body || {}).dateKey || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw httpError(400, 'صيغة التاريخ غير صحيحة', 'BAD_DATE');
    const AttendanceDay = require('../models/AttendanceDay');
    const result = await AttendanceDay.deleteMany({ dateKey: key });
    await audit.log({
      actor: req.user,
      action: 'attendance.reset',
      description: `حذف سجلات الحضور ليوم ${key}`,
      targetType: 'attendance',
      targetId: key,
      req
    }).catch(() => null);
    res.json({ ok: true, deleted: result.deletedCount || 0 });
  })
);

/* تشخيص نظام الحضور: يوضّح سبب عدم إصدار إنذارات */
router.get(
  '/diagnose',
  requireAuth,
  requirePermission('attendance:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const AttendanceDay = require('../models/AttendanceDay');
    const Warning = require('../models/Warning');
    const User = require('../models/User');
    const c = await attendance.cfg();
    const today = attendance.dateKeyNow(new Date(), c);
    const days = await AttendanceDay.find({ dateKey: { $lte: today } })
      .sort({ dateKey: -1 })
      .limit(500)
      .select('dateKey status streak user userSnapshot')
      .lean();
    const byDay = {};
    for (const day of days) {
      byDay[day.dateKey] = byDay[day.dateKey] || { dateKey: day.dateKey, present: 0, absent: 0, other: 0 };
      if (day.status === 'present') byDay[day.dateKey].present += 1;
      else if (day.status === 'absent') byDay[day.dateKey].absent += 1;
      else byDay[day.dateKey].other += 1;
    }
    const latest = Object.values(byDay).sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))[0] || null;
    const absentees = latest
      ? days.filter((d) => d.dateKey === latest.dateKey && d.status === 'absent').map((d) => ({
        name: d.userSnapshot?.name || d.userSnapshot?.displayName || String(d.user),
        streak: d.streak || 0,
        reachedLimit: (d.streak || 0) >= c.absentLimit
      }))
      : [];
    const [warnTotal, warnActive, members] = await Promise.all([
      Warning.countDocuments({}),
      Warning.countDocuments({ status: 'active' }),
      User.countDocuments({ inGuild: true, blocked: false })
    ]);
    res.json({
      today,
      settings: {
        enabled: c.enabled,
        dayStart: c.dayStart,
        closeTime: c.closeTime,
        minMinutes: c.minMinutes,
        absentLimit: c.absentLimit,
        justifyHours: c.justifyHours,
        warnDays: c.warnDays,
        graceDays: c.graceDays,
        dailySummary: c.dailySummary,
        channels: { notify: Boolean(c.notifyChannelId), warn: Boolean(c.warnChannelId), log: Boolean(c.logChannelId) },
        warnRolesConfigured: c.warnRoles.filter(Boolean).length,
        exemptRanks: c.exemptRanks
      },
      members,
      warnings: { total: warnTotal, active: warnActive },
      lastEvaluatedDay: latest,
      absenteesOfLastDay: absentees.slice(0, 40)
    });
  })
);

/* كل الإنذارات (الإدارة) */
router.get(
  '/warnings',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const canManage = (req.permissions || []).includes('attendance:manage');
    const list = await attendance.warningsList(
      canManage ? { status: req.query.status, limit: req.query.limit } : { user: req.user._id, limit: 30 }
    );
    res.json({ items: list });
  })
);

/* منح إجازة أو إنهاؤها */
router.post(
  '/leave',
  requireAuth,
  requirePermission('attendance:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const body = req.body || {};
    if (!body.userId) throw httpError(400, 'حدد العضو', 'USER_REQUIRED');
    const result = await attendance.grantLeave({
      userId: body.userId,
      days: body.days,
      until: body.until,
      reason: body.reason,
      admin: req.user
    });
    await audit.log({
      actor: req.user,
      action: 'attendance.leave',
      description: 'منح إجازة لعضو',
      targetType: 'user',
      targetId: body.userId,
      req
    }).catch(() => null);
    res.json(result);
  })
);

router.delete(
  '/leave/:userId',
  requireAuth,
  requirePermission('attendance:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    res.json(await attendance.endLeave(req.params.userId));
  })
);

module.exports = router;
