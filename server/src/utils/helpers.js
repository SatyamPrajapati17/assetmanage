const mongoose = require('mongoose');
const { NotFoundError, ForbiddenError } = require('../utils/errors');

/**
 * Resolves an entity reference that may be an ObjectId, an assetTag ("AF-0114"),
 * or a QR code value. Used by /assets/:idOrTag routes.
 */
async function resolveAssetParam(idOrTag) {
  const Asset = mongoose.model('Asset');
  let asset = null;
  if (/^[0-9a-fA-F]{24}$/.test(idOrTag)) {
    asset = await Asset.findById(idOrTag);
  }
  if (!asset) asset = await Asset.findOne({ assetTag: idOrTag.toUpperCase() });
  if (!asset) asset = await Asset.findOne({ qrCode: idOrTag });
  if (!asset) throw new NotFoundError('Asset not found');
  return asset;
}

/** Throws unless the user's role is in the allow-list. */
function assertRole(user, roles) {
  if (!user || !roles.includes(user.role)) {
    throw new ForbiddenError('Your role does not permit this action');
  }
}

/** Department Head scope: user must belong to the given department. */
function assertInDepartment(user, departmentId) {
  if (['admin', 'assetManager'].includes(user.role)) return;
  if (String(user.department || '') !== String(departmentId || '')) {
    throw new ForbiddenError('This action is outside your department scope');
  }
}

/** Role rank used for hierarchy checks (employee < departmentHead < assetManager < admin). */
const ROLE_RANK = { employee: 0, departmentHead: 1, assetManager: 2, admin: 3 };

module.exports = { resolveAssetParam, assertRole, assertInDepartment, ROLE_RANK };
