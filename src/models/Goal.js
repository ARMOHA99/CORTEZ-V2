const mongoose = require('mongoose');

const goalHistorySchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    reason: { type: String, default: '' },
    refType: { type: String, default: '' },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    byName: { type: String, default: '' },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

/* هدية أسبوعية: صورة + نوع + مبلغ */
const prizeSchema = new mongoose.Schema(
  {
    rank: { type: Number, default: 0 },
    name: { type: String, default: '', maxlength: 120 },
    imageUrl: { type: String, default: '', maxlength: 500 },
    type: { type: String, default: 'عتاد', maxlength: 60 },
    amount: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

const winnerSchema = new mongoose.Schema(
  {
    rank: { type: Number, default: 0 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, default: '' },
    awardedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const goalSchema = new mongoose.Schema(
  {
    weekKey: { type: String, required: true, unique: true, index: true },
    target: { type: Number, default: 500000, min: 0 },
    earned: { type: Number, default: 0, min: 0 },
    lost: { type: Number, default: 0, min: 0 },
    current: { type: Number, default: 0, min: 0 },
    history: { type: [goalHistorySchema], default: [] },
    prizes: { type: [prizeSchema], default: [] },
    winners: { type: [winnerSchema], default: [] },
    rewardsAwardedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
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

goalSchema.virtual('percent').get(function percent() {
  if (!this.target) return 0;
  return Math.min(100, Math.round((this.current / this.target) * 1000) / 10);
});

module.exports = mongoose.model('Goal', goalSchema);
