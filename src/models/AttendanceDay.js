const mongoose = require('mongoose');

/* تبرير الغياب: العضو يقدّمه خلال نافذة محددة، والإدارة تعتمده أو ترفضه */
const justificationSchema = new mongoose.Schema(
  {
    text: { type: String, default: '', maxlength: 1000 },
    submittedAt: { type: Date, default: null },
    status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByName: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    note: { type: String, default: '', maxlength: 600 }
  },
  { _id: false }
);

/*
 * يوم حضور واحد لكل عضو: مصدر الحقيقة لتقرير الغياب والإنذارات.
 * status: present حضر، absent غاب، excused غياب مقبول بعذر، leave إجازة، exempt معفى بالرتبة.
 */
const attendanceDaySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userSnapshot: {
      name: { type: String, default: '' },
      rank: { type: String, default: '' },
      discordId: { type: String, default: '' }
    },
    dateKey: { type: String, required: true, index: true },
    weekKey: { type: String, default: '', index: true },
    status: {
      type: String,
      enum: ['present', 'absent', 'excused', 'leave', 'exempt', 'pending'],
      default: 'pending',
      index: true
    },
    minutes: { type: Number, default: 0, min: 0 },
    shifts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Shift' }],
    source: { type: String, enum: ['auto', 'manual', 'justification'], default: 'auto' },
    streak: { type: Number, default: 0 },
    warning: { type: mongoose.Schema.Types.ObjectId, ref: 'Warning', default: null },
    justification: { type: justificationSchema, default: () => ({}) },
    note: { type: String, default: '', maxlength: 400 },
    /* وقت إرسال ملاحظة الغياب في غرفة الملاحظات — يمنع التكرار */
    notifiedAt: { type: Date, default: null },
    /* وقت تصعيد العضو للقيادة بعد استنفاد الإنذارات */
    escalatedAt: { type: Date, default: null },
    evaluatedAt: { type: Date, default: Date.now }
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

attendanceDaySchema.index({ user: 1, dateKey: 1 }, { unique: true });
attendanceDaySchema.index({ dateKey: 1, status: 1 });

module.exports = mongoose.model('AttendanceDay', attendanceDaySchema);
