const mongoose = require('mongoose');

const AuditItemSchema = new mongoose.Schema(
  {
    auditCycle: { type: mongoose.Schema.Types.ObjectId, ref: 'AuditCycle', required: true, index: true },
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    result: {
      type: String,
      enum: ['Pending', 'Verified', 'Missing', 'Damaged'],
      default: 'Pending',
    },
    note: { type: String, default: null },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    markedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'audititems' }
);

AuditItemSchema.index({ auditCycle: 1, result: 1 });
AuditItemSchema.index({ auditCycle: 1, asset: 1 }, { unique: true });

module.exports = mongoose.model('AuditItem', AuditItemSchema);
