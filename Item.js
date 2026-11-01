const mongoose = require('mongoose');

/* كتالوج الأيتمات: يضع البزنس مانجر أسعارها، وتُستخدم في حساب العمليات (غنائم / مفقودات) */
const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120, unique: true },
    category: { type: String, default: 'عام', trim: true, maxlength: 60 },
    price: { type: Number, default: 0, min: 0, max: 1000000000 },
    note: { type: String, default: '', maxlength: 300 },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    updatedByName: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Item', itemSchema);
