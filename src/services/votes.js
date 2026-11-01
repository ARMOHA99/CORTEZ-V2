const crypto = require('crypto');
const realtime = require('../realtime');
const discordService = require('./discord');
const notify = require('./notify');

function mongooseReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

function httpError(status, message, code = '') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function fingerprintFor(voteId, user, choice) {
  return crypto
    .createHash('sha256')
    .update(`${voteId}:${user._id}:${user.discordId}:${choice}:cortez-blood`)
    .digest('hex')
    .slice(0, 32);
}

function isEligible(vote, user) {
  if (!user) return false;
  if (!vote.eligibleRanks || vote.eligibleRanks.length === 0) return user.rank !== 'guest';
  return vote.eligibleRanks.includes(user.rank);
}

function serializeVote(vote, viewer = null) {
  const plain = vote.toJSON ? vote.toJSON() : { ...vote };
  const totalVotes = (plain.voters || []).length;
  const tallies = {};
  for (const option of plain.options || []) tallies[option.key] = 0;
  for (const ballot of plain.voters || []) {
    tallies[ballot.choice] = (tallies[ballot.choice] || 0) + 1;
  }
  const showNames = !plain.anonymous || plain.status !== 'open';
  const voters = (plain.voters || []).map((ballot) => ({
    userName: showNames ? ballot.userName : 'ناخب مجهول',
    choice: plain.status === 'open' && plain.anonymous ? null : ballot.choice,
    at: ballot.at,
    fingerprint: ballot.fingerprint ? `${ballot.fingerprint.slice(0, 10)}…` : ''
  }));
  const myBallot = viewer
    ? (plain.voters || []).find((ballot) => String(ballot.user) === String(viewer._id))
    : null;
  const canSeeLive = viewer && ['owner', 'operations'].includes(viewer.rank);
  return {
    _id: plain._id,
    code: plain.code,
    title: plain.title,
    description: plain.description,
    options: plain.options,
    eligibleRanks: plain.eligibleRanks,
    anonymous: plain.anonymous,
    minParticipation: plain.minParticipation,
    closesAt: plain.closesAt,
    status: plain.status,
    createdAt: plain.createdAt,
    createdByName: plain.createdByName,
    tallies: plain.status === 'open' && plain.anonymous && !canSeeLive ? null : tallies,
    totalVotes,
    participation: totalVotes,
    voters: showNames && plain.status !== 'open' ? voters : [],
    voterCount: voters.length,
    myChoice: myBallot ? (plain.anonymous && plain.status === 'open' ? 'cast' : myBallot.choice) : null,
    hasVoted: Boolean(myBallot),
    veto: plain.veto,
    result: plain.result,
    eligible: viewer ? isEligible(plain, viewer) : false,
    eligibleCount: plain.eligibleCount || null
  };
}

async function createVote({ data, user }) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const Vote = require('../models/Vote');
  const Counter = require('../models/Counter');
  const User = require('../models/User');
  const title = String(data.title || '').trim();
  if (!title) throw httpError(400, 'عنوان التصويت مطلوب', 'TITLE_REQUIRED');

  const rawOptions = Array.isArray(data.options) && data.options.length
    ? data.options
    : [
        { key: 'approve', label: 'أُقِرّ' },
        { key: 'reject', label: 'رُفِض' }
      ];
  const options = rawOptions.slice(0, 8).map((option, index) => ({
    key: String(option.key || `option-${index + 1}`).slice(0, 30),
    label: String(option.label || option).slice(0, 140)
  }));
  if (options.length < 2) throw httpError(400, 'يجب توفير خيارين على الأقل', 'OPTIONS_REQUIRED');

  const closesAt = new Date(data.closesAt || Date.now() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(closesAt.getTime()) || closesAt <= new Date()) {
    throw httpError(400, 'وقت إغلاق التصويت يجب أن يكون في المستقبل', 'INVALID_DATE');
  }
  const eligibleRanks = Array.isArray(data.eligibleRanks)
    ? data.eligibleRanks.map(String).filter(Boolean)
    : [];
  const eligibleCount = eligibleRanks.length
    ? await User.countDocuments({ rank: { $in: eligibleRanks }, blocked: false, inGuild: true })
    : await User.countDocuments({ rank: { $ne: 'guest' }, blocked: false, inGuild: true });

  const seq = await Counter.next('vote', 100);
  const vote = await Vote.create({
    code: `VOT-${seq}`,
    title: title.slice(0, 180),
    description: String(data.description || '').slice(0, 2500),
    options,
    eligibleRanks,
    anonymous: Boolean(data.anonymous),
    minParticipation: Math.max(1, Math.min(eligibleCount || 1, Number(data.minParticipation) || 1)),
    closesAt,
    createdBy: user._id,
    createdByName: user.displayName || user.username || '',
    eligibleCount
  });

  realtime.emit('votes:update', { action: 'created', vote: serializeVote(vote, null) });
  realtime.emit('dashboard:refresh', { reason: 'vote' });
  try {
    await notify.broadcastMembers({
      title: 'تصويت جديد في غرفة الدم',
      body: `${vote.title} — يُغلق في ${new Date(vote.closesAt).toLocaleString('ar-SA')}`,
      type: 'info',
      link: '/#/votes'
    });
  } catch (error) {
    /* ignore */
  }
  return vote;
}

async function castVote({ voteId, user, choice, req = null }) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const Vote = require('../models/Vote');
  const vote = await Vote.findById(voteId);
  if (!vote) throw httpError(404, 'التصويت غير موجود', 'NOT_FOUND');
  if (vote.status !== 'open') throw httpError(400, 'التصويت مغلق', 'VOTE_CLOSED');
  if (new Date(vote.closesAt) <= new Date()) {
    await closeVote(vote, { reason: 'انتهى الوقت' });
    throw httpError(400, 'انتهى وقت التصويت', 'VOTE_EXPIRED');
  }
  if (!isEligible(vote, user)) throw httpError(403, 'ليست لديك صلاحية التصويت في هذا القرار', 'NOT_ELIGIBLE');
  if (vote.voters.some((ballot) => String(ballot.user) === String(user._id))) {
    throw httpError(409, 'لقد صوّتت مسبقاً في هذا القرار', 'ALREADY_VOTED');
  }
  const option = vote.options.find((item) => item.key === choice);
  if (!option) throw httpError(400, 'خيار غير صالح', 'INVALID_CHOICE');

  const fingerprint = fingerprintFor(vote._id, user, choice);
  vote.voters.push({
    user: user._id,
    userName: user.displayName || user.username || 'عضو',
    choice,
    fingerprint,
    at: new Date()
  });
  await vote.save();

  realtime.emit('votes:update', {
    action: 'vote-cast',
    vote: serializeVote(vote, null)
  });
  realtime.emitToUser(user._id, 'vote:accepted', {
    voteId: String(vote._id),
    choice,
    fingerprint: `${fingerprint.slice(0, 12)}…`
  });
  return { vote, fingerprint };
}

function tally(vote) {
  const tallies = {};
  for (const option of vote.options) tallies[option.key] = 0;
  for (const ballot of vote.voters) {
    tallies[ballot.choice] = (tallies[ballot.choice] || 0) + 1;
  }
  return tallies;
}

function decide(vote, tallies) {
  const totalVotes = vote.voters.length;
  if (totalVotes < vote.minParticipation) return false;
  if (Object.prototype.hasOwnProperty.call(tallies, 'approve') || Object.prototype.hasOwnProperty.call(tallies, 'reject')) {
    return (tallies.approve || 0) > (tallies.reject || 0);
  }
  const values = Object.values(tallies).sort((a, b) => b - a);
  if (values.length === 0) return false;
  if (values.length === 1) return values[0] > 0;
  return values[0] > values[1];
}

async function closeVote(voteInput, { user = null, reason = '', force = false } = {}) {
  if (!mongooseReady()) return null;
  const Vote = require('../models/Vote');
  const vote = voteInput && typeof voteInput.save === 'function'
    ? voteInput
    : await Vote.findById(voteInput);
  if (!vote) return null;
  if (vote.status !== 'open') return vote;

  const tallies = tally(vote);
  const totalVotes = vote.voters.length;
  const approved = decide(vote, tallies);
  vote.status = 'closed';
  vote.result = {
    approved,
    tallies,
    participation: totalVotes,
    totalVotes,
    closedAt: new Date()
  };
  vote.closedAt = new Date();
  vote.eligibleCount = vote.eligibleCount || 0;
  await vote.save();

  const payload = serializeVote(vote, null);
  realtime.emit('votes:update', { action: 'closed', vote: payload });
  realtime.emit('dashboard:refresh', { reason: 'vote-closed' });

  try {
    const recipient = vote.createdBy;
    await notify.push(recipient, {
      title: approved ? 'أُقِرّ القرار' : 'رُفِض القرار',
      body: `${vote.title} — ${approved ? 'تم الإقرار بختم الدم' : 'تم الرفض'}`,
      type: approved ? 'success' : 'warning',
      link: '/#/votes'
    });
  } catch (error) {
    /* ignore */
  }

  try {
    if (discordService.isReady() || discordService.hasBot()) {
      await discordService.notifyVoteResult(payload);
      vote.discordSent = true;
      await vote.save();
    }
  } catch (error) {
    console.error('[Votes] discord:', error.message);
  }

  return vote;
}

async function vetoVote({ voteId, user, reason = '' }) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const Vote = require('../models/Vote');
  const vote = await Vote.findById(voteId);
  if (!vote) throw httpError(404, 'التصويت غير موجود', 'NOT_FOUND');
  if (vote.status !== 'open') throw httpError(400, 'التصويت مغلق بالفعل', 'VOTE_CLOSED');
  vote.status = 'vetoed';
  vote.veto = {
    by: user._id,
    byName: user.displayName || user.username || '',
    reason: String(reason || '').slice(0, 400),
    at: new Date()
  };
  const tallies = tally(vote);
  vote.result = {
    approved: false,
    tallies,
    participation: vote.voters.length,
    totalVotes: vote.voters.length,
    closedAt: new Date()
  };
  vote.closedAt = new Date();
  await vote.save();

  const payload = serializeVote(vote, null);
  realtime.emit('votes:update', { action: 'vetoed', vote: payload });
  try {
    if (discordService.isReady() || discordService.hasBot()) {
      await discordService.notifyVoteResult(payload);
    }
  } catch (error) {
    /* ignore */
  }
  return vote;
}

async function closeExpiredVotes() {
  if (!mongooseReady()) return 0;
  const Vote = require('../models/Vote');
  const expired = await Vote.find({ status: 'open', closesAt: { $lte: new Date() } });
  let count = 0;
  for (const vote of expired) {
    await closeVote(vote, { reason: 'انتهى وقت التصويت' });
    count += 1;
  }
  return count;
}

async function listVotes(user, { status = '' } = {}) {
  if (!mongooseReady()) return [];
  const Vote = require('../models/Vote');
  const query = {};
  if (status) query.status = status;
  const votes = await Vote.find(query).sort({ status: 1, closesAt: -1 }).limit(60).lean();
  return votes.map((vote) => {
    const serialized = serializeVote(vote, user);
    serialized.eligible = isEligible(vote, user);
    return serialized;
  });
}

module.exports = {
  createVote,
  castVote,
  closeVote,
  vetoVote,
  closeExpiredVotes,
  listVotes,
  serializeVote,
  isEligible,
  tally,
  httpError
};
