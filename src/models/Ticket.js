const mongoose = require('mongoose');

const approvalSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    byName: { type: String, default: '' },
    decision: { type: String, enum: ['approve', 'reject'], required: true },
    note: { type: String, default: '', maxlength: 400 },
    at: { type: Date, default: Date.now }
  },
  { _id: true }
);

const ticketSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userSnapshot: {
      name: { type: String, default: '' },
      rank: { type: String, default: '' }
    },
    type: { type: String, enum: ['leave', 'promotion', 'complaint'], required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 2500 },
    metadata: {
      from: { type: Date, default: null },
      to: { type: Date, default: null },
      targetRank: { type: String, default: '' },
      against: { type: String, default: '' }
    },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    approvals: { type: [approvalSchema], default: [] },
    requiredApprovals: { type: Number, default: 1, min: 1, max: 5 },
    closedAt: { type: Date, default: null },
    closedByName: { type: String, default: '' }
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

ticketSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Ticket', ticketSchema);
