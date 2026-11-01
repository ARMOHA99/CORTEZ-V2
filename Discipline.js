const mongoose = require('mongoose');

const disciplineSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userSnapshot: {
      name: { type: String, default: '' },
      discordId: { type: String, default: '' }
    },
    type: { type: String, enum: ['note', 'warning', 'fine'], required: true, index: true },
    reason: { type: String, required: true, trim: true, maxlength: 700 },
    amount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'revoked'], default: 'active', index: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    issuedByName: { type: String, default: '' },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokedByName: { type: String, default: '' },
    revokedAt: { type: Date, default: null },
    revokeReason: { type: String, default: '', maxlength: 300 },
    discordSynced: { type: Boolean, default: false },
    discordError: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now, index: true }
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

disciplineSchema.index({ user: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Discipline', disciplineSchema);
