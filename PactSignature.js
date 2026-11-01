const mongoose = require('mongoose');

const pactSignatureSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    discordId: { type: String, required: true, index: true },
    displayName: { type: String, default: '' },
    username: { type: String, default: '' },
    version: { type: Number, required: true, index: true },
    contentHash: { type: String, required: true },
    fingerprint: { type: String, required: true },
    signedAt: { type: Date, default: Date.now, index: true },
    ipHash: { type: String, default: '' },
    agentHash: { type: String, default: '' }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      }
    }
  }
);

pactSignatureSchema.index({ discordId: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('PactSignature', pactSignatureSchema);
