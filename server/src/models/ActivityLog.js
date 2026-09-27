const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
    action: { type: String, required: true },
    entity: {
      kind: { type: String },
      id: { type: mongoose.Schema.Types.ObjectId },
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false, collection: 'activitylogs' }
);

ActivityLogSchema.index({ actor: 1, timestamp: -1 });
ActivityLogSchema.index({ 'entity.kind': 1, 'entity.id': 1 });

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
