const crypto = require('crypto');
const realtime = require('../realtime');
const settingsService = require('./settings');
const audit = require('./audit');

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

function hashContent(text, version) {
  return crypto.createHash('sha256').update(`${version}:${text}`).digest('hex');
}

function makeFingerprint(user, pact) {
  return crypto
    .createHash('sha256')
    .update(`${pact.version}:${pact.text}:${user.discordId}:${user._id}:blood-pact`)
    .digest('hex');
}

async function statusFor(user) {
  const pact = await settingsService.currentPact();
  const signedVersion = user && user.bloodPact ? Number(user.bloodPact.version || 0) : 0;
  const signed = Boolean(user && user.bloodPact && user.bloodPact.signed && signedVersion === pact.version);
  return {
    pact,
    signed,
    signedVersion,
    version: pact.version,
    signedAt: user && user.bloodPact ? user.bloodPact.signedAt : null,
    signatureId: user && user.bloodPact ? user.bloodPact.signatureId : null,
    required: Boolean(user && user.rank !== 'guest' && !signed)
  };
}

async function sign({ user, req = null }) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const PactSignature = require('../models/PactSignature');
  const User = require('../models/User');
  const pact = await settingsService.currentPact();

  if (user.bloodPact && user.bloodPact.signed && Number(user.bloodPact.version) === pact.version) {
    return { alreadySigned: true, version: pact.version, signedAt: user.bloodPact.signedAt };
  }

  const contentHash = hashContent(pact.text, pact.version);
  const fingerprint = makeFingerprint(user, pact);
  const ipHash = req ? audit.hash(req.ip || '') : '';

  let signature = await PactSignature.findOne({ user: user._id, version: pact.version });
  if (!signature) {
    signature = await PactSignature.create({
      user: user._id,
      discordId: user.discordId,
      displayName: user.displayName || user.username || '',
      username: user.username || '',
      version: pact.version,
      contentHash,
      fingerprint,
      signedAt: new Date(),
      ipHash,
      agentHash: req ? audit.hash(req.get('user-agent') || '') : ''
    });
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        'bloodPact.signed': true,
        'bloodPact.version': pact.version,
        'bloodPact.signedAt': signature.signedAt,
        'bloodPact.signatureId': signature._id
      }
    }
  );

  realtime.emit('pacts:update', { action: 'signed', userId: String(user._id), version: pact.version });
  realtime.emitToUser(user._id, 'pact:signed', {
    version: pact.version,
    signedAt: signature.signedAt,
    fingerprint: `${fingerprint.slice(0, 16)}…`
  });

  return {
    alreadySigned: false,
    version: pact.version,
    signedAt: signature.signedAt,
    fingerprint,
    signatureId: signature._id
  };
}

async function signatures() {
  if (!mongooseReady()) return { signatures: [], unsigned: [], stats: { total: 0, signed: 0, unsigned: 0 } };
  const PactSignature = require('../models/PactSignature');
  const User = require('../models/User');
  const pact = await settingsService.currentPact();
  const [signatures, users, ranks] = await Promise.all([
    PactSignature.find({ version: pact.version }).sort({ signedAt: -1 }).lean(),
    User.find({ blocked: false, inGuild: true, rank: { $ne: 'guest' } })
      .select('displayName username avatar rank bloodPact discordId')
      .lean(),
    require('./ranks').getRanks()
  ]);
  const rankMap = new Map(ranks.map((rank) => [rank.key, rank]));
  const signedIds = new Set(signatures.map((signature) => String(signature.user)));
  const unsigned = users
    .filter((user) => !signedIds.has(String(user._id)))
    .map((user) => ({
      _id: user._id,
      name: user.displayName || user.username || 'عضو',
      avatar: user.avatar || '',
      rank: user.rank,
      rankName: rankMap.get(user.rank)?.name || user.rank
    }));
  return {
    version: pact.version,
    title: pact.title,
    signatures: signatures.map((signature) => ({
      ...signature,
      fingerprint: `${signature.fingerprint.slice(0, 20)}…`
    })),
    unsigned,
    stats: {
      total: users.length,
      signed: signatures.length,
      unsigned: unsigned.length,
      percent: users.length ? Math.round((signatures.length / users.length) * 100) : 0
    }
  };
}

async function updateContent({ title, subtitle, text, user, req = null }) {
  if (!mongooseReady()) throw httpError(503, 'قاعدة البيانات غير متصلة حالياً', 'DB_OFFLINE');
  const cleanText = String(text || '').trim();
  if (cleanText.length < 40) throw httpError(400, 'نص العقد قصير جداً', 'TEXT_TOO_SHORT');
  const pact = await settingsService.currentPact();
  const nextVersion = pact.version + 1;
  await settingsService.setMany(
    {
      'pact.title': String(title || pact.title).slice(0, 80),
      'pact.subtitle': String(subtitle || pact.subtitle).slice(0, 160),
      'pact.text': cleanText.slice(0, 12000),
      'pact.version': nextVersion
    },
    user
  );
  await audit.log({
    actor: user,
    action: 'pact.updated',
    description: `تم تحديث عقد الدم إلى الإصدار ${nextVersion}`,
    targetType: 'pact',
    targetId: String(nextVersion),
    req
  });
  realtime.emit('pacts:update', { action: 'content-updated', version: nextVersion });
  return settingsService.currentPact();
}

async function unresolvedCount() {
  if (!mongooseReady()) return 0;
  const User = require('../models/User');
  const pact = await settingsService.currentPact();
  return User.countDocuments({
    blocked: false,
    inGuild: true,
    rank: { $ne: 'guest' },
    $or: [
      { 'bloodPact.signed': false },
      { 'bloodPact.version': { $ne: pact.version } }
    ]
  });
}

module.exports = {
  statusFor,
  sign,
  signatures,
  updateContent,
  unresolvedCount,
  hashContent,
  makeFingerprint,
  httpError
};
