const mongoose = require('mongoose');

/*
 * إنذار (وارن) على عضو بسبب غياب.
 * status: active ساري، cleared رُفع بعذر معتمد أو بيد الإدارة، expired انتهت مدته.
 */
const warningSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userSnapshot: {
      name: { type: String, default: '' },
      rank: { type: String, default: '' },
      discordId: { type: String, default: '' }
    },
    level: { type: Number, default: 1, min: 1, max: 5 },
    reason: { type: String, default: '', maxlength: 400 },
    dateKey: { type: String, default: '', index: true },
    status: { type: String, enum: ['active', 'cleared', 'expired'], default: 'active', index: true },
    expiresAt: { type: Date, default: null },
    attendance: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceDay', default: null },
    issuedAt: { type: Date, default: Date.now },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    issuedByName: { type: String, default: 'النظام' },
    roleId: { type: String, default: '' },
    channelId: { type: String, default: '' },
    clearedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    clearedByName: { type: String, default: '' },
    clearedAt: { type: Date, default: null },
    clearReason: { type: String, default: '', maxlength: 400 }
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

warningSchema.index({ user: 1, status: 1 });
warningSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('Warning', warningSchema);
