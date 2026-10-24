const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['income', 'expense'], required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    category: { type: String, default: 'general', trim: true, maxlength: 60, index: true },
    description: { type: String, required: true, trim: true, maxlength: 400 },
    refType: { type: String, enum: ['operation', 'order', 'manual', 'penalty', 'purchase', 'goal', ''], default: 'manual' },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    balanceAfter: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '' },
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

transactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
