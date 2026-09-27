const mongoose = require('mongoose');

const AssetCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    customFields: [
      {
        key: { type: String, required: true, trim: true },
        label: { type: String, required: true, trim: true },
        type: { type: String, enum: ['text', 'number', 'date', 'boolean'], default: 'text' },
      },
    ],
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true, collection: 'assetcategories' }
);

module.exports = mongoose.model('AssetCategory', AssetCategorySchema);
