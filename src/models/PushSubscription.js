const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true, maxlength: 700 },
    keys: {
      p256dh: { type: String, default: '', maxlength: 300 },
      auth: { type: String, default: '', maxlength: 200 }
    },
    userAgent: { type: String, default: '', maxlength: 300 },
    lastSeen: { type: Date, default: Date.now },
    failCount: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

pushSubscriptionSchema.index({ user: 1, updatedAt: -1 });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
