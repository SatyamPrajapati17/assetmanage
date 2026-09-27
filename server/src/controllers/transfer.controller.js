const mongoose = require('mongoose');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { runInTransaction, opts } = require('../utils/tx');
const { ok, asyncHandler } = require('../middleware/errorHandler');
const { logActivity, notifyUser } = require('../utils/activity');
const allocationService = require('../services/allocationService');

/**
 * Transfer workflow (App_Flow §2):
 * Requested → Approved → old Allocation TransferredOut → new Allocation Active
 *           → asset stays Allocated with currentAllocation updated → Completed.
 */

/** POST /transfer-requests — request an already-allocated asset. */
const create = asyncHandler(async (req, res) => {
  const TransferRequest = mongoose.model('TransferRequest');
  const Asset = mongoose.model('Asset');
  const { assetId, requestedTo, reason } = req.body;

  const asset = await Asset.findById(assetId);
  if (!asset) throw new NotFoundError('Asset not found');
  if (!['Allocated', 'Reserved'].includes(asset.status)) {
    throw new ValidationError('Only allocated/reserved assets can be transfer-requested');
  }
  if (!requestedTo || !['Employee', 'Department'].includes(requestedTo.type)) {
    throw new ValidationError('requestedTo.type must be Employee or Department');
  }
  if (requestedTo.type === 'Employee' && !requestedTo.employee) {
    throw new ValidationError('requestedTo.employee is required');
  }
  if (requestedTo.type === 'Department' && !requestedTo.department) {
    throw new ValidationError('requestedTo.department is required');
  }

  const currentAllocation = asset.currentAllocation;
  const transfer = await TransferRequest.create({
    asset: asset._id,
    fromAllocation: currentAllocation,
    requestedBy: req.user.id,
    requestedTo,
    reason: reason || null,
    status: 'Requested',
  });

  logActivity({
    actor: req.user.id,
    action: 'TRANSFER_REQUESTED',
    entity: { kind: 'TransferRequest', id: transfer._id },
    metadata: { assetTag: asset.assetTag },
  });

  // Notify approvers: Asset Managers + department head of the target department.
  const User = mongoose.model('User');
  const approverFilter = { role: { $in: ['assetManager', 'admin'] }, status: 'Active' };
  if (requestedTo.type === 'Employee') {
    const targetUser = await User.findById(requestedTo.employee);
    if (targetUser && targetUser.department) approverFilter.department = targetUser.department;
  }
  const approvers = await User.find(approverFilter).select('_id');
  approvers.forEach((a) =>
    notifyUser({
      user: a._id,
      type: 'TransferApproved', // notification type enum is shared for transfer events
      message: `New transfer request for ${asset.assetTag} (${asset.name}) awaiting approval`,
      relatedEntity: { kind: 'TransferRequest', id: transfer._id },
    })
  );

  return ok(res, { transfer }, 'Transfer request submitted', 201);
});

/** GET /transfer-requests — list with status filter + role scoping. */
const list = asyncHandler(async (req, res) => {
  const TransferRequest = mongoose.model('TransferRequest');
  const { page = 1, limit = 50, status } = req.query;
  const filter = {};
  if (status) filter.status = { $in: status.split(',').map((s) => s.trim()) };

  if (req.user.role === 'employee') {
    filter.requestedBy = req.user.id;
  } else if (req.user.role === 'departmentHead') {
    filter.$or = [{ requestedBy: req.user.id }, { 'requestedTo.employee': req.user.id }];
    // Note: department-scope refinement could match targets in the head's dept.
  }

  const [items, total] = await Promise.all([
    TransferRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .populate('asset', 'name assetTag status')
      .populate('requestedBy', 'name email')
      .populate('requestedTo.employee', 'name email')
      .populate('requestedTo.department', 'name'),
    TransferRequest.countDocuments(filter),
  ]);
  return ok(res, { items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) || 1 });
});

/**
 * POST /transfer-requests/:id/approve — atomic re-allocation:
 * close old allocation + open new one + keep asset Allocated, all in one
 * transaction with the status guard from allocationService.
 */
const approve = asyncHandler(async (req, res) => {
  const TransferRequest = mongoose.model('TransferRequest');
  const transfer = await TransferRequest.findById(req.params.id);
  if (!transfer) throw new NotFoundError('Transfer request not found');
  if (transfer.status !== 'Requested') {
    throw new ValidationError(`Transfer is ${transfer.status}, not Requested`);
  }

  const Asset = mongoose.model('Asset');
  const asset = await Asset.findById(transfer.asset);
  if (!asset) throw new NotFoundError('Asset not found');

  await runInTransaction(async (session) => {
    // 1. Close old allocation (TransferredOut).
    const Allocation = mongoose.model('Allocation');
    if (transfer.fromAllocation) {
      await Allocation.updateOne(
        { _id: transfer.fromAllocation, status: 'Active' },
        { $set: { status: 'TransferredOut' } },
        opts(session)
      );
    }

    // 2. Open the new allocation (asset stays Allocated; guarded filter allows
    //    Allocated/Reserved only, so a concurrent return can't slip through).
    await allocationService.allocateAsset({
      assetIdOrDoc: asset._id,
      allocatedTo: transfer.requestedTo,
      allocatedBy: req.user.id,
      requireAvailable: false,
      session,
    });

    // 3. Mark transfer Completed.
    transfer.status = 'Completed';
    transfer.approvedBy = req.user.id;
    transfer.approvedAt = new Date();
    await transfer.save(opts(session));
  });

  notifyUser({
    user: transfer.requestedBy,
    type: 'TransferApproved',
    message: `Transfer approved — ${asset.assetTag} (${asset.name}) re-allocated`,
    relatedEntity: { kind: 'TransferRequest', id: transfer._id },
  });
  logActivity({
    actor: req.user.id,
    action: 'TRANSFER_APPROVED',
    entity: { kind: 'TransferRequest', id: transfer._id },
    metadata: { assetTag: asset.assetTag },
  });

  const populated = await TransferRequest.findById(transfer._id)
    .populate('asset', 'name assetTag status')
    .populate('requestedTo.employee', 'name')
    .populate('requestedTo.department', 'name')
    .populate('approvedBy', 'name');
  return ok(res, { transfer: populated }, 'Transfer approved — asset re-allocated');
});

/** POST /transfer-requests/:id/reject */
const reject = asyncHandler(async (req, res) => {
  const TransferRequest = mongoose.model('TransferRequest');
  const transfer = await TransferRequest.findById(req.params.id);
  if (!transfer) throw new NotFoundError('Transfer request not found');
  if (transfer.status !== 'Requested') {
    throw new ValidationError(`Transfer is ${transfer.status}, not Requested`);
  }
  transfer.status = 'Rejected';
  transfer.approvedBy = req.user.id;
  transfer.approvedAt = new Date();
  await transfer.save();

  logActivity({
    actor: req.user.id,
    action: 'TRANSFER_REJECTED',
    entity: { kind: 'TransferRequest', id: transfer._id },
  });

  return ok(res, { transfer }, 'Transfer request rejected');
});

module.exports = { create, list, approve, reject };
