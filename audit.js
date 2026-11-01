const crypto = require('crypto');

async function log({ actor = null, actorName = '', action, description = '', targetType = '', targetId = '', meta = {}, req = null }) {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return null;
    const AuditLog = require('../models/AuditLog');
    const entry = await AuditLog.create({
      actor: actor ? actor._id : null,
      actorName: actorName || (actor ? actor.displayName || actor.username : 'النظام'),
      action,
      description,
      targetType,
      targetId: targetId ? String(targetId) : '',
      meta,
      ip: req ? req.ip || '' : ''
    });
    return entry;
  } catch (error) {
    console.error('[Audit]', error.message);
    return null;
  }
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

module.exports = { log, hash };
