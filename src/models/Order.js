const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    price: { type: Number, default: 0, min: 0 },
    qty: { type: Number, required: true, min: 1, max: 999 },
    total: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

const orderHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    at: { type: Date, default: Date.now },
    byName: { type: String, default: '' },
    note: { type: String, default: '', maxlength: 300 }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['external', 'internal'], default: 'external', index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    customer: {
      name: { type: String, default: '', trim: true, maxlength: 120 },
      contact: { type: String, default: '', trim: true, maxlength: 160 },
      discord: { type: String, default: '', trim: true, maxlength: 120 }
    },
    items: { type: [orderItemSchema], default: [] },
    total: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'completed', 'cancelled'],
      default: 'pending',
      index: true
    },
    note: { type: String, default: '', maxlength: 600 },
    staffNote: { type: String, default: '', maxlength: 600 },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    handledByName: { type: String, default: '' },
    history: { type: [orderHistorySchema], default: [] }
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

orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
