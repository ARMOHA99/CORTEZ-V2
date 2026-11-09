const mongoose = require('mongoose');

/*
 * جهاز مرتبط بعضو عبر تطبيق الدوام (CortezAgent).
 * نخزّن بصمة الرمز فقط، والرمز الأصلي يبقى عند العضو في جهازه.
 */
const agentDeviceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceId: { type: String, default: '', maxlength: 120 },
    tokenHash: { type: String, required: true, index: true },
    label: { type: String, default: 'جهاز', maxlength: 120 },
    platform: { type: String, default: 'windows', maxlength: 40 },
    appVersion: { type: String, default: '', maxlength: 40 },
    lastSeenAt: { type: Date, default: null, index: true },
    lastIpHash: { type: String, default: '' },
    duty: { type: Boolean, default: false },
    /* آخر مرة ثبت فيها اتصال حقيقي بسيرفر اللعبة */
    verifiedAt: { type: Date, default: null },
    lastDiag: { type: String, default: '', maxlength: 200 },
    revokedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

agentDeviceSchema.index({ user: 1, revokedAt: 1 });

module.exports = mongoose.model('AgentDevice', agentDeviceSchema);
