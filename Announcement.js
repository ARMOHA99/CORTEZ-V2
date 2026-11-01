const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 2500 },
    severity: { type: String, enum: ['normal', 'urgent', 'critical'], default: 'normal', index: true },
    active: { type: Boolean, default: true, index: true },
    pinned: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '' },
    expiresAt: { type: Date, default: null },
    discordSynced: { type: Boolean, default: false }
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

announcementSchema.index({ active: 1, pinned: -1, createdAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
