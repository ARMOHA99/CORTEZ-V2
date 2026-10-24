const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    seq: { type: Number, default: 1000 }
  },
  { timestamps: true }
);

counterSchema.statics.next = async function next(key, start = 1000) {
  const counter = await this.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 }, $setOnInsert: { seq: start } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return counter.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
