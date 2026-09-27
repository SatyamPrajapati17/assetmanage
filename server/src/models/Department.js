const mongoose = require('mongoose');

const DepartmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    head: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    parentDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true, collection: 'departments' }
);

module.exports = mongoose.model('Department', DepartmentSchema);
