const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    sku: { type: String, default: '', trim: true, maxlength: 40, index: true },
    description: { type: String, default: '', maxlength: 800 },
    category: { type: String, enum: ['weapon', 'drug', 'gear', 'vehicle', 'service', 'other'], default: 'other' },
    scope: { type: String, enum: ['external', 'internal', 'both'], default: 'both', index: true },
    price: { type: Number, default: 0, min: 0 },
    cost: { type: Number, default: 0, min: 0 },
    image: { type: String, default: '', maxlength: 500 },
    stock: { type: Number, default: null, min: 0 },
    active: { type: Boolean, default: true, index: true },
    featured: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
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

productSchema.index({ active: 1, scope: 1, order: 1 });

module.exports = mongoose.model('Product', productSchema);
