const mongoose = require('mongoose');

/* إعلان في سوق الأعضاء: منتج يعرضه عضو للبيع داخل المتجر الداخلي */
const marketListingSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sellerName: { type: String, default: '', trim: true, maxlength: 120 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 600 },
    category: { type: String, enum: ['weapon', 'drug', 'gear', 'vehicle', 'service', 'other'], default: 'other' },
    price: { type: Number, required: true, min: 1 },
    qty: { type: Number, default: 1, min: 1, max: 99 },
    remaining: { type: Number, default: 1, min: 0 },
    image: { type: String, default: '', maxlength: 500 },
    gallery: { type: [String], default: [] },
    weekKey: { type: String, default: '', index: true },
    status: {
      type: String,
      enum: ['pending', 'active', 'paused', 'rejected', 'sold', 'expired', 'cancelled'],
      default: 'pending',
      index: true
    },
    adminNote: { type: String, default: '', maxlength: 300 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByName: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null, index: true },
    views: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
    grossTotal: { type: Number, default: 0 },
    commissionTotal: { type: Number, default: 0 },
    netTotal: { type: Number, default: 0 }
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

marketListingSchema.index({ status: 1, createdAt: -1 });
marketListingSchema.index({ seller: 1, createdAt: -1 });

module.exports = mongoose.model('MarketListing', marketListingSchema);
marketListingSchema.index({ status: 1, expiresAt: 1 });
marketListingSchema.index({ seller: 1, createdAt: -1 });

module.exports = mongoose.model('MarketListing', marketListingSchema);
