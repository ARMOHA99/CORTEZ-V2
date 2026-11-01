const mongoose = require('mongoose');

const breakSchema = new mongoose.Schema(
  {
    startAt: { type: Date, required: true },
    endAt: { type: Date, default: null },
    minutes: { type: Number, default: 0, min: 0 }
  },
  { _id: true }
);

const shiftSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userDiscordId: { type: String, default: '', index: true },
    userSnapshot: {
      name: { type: String, default: '' },
      rank: { type: String, default: '' }
    },
    kind: { type: String, enum: ['shift', 'penalty', 'adjustment'], default: 'shift' },
    dateKey: { type: String, required: true, index: true },
    weekKey: { type: String, required: true, index: true },
    startAt: { type: Date, default: Date.now },
    endAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'paused', 'closed'], default: 'active', index: true },
    breaks: { type: [breakSchema], default: [] },
    breakStartedAt: { type: Date, default: null },
    totalMinutes: { type: Number, default: 0, min: -100000 },
    breakMinutes: { type: Number, default: 0, min: 0 },
    penaltyMinutes: { type: Number, default: 0, min: 0 },
    note: { type: String, default: '', maxlength: 500 },
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    closedAt: { type: Date, default: null },
    autoClosed: { type: Boolean, default: false }
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

shiftSchema.index({ user: 1, dateKey: 1 });
shiftSchema.index({ status: 1, startAt: -1 });
shiftSchema.index({ weekKey: 1, user: 1 });

module.exports = mongoose.model('Shift', shiftSchema);
