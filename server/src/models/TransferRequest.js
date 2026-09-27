const mongoose = require('mongoose');

const targetSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Employee', 'Department'], required: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  },
  { _id: false }
);

const TransferRequestSchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    fromAllocation: { type: mongoose.Schema.Types.ObjectId, ref: 'Allocation', default: null },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedTo: { type: targetSchema, required: true },
    reason: { type: String, default: null },
    status: {
      type: String,
      enum: ['Requested', 'Approved', 'Rejected', 'Completed'],
      default: 'Requested',
      index: true,
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'transferrequests' }
);

TransferRequestSchema.index({ asset: 1, status: 1 });
TransferRequestSchema.index({ requestedBy: 1 });

module.exports = mongoose.model('TransferRequest', TransferRequestSchema);
