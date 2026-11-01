const mongoose = require('mongoose');

const rankSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    short: { type: String, default: '', trim: true, maxlength: 20 },
    level: { type: Number, required: true, min: 0, max: 1000, index: true },
    color: { type: String, default: '#e63946', match: /^#[0-9a-fA-F]{6}$/ },
    icon: { type: String, default: '◆', maxlength: 8 },
    permissions: { type: [String], default: [] },
    discordRoleId: { type: String, default: '' },
    discordRoleName: { type: String, default: '', maxlength: 100 },
    isSystem: { type: Boolean, default: false },
    order: { type: Number, default: 100 },
    description: { type: String, default: '', maxlength: 300 }
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

rankSchema.index({ level: -1 });

module.exports = mongoose.model('Rank', rankSchema);
