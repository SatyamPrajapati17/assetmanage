const mongoose = require('mongoose');

const AssetSchema = new mongoose.Schema(
  {
    assetTag: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetCategory', required: true, index: true },
    serialNumber: { type: String, unique: true, sparse: true, trim: true },
    qrCode: { type: String },
    acquisitionDate: { type: Date },
    acquisitionCost: { type: Number, min: 0 },
    condition: {
      type: String,
      enum: ['New', 'Good', 'Fair', 'Poor', 'Damaged'],
      default: 'New',
    },
    location: { type: String, index: true, trim: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true, default: null },
    photos: [{ type: String }],
    documents: [{ type: String }],
    isBookable: { type: Boolean, default: false, index: true },
    status: {
      type: String,
      enum: ['Available', 'Allocated', 'Reserved', 'Under Maintenance', 'Lost', 'Retired', 'Disposed'],
      default: 'Available',
      index: true,
    },
    preMaintenanceStatus: { type: String, default: null },
    currentAllocation: { type: mongoose.Schema.Types.ObjectId, ref: 'Allocation', default: null },
    customFieldValues: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'assets' }
);

AssetSchema.index({ name: 'text', assetTag: 'text', serialNumber: 'text' });

/** Allowed lifecycle transitions (Backend Schema §4) — enforced in service layer too. */
const ALLOWED_TRANSITIONS = {
  Available: ['Allocated', 'Reserved', 'Under Maintenance', 'Retired'],
  Allocated: ['Available', 'Under Maintenance'],
  Reserved: ['Available', 'Allocated'],
  'Under Maintenance': ['Available', 'Lost', 'Retired'],
  Lost: ['Available', 'Disposed'],
  Retired: ['Disposed'],
  Disposed: [],
};

function canTransition(from, to) {
  return Boolean(ALLOWED_TRANSITIONS[from] && ALLOWED_TRANSITIONS[from].includes(to));
}

AssetSchema.statics.canTransition = canTransition;
AssetSchema.statics.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;

module.exports = mongoose.model('Asset', AssetSchema);
