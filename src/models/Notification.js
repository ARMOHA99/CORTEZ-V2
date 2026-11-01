const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, maxlength: 160 },
    body: { type: String, default: '', maxlength: 600 },
    type: { type: String, enum: ['info', 'success', 'warning', 'danger', 'system'], default: 'info' },
    link: { type: String, default: '', maxlength: 200 },
    read: { type: Boolean, default: false, index: true },
    createdAt: { type: Date, default: Date.now, index: true }
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

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
