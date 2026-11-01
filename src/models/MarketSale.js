const mongoose = require('mongoose');

/* سطر بيع واحد في سوق الأعضاء: يربط الإعلان بالطلب ويحفظ العمولة والصافي */
const marketSaleSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketListing', required: true, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    orderCode: { type: String, default: '', maxlength: 40 },
    itemName: { type: String, default: '', maxlength: 120 },
    qty: { type: Number, default: 1, min: 1 },
    gross: { type: Number, default: 0, min: 0 },
    commissionPercent: { type: Number, default: 0, min: 0, max: 100 },
    commission: { type: Number, default: 0, min: 0 },
    net: { type: Number, default: 0, min: 0 },
    paidOut: { type: Boolean, default: false },
    at: { type: Date, default: Date.now, index: true }
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

marketSaleSchema.index({ seller: 1, at: -1 });

module.exports = mongoose.model('MarketSale', marketSaleSchema);
