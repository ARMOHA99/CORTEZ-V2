const mongoose = require('mongoose');

/* وسام ممنوح لعضو. التعريفات نفسها تعيش في src/services/achievements.js */
const badgeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    key: { type: String, required: true, index: true },
    name: { type: String, default: '' },
    tier: { type: String, default: 'bronze' },
    source: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    note: { type: String, default: '', maxlength: 300 },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    grantedByName: { type: String, default: '' },
    awardedAt: { type: Date, default: Date.now, index: true }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      }
    }
  }
);

badgeSchema.index({ user: 1, key: 1 }, { unique: true });
badgeSchema.index({ key: 1, awardedAt: -1 });
badgeSchema.index({ user: 1, awardedAt: -1 });

module.exports = mongoose.model('Badge', badgeSchema);
