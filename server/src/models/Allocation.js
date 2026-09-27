const mongoose = require('mongoose');

const holderSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Employee', 'Department'], required: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  },
  { _id: false }
);

const AllocationSchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    allocatedTo: { type: holderSchema, required: true },
    allocatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    allocationDate: { type: Date, default: Date.now },
    expectedReturnDate: { type: Date, default: null },
    actualReturnDate: { type: Date, default: null },
    returnConditionNotes: { type: String, default: null },
    status: { type: String, enum: ['Active', 'Returned', 'TransferredOut'], default: 'Active', index: true },
    isOverdue: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: 'allocations' }
);

AllocationSchema.index({ asset: 1, status: 1 });
AllocationSchema.index({ 'allocatedTo.employee': 1 });
AllocationSchema.index({ 'allocatedTo.department': 1 });
AllocationSchema.index({ status: 1, expectedReturnDate: 1 });

module.exports = mongoose.model('Allocation', AllocationSchema);
