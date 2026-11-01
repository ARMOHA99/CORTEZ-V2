const mongoose = require('mongoose');

/* صور مرفوعة تُحفظ في قاعدة البيانات حتى لا تضيع عند إعادة نشر Render */
const uploadSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    contentType: { type: String, required: true },
    size: { type: Number, default: 0 },
    data: { type: Buffer, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Upload', uploadSchema);
