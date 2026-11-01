const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    seq: { type: Number, default: 1000 }
  },
  { timestamps: true }
);

/**
 * يعطي الرقم التالي لمفتاح معيّن (طلب، عملية، تذكرة، تصويت).
 * ملاحظة: لا يجوز وضع seq داخل $inc و$setOnInsert في نفس التحديث، فهذا يرفضه MongoDB
 * (Updating the path 'seq' would create a conflict) — لذلك ننشئ العدّاد أولاً ثم نزيده.
 */
counterSchema.statics.next = async function next(key, start = 1000) {
  try {
    await this.updateOne({ key }, { $setOnInsert: { key, seq: start } }, { upsert: true });
  } catch (error) {
    // سباق بين طلبين يُنشئان العدّاد معاً: نتجاهل خطأ التكرار فقط
    if (!error || (error.code !== 11000 && !/E11000/.test(String(error.message || '')))) throw error;
  }
  const counter = await this.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { new: true });
  return counter.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
