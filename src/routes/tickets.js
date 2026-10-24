const express = require('express');
const { asyncHandler, httpError } = require('../utils/http');
const { requireAuth, requirePermission } = require('../middleware/auth');
const notify = require('../services/notify');
const realtime = require('../realtime');
const audit = require('../services/audit');

const router = express.Router();

function dbReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

const TYPE_LABELS = {
  leave: 'إجازة',
  promotion: 'ترقية',
  complaint: 'شكوى'
};

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbReady()) return res.json({ items: [] });
    const Ticket = require('../models/Ticket');
    const canManage = req.permissions.includes('tickets:view') || req.permissions.includes('tickets:manage');
    const wantAll = req.query.all === '1' && canManage;
    const query = wantAll ? {} : { user: req.user._id };
    if (req.query.status) query.status = String(req.query.status);
    const items = await Ticket.find(query)
      .populate('user', 'displayName username avatar rank')
      .sort({ createdAt: -1 })
      .limit(60)
      .lean();
    res.json({ items, canManage });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const Ticket = require('../models/Ticket');
    const ticket = await Ticket.findById(req.params.id)
      .populate('user', 'displayName username avatar rank')
      .populate('approvals.by', 'displayName username')
      .lean();
    if (!ticket) throw httpError(404, 'التذكرة غير موجودة', 'NOT_FOUND');
    const own = String(ticket.user._id) === String(req.user._id);
    if (!own && !req.permissions.includes('tickets:view') && !req.permissions.includes('tickets:manage')) {
      throw httpError(403, 'لا تملك صلاحية عرض هذه التذكرة', 'FORBIDDEN');
    }
    res.json({ ticket });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const { type, title, body, metadata } = req.body || {};
    if (!['leave', 'promotion', 'complaint'].includes(type)) {
      throw httpError(400, 'نوع التذكرة غير صالح', 'INVALID_TYPE');
    }
    const cleanTitle = String(title || '').trim();
    const cleanBody = String(body || '').trim();
    if (cleanTitle.length < 4) throw httpError(400, 'عنوان التذكرة قصير جداً', 'TITLE_REQUIRED');
    if (cleanBody.length < 20) throw httpError(400, 'تفاصيل التذكرة قصيرة جداً (20 حرفاً على الأقل)', 'BODY_REQUIRED');

    const Ticket = require('../models/Ticket');
    const Counter = require('../models/Counter');
    const seq = await Counter.next('ticket', 1000);
    const requiredApprovals = type === 'complaint' ? 1 : type === 'leave' ? 2 : 2;

    const ticket = await Ticket.create({
      code: `TCK-${seq}`,
      user: req.user._id,
      userSnapshot: { name: req.user.displayName || req.user.username, rank: req.user.rank },
      type,
      title: cleanTitle.slice(0, 160),
      body: cleanBody.slice(0, 2500),
      metadata: {
        from: metadata && metadata.from ? new Date(metadata.from) : null,
        to: metadata && metadata.to ? new Date(metadata.to) : null,
        targetRank: metadata && metadata.targetRank ? String(metadata.targetRank).slice(0, 60) : '',
        against: metadata && metadata.against ? String(metadata.against).slice(0, 120) : ''
      },
      requiredApprovals,
      status: 'pending'
    });

    realtime.emit('tickets:update', { action: 'created', ticket: { _id: ticket._id, code: ticket.code } });
    const User = require('../models/User');
    const managers = await User.find({
      $or: [{ rank: 'owner' }, { rank: 'operations' }],
      blocked: false
    })
      .select('_id')
      .lean();
    await notify.pushMany(managers.map((manager) => manager._id), {
      title: `تذكرة ${TYPE_LABELS[type]} جديدة`,
      body: `${ticket.code} — ${ticket.title}`,
      type: 'info',
      link: '/#/tickets'
    });
    await audit.log({
      actor: req.user,
      action: 'ticket.create',
      description: `إنشاء تذكرة ${ticket.code} (${TYPE_LABELS[type]})`,
      targetType: 'ticket',
      targetId: String(ticket._id),
      req
    });

    res.status(201).json({ ok: true, ticket: ticket.toJSON() });
  })
);

router.post(
  '/:id/decision',
  requireAuth,
  requirePermission('tickets:manage'),
  asyncHandler(async (req, res) => {
    if (!dbReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const { decision, note } = req.body || {};
    if (!['approve', 'reject'].includes(decision)) throw httpError(400, 'قرار غير صالح', 'INVALID_DECISION');
    const Ticket = require('../models/Ticket');
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) throw httpError(404, 'التذكرة غير موجودة', 'NOT_FOUND');
    if (ticket.status !== 'pending') throw httpError(400, 'التذكرة مغلقة بالفعل', 'TICKET_FINAL');
    if (ticket.approvals.some((approval) => String(approval.by) === String(req.user._id))) {
      throw httpError(409, 'لقد اتخذت قرارك في هذه التذكرة مسبقاً', 'ALREADY_DECIDED');
    }

    ticket.approvals.push({
      by: req.user._id,
      byName: req.user.displayName || req.user.username || '',
      decision,
      note: String(note || '').slice(0, 400),
      at: new Date()
    });

    if (decision === 'reject') {
      ticket.status = 'rejected';
      ticket.closedAt = new Date();
      ticket.closedByName = req.user.displayName || req.user.username || '';
    } else if (ticket.approvals.filter((approval) => approval.decision === 'approve').length >= ticket.requiredApprovals) {
      ticket.status = 'approved';
      ticket.closedAt = new Date();
      ticket.closedByName = req.user.displayName || req.user.username || '';
    }
    await ticket.save();

    realtime.emit('tickets:update', { action: 'decision', ticketId: String(ticket._id), status: ticket.status });
    realtime.emitToUser(ticket.user, 'ticket:update', { ticketId: String(ticket._id), status: ticket.status });
    await notify.push(ticket.user, {
      title: ticket.status === 'pending' ? 'تم تسجيل موافقة على تذكرتك' : `تذكرة ${ticket.code} — ${ticket.status === 'approved' ? 'مقبولة' : 'مرفوضة'}`,
      body: note || ticket.title,
      type: ticket.status === 'rejected' ? 'danger' : 'success',
      link: '/#/tickets'
    });
    await audit.log({
      actor: req.user,
      action: 'ticket.decision',
      description: `${decision} على التذكرة ${ticket.code}`,
      targetType: 'ticket',
      targetId: String(ticket._id),
      req
    });
    res.json({ ok: true, ticket: ticket.toJSON() });
  })
);

module.exports = router;
