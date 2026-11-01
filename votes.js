const express = require('express');
const { asyncHandler } = require('../utils/http');
const { requireAuth, requirePermission } = require('../middleware/auth');
const votesService = require('../services/votes');
const audit = require('../services/audit');

const router = express.Router();

router.get(
  '/',
  requireAuth,
  requirePermission('votes:view'),
  asyncHandler(async (req, res) => {
    const items = await votesService.listVotes(req.user, { status: req.query.status || '' });
    res.json({ items });
  })
);

router.post(
  '/',
  requireAuth,
  requirePermission('votes:create'),
  asyncHandler(async (req, res) => {
    const vote = await votesService.createVote({ data: req.body || {}, user: req.user });
    await audit.log({
      actor: req.user,
      action: 'vote.create',
      description: `إنشاء تصويت ${vote.code} — ${vote.title}`,
      targetType: 'vote',
      targetId: String(vote._id),
      req
    });
    res.status(201).json({ ok: true, vote: votesService.serializeVote(vote, req.user) });
  })
);

router.post(
  '/:id/cast',
  requireAuth,
  requirePermission('votes:view'),
  asyncHandler(async (req, res) => {
    const { choice } = req.body || {};
    const result = await votesService.castVote({
      voteId: req.params.id,
      user: req.user,
      choice,
      req
    });
    res.json({
      ok: true,
      fingerprint: result.fingerprint,
      vote: votesService.serializeVote(result.vote, req.user)
    });
  })
);

router.post(
  '/:id/veto',
  requireAuth,
  requirePermission('votes:veto'),
  asyncHandler(async (req, res) => {
    const vote = await votesService.vetoVote({
      voteId: req.params.id,
      user: req.user,
      reason: (req.body && req.body.reason) || ''
    });
    await audit.log({
      actor: req.user,
      action: 'vote.veto',
      description: `نقض التصويت ${vote.code}`,
      targetType: 'vote',
      targetId: String(vote._id),
      req
    });
    res.json({ ok: true, vote: votesService.serializeVote(vote, req.user) });
  })
);

router.post(
  '/:id/close',
  requireAuth,
  requirePermission('votes:create'),
  asyncHandler(async (req, res) => {
    const mongoose = require('mongoose');
    const Vote = require('../models/Vote');
    const existing = await Vote.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'التصويت غير موجود' });
    const vote = await votesService.closeVote(existing, { user: req.user, reason: 'إغلاق يدوي', force: true });
    await audit.log({
      actor: req.user,
      action: 'vote.close',
      description: `إغلاق التصويت ${vote.code}`,
      targetType: 'vote',
      targetId: String(vote._id),
      req
    });
    res.json({ ok: true, vote: votesService.serializeVote(vote, req.user) });
  })
);

module.exports = router;
