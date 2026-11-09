const mongoose = require('mongoose');

/* رمز ربط مؤقت: يستخرجه العضو من الموقع ويلصقه في تطبيق الدوام مرة واحدة */
const agentCodeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    code: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

agentCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AgentCode', agentCodeSchema);
