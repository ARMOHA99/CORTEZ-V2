const express = require('express');
const { asyncHandler, httpError } = require('../utils/http');
const { requireAuth, requirePermission } = require('../middleware/auth');
const dutyService = require('../services/duty');
const time = require('../utils/time');

const router = express.Router();

router.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    const summary = await dutyService.personalSummary(req.user._id);
    res.json({ summary });
  })
);

router.get(
  '/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const summary = await dutyService.personalSummary(req.user._id);
    res.json({ status: summary.status, shift: summary.shift });
  })
);

router.post(
  '/start',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await dutyService.startDuty(req.user, req, { bypassLock: req.permissions.includes('duty:night') });
    const summary = await dutyService.personalSummary(req.user._id);
    res.json({ ok: true, ...result, summary });
  })
);

router.post(
  '/pause',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await dutyService.pauseDuty(req.user);
    const summary = await dutyService.personalSummary(req.user._id);
    res.json({ ok: true, ...result, summary });
  })
);

router.post(
  '/resume',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await dutyService.resumeDuty(req.user);
    const summary = await dutyService.personalSummary(req.user._id);
    res.json({ ok: true, ...result, summary });
  })
);

router.post(
  '/end',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await dutyService.endDuty(req.user, { note: req.body.note });
    const summary = await dutyService.personalSummary(req.user._id);
    res.json({ ok: true, ...result, summary });
  })
);

router.get(
  '/attendance',
  requireAuth,
  requirePermission('attendance:view'),
  asyncHandler(async (req, res) => {
    const grid = await dutyService.attendanceGrid(req.query.week || null);
    res.json(grid);
  })
);

router.get(
  '/live',
  requireAuth,
  requirePermission('duty:manage'),
  asyncHandler(async (req, res) => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return res.json({ items: [] });
    const Shift = require('../models/Shift');
    const shifts = await Shift.find({ status: { $in: ['active', 'paused'] } })
      .sort({ startAt: 1 })
      .lean();
    const items = shifts.map((shift) => ({
      _id: shift._id,
      userId: shift.user,
      name: shift.userSnapshot ? shift.userSnapshot.name : 'عضو',
      rank: shift.userSnapshot ? shift.userSnapshot.rank : '',
      status: shift.status,
      startAt: shift.startAt,
      minutes: dutyService.liveMinutes(shift)
    }));
    res.json({ items });
  })
);

router.get(
  '/report/:userId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const isSelf = String(req.user._id) === String(req.params.userId);
    if (!isSelf && !req.permissions.includes('duty:manage')) {
      throw httpError(403, 'لا تملك صلاحية عرض تقارير الآخرين', 'FORBIDDEN');
    }
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.json({ summary: null, shifts: [], user: null });
    }
    const User = require('../models/User');
    const Shift = require('../models/Shift');
    const user = await User.findById(req.params.userId);
    if (!user) throw httpError(404, 'العضو غير موجود', 'NOT_FOUND');
    const summary = await dutyService.personalSummary(user._id);
    const shifts = await Shift.find({ user: user._id, kind: { $in: ['shift', 'penalty'] } })
      .sort({ startAt: -1 })
      .limit(80)
      .lean();
    res.json({
      user: { _id: user._id, name: user.displayName, rank: user.rank, avatar: user.avatar },
      summary,
      shifts: shifts.map((shift) => ({
        ...shift,
        liveMinutes: shift.status === 'closed' ? shift.totalMinutes : dutyService.liveMinutes(shift)
      })),
      weekDays: time.weekDays(summary.weekKey)
    });
  })
);

router.post(
  '/penalty',
  requireAuth,
  requirePermission('duty:manage'),
  asyncHandler(async (req, res) => {
    const { userId, hours, minutes, reason } = req.body || {};
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const User = require('../models/User');
    const target = await User.findById(userId);
    if (!target) throw httpError(404, 'العضو غير موجود', 'NOT_FOUND');
    const totalMinutes = Math.round(Number(minutes) || 0) || Math.round(Number(hours || 0) * 60);
    if (!totalMinutes) throw httpError(400, 'حدد عدد الساعات أو الدقائق', 'INVALID_MINUTES');
    const shift = await dutyService.penalize(req.user, target, totalMinutes, reason);
    const audit = require('../services/audit');
    await audit.log({
      actor: req.user,
      action: 'duty.penalty',
      description: `خصم ${totalMinutes} دقيقة من ${target.displayName} — ${reason || ''}`,
      targetType: 'user',
      targetId: String(target._id),
      req
    });
    res.json({ ok: true, shift });
  })
);

module.exports = router;
