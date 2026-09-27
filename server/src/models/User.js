const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['employee', 'departmentHead', 'assetManager', 'admin'],
      default: 'employee',
      index: true,
    },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true, default: null },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    passwordResetTokenHash: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },
    refreshTokenHash: { type: String, default: null },
  },
  { timestamps: true, collection: 'users' }
);

UserSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.passwordResetTokenHash;
  delete obj.refreshTokenHash;
  return obj;
};

module.exports = mongoose.model('User', UserSchema);
