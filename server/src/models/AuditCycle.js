const mongoose = require('mongoose');

const AuditCycleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    scope: {
      departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true }],
      locations: [{ type: String }],
    },
    dateRange: {
      start: { type: Date },
      end: { type: Date },
    },
    auditors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    status: { type: String, enum: ['Planned', 'Active', 'Closed'], default: 'Planned', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'auditcycles' }
);

AuditCycleSchema.index({ 'scope.departments': 1 });

module.exports = mongoose.model('AuditCycle', AuditCycleSchema);
