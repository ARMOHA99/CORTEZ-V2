const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: '', maxlength: 2500 },
    options: {
      type: [
        {
          key: { type: String, required: true },
          label: { type: String, required: true, maxlength: 140 }
        }
      ],
      validate: {
        validator: (options) => Array.isArray(options) && options.length >= 2 && options.length <= 8,
        message: 'يجب توفير خيارين على الأقل وحتى 8 خيارات'
      }
    },
    eligibleRanks: { type: [String], default: [] },
    anonymous: { type: Boolean, default: false },
    minParticipation: { type: Number, default: 1, min: 1 },
    closesAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ['open', 'closed', 'vetoed'], default: 'open', index: true },
    voters: {
      type: [
        {
          user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          userName: { type: String, default: '' },
          choice: { type: String, required: true },
          fingerprint: { type: String, default: '' },
          at: { type: Date, default: Date.now }
        }
      ],
      default: []
    },
    veto: {
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      byName: { type: String, default: '' },
      reason: { type: String, default: '', maxlength: 400 },
      at: { type: Date, default: null }
    },
    result: {
      approved: { type: Boolean, default: null },
      tallies: { type: mongoose.Schema.Types.Mixed, default: {} },
      participation: { type: Number, default: 0 },
      totalVotes: { type: Number, default: 0 },
      closedAt: { type: Date, default: null }
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, default: '' },
    discordSent: { type: Boolean, default: false }
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

voteSchema.index({ status: 1, closesAt: 1 });

module.exports = mongoose.model('Vote', voteSchema);
