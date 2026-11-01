const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    qty: { type: Number, required: true, min: 1, max: 1000000 },
    unitPrice: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 }
  },
  { _id: true }
);

const operationSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    type: { type: String, enum: ['heist', 'supply', 'defense', 'territory', 'collection', 'other'], default: 'other' },
    result: { type: String, enum: ['win', 'loss'], required: true, index: true },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    participantNames: { type: [String], default: [] },
    looted: { type: [itemSchema], default: [] },
    lost: { type: [itemSchema], default: [] },
    money: { type: Number, default: 0, min: 0 },
    lootValue: { type: Number, default: 0, min: 0 },
    lostValue: { type: Number, default: 0, min: 0 },
    netValue: { type: Number, default: 0 },
    goalDelta: { type: Number, default: 0 },
    weekKey: { type: String, default: '', index: true },
    notes: { type: String, default: '', maxlength: 1200 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, default: '' },
    discordMessageId: { type: String, default: '' },
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

operationSchema.index({ result: 1, createdAt: -1 });

module.exports = mongoose.model('Operation', operationSchema);
