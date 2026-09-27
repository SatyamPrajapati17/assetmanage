const mongoose = require('mongoose');

const MaintenanceRequestSchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    issueDescription: { type: String, required: true },
    priority: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium', index: true },
    photo: { type: String, default: null },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'TechnicianAssigned', 'InProgress', 'Resolved'],
      default: 'Pending',
      index: true,
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: null },
    technician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    technicianName: { type: String, default: null }, // external technician fallback
    resolutionNotes: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'maintenancerequests' }
);

MaintenanceRequestSchema.index({ asset: 1, status: 1 });
MaintenanceRequestSchema.index({ status: 1, priority: 1 });

module.exports = mongoose.model('MaintenanceRequest', MaintenanceRequestSchema);
