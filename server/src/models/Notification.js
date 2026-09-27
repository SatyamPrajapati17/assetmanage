const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'AssetAssigned',
        'MaintenanceApproved',
        'MaintenanceRejected',
        'BookingConfirmed',
        'BookingCancelled',
        'BookingReminder',
        'TransferApproved',
        'OverdueReturn',
        'AuditDiscrepancy',
      ],
    },
    message: { type: String, required: true },
    relatedEntity: {
      kind: { type: String },
      id: { type: mongoose.Schema.Types.ObjectId },
    },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'notifications' }
);

NotificationSchema.index({ user: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
