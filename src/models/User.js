const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    qty: { type: Number, default: 1, min: 0 },
    note: { type: String, default: '', maxlength: 300 },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    addedAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    discordId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: '', trim: true },
    displayName: { type: String, default: '', trim: true },
    globalName: { type: String, default: '', trim: true },
    avatar: { type: String, default: '' },
    discriminator: { type: String, default: '0' },
    roles: { type: [String], default: [] },
    rank: { type: String, default: 'guest', index: true },
    rankAssignedAt: { type: Date, default: null },
    inGuild: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    blocked: { type: Boolean, default: false, index: true },
    blockReason: { type: String, default: '', maxlength: 400 },
    sessionInvalid: { type: Boolean, default: false },
    joinedGuildAt: { type: Date, default: null },
    lastLogin: { type: Date, default: null },
    lastSeen: { type: Date, default: null },
    duty: {
      status: { type: String, enum: ['off', 'on', 'break'], default: 'off' },
      shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
      since: { type: Date, default: null }
    },
    stats: {
      totalMinutes: { type: Number, default: 0 },
      totalPenaltyMinutes: { type: Number, default: 0 },
      operations: { type: Number, default: 0 },
      wins: { type: Number, default: 0 },
      losses: { type: Number, default: 0 },
      warnings: { type: Number, default: 0 },
      fines: { type: Number, default: 0 },
      totalFines: { type: Number, default: 0 }
    },
    inventory: { type: [inventoryItemSchema], default: [] },
    bloodPact: {
      signed: { type: Boolean, default: false },
      version: { type: Number, default: 0 },
      signedAt: { type: Date, default: null },
      signatureId: { type: mongoose.Schema.Types.ObjectId, ref: 'PactSignature', default: null }
    },
    preferences: {
      sound: { type: Boolean, default: true },
      language: { type: String, default: 'ar' }
    },
    notes: { type: String, default: '', maxlength: 1000 }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        delete ret.sessionInvalid;
        return ret;
      }
    }
  }
);

userSchema.index({ rank: 1, blocked: 1 });
userSchema.index({ displayName: 'text', username: 'text', globalName: 'text' });

userSchema.virtual('avatarUrl').get(function avatarUrl() {
  if (!this.avatar) return '';
  const ext = this.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${this.discordId}/${this.avatar}.${ext}?size=256`;
});

userSchema.virtual('name').get(function name() {
  return this.displayName || this.globalName || this.username || 'عضو';
});

module.exports = mongoose.model('User', userSchema);
