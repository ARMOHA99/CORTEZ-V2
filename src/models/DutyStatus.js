const mongoose = require('mongoose');

/* رسالة حالة الدوام الحيّة في ديسكورد — نحدّثها تلقائيًا كل دقيقة */
const dutyStatusSchema = new mongoose.Schema(
  {
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
    guildId: { type: String, default: '' },
    lastRefreshAt: { type: Date, default: null },
    failedCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

dutyStatusSchema.index({ channelId: 1 }, { unique: true });

module.exports = mongoose.model('DutyStatus', dutyStatusSchema);
