const mongoose = require('mongoose');
const { ConflictError, NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const { runInTransaction, opts } = require('../utils/tx');
const { logActivity, notifyUser } = require('../utils/activity');
const { assertRole, resolveAssetParam } = require('../utils/helpers');

/**
 * Allocation service — implements TRD §4.1 (no double-allocation).
 *
 * Atomicity strategy (defense in depth):
 *  1. Everything runs in a Mongo transaction when available (replica set / Atlas).
 *  2. The status flip uses findOneAndUpdate with a status guard
 *     ({ _id, status: 'Available' }) so matchedCount === 0 ⇒ conflict, even
 *     without transactions (safe on standalone mongod).
 */

/** Returns display info about the current holder of an asset (for the conflict banner). */
async function currentHolderInfo(asset) {
  if (!asset.currentAllocation) return null;
  const Allocation = mongoose.model('Allocation');
  const allocation = await Allocation.findById(asset.currentAllocation).populate(
    'allocatedTo.employee',
    'name email'
  );
  if (!allocation) return null;
  const t = allocation.allocatedTo || {};
  if (t.type === 'Employee' && t.employee) {
    const e = t.employee;
    return {
      kind: 'Employee',
      name: typeof e === 'object' ? e.name : 'Unknown',
      email: typeof e === 'object' ? e.email : undefined,
      allocationId: String(allocation._id),
      allocationDate: allocation.allocationDate,
    };
  }
  if (t.type === 'Department' && t.department) {
    const Department = mongoose.model('Department');
    const dept =
      typeof t.department === 'object' ? t.department : await Department.findById(t.department);
    return {
      kind: 'Department',
      name: dept ? dept.name : 'Unknown department',
      allocationId: String(allocation._id),
      allocationDate: allocation.allocationDate,
    };
  }
  return null;
}

function validateHolder(allocatedTo) {
  if (!allocatedTo || !['Employee', 'Department'].includes(allocatedTo.type)) {
    throw new ValidationError('allocatedTo.type must be Employee or Department');
  }
  if (allocatedTo.type === 'Employee' && !allocatedTo.employee) {
    throw new ValidationError('allocatedTo.employee is required for Employee allocation');
  }
  if (allocatedTo.type === 'Department' && !allocatedTo.department) {
    throw new ValidationError('allocatedTo.department is required for Department allocation');
  }
}

/**
 * Core allocation routine.
 *  - Fresh allocation: guarded findOneAndUpdate Available → Allocated; conflict
 *    (matchedCount === 0) throws 409 with the current holder populated.
 *  - Transfer path (requireAvailable=false): the guard accepts Allocated/Reserved;
 *    used by transferService which closes the old allocation in the same transaction.
 */
async function allocateAsset({
  assetIdOrDoc,
  allocatedTo,
  allocatedBy,
  expectedReturnDate,
  requireAvailable = true,
  session: existingSession,
}) {
  const Asset = mongoose.model('Asset');
  const Allocation = mongoose.model('Allocation');

  const run = async (session) => {
    const id = typeof assetIdOrDoc === 'object' ? assetIdOrDoc._id : assetIdOrDoc;
    const filter = requireAvailable
      ? { _id: id, status: 'Available' }
      : { _id: id, status: { $in: ['Allocated', 'Reserved'] } };

    // Setting status again is idempotent and keeps the update non-empty for both paths.
    const asset = await Asset.findOneAndUpdate(
      filter,
      { $set: { status: 'Allocated' } },
      opts(session, { new: true })
    );

    if (!asset) {
      const live = await Asset.findById(id).catch(() => null);
      const holder = live ? await currentHolderInfo(live) : null;
      throw new ConflictError(
        'ASSET_ALREADY_ALLOCATED',
        live
          ? `Asset ${live.assetTag} is currently ${live.status} — allocation blocked. Use a Transfer Request instead.`
          : 'Asset is not available for allocation',
        { currentStatus: live ? live.status : undefined, currentHolder: holder }
      );
    }

    const holder = {
      type: allocatedTo.type,
      employee: allocatedTo.type === 'Employee' ? allocatedTo.employee : undefined,
      department: allocatedTo.type === 'Department' ? allocatedTo.department : undefined,
    };

    const [allocation] = await Allocation.create(
      [
        {
          asset: asset._id,
          allocatedTo: holder,
          allocatedBy,
          expectedReturnDate: expectedReturnDate || null,
          status: 'Active',
        },
      ],
      opts(session)
    );

    await Asset.updateOne(
      { _id: asset._id },
      { $set: { currentAllocation: allocation._id } },
      opts(session)
    );

    return { assetId: asset._id, allocationId: allocation._id };
  };

  const { allocationId } = existingSession
    ? await run(existingSession)
    : await runInTransaction(run);

  const allocation = await Allocation.findById(allocationId).populate([
    { path: 'allocatedTo.employee', select: 'name email' },
    { path: 'allocatedTo.department', select: 'name' },
    { path: 'allocatedBy', select: 'name' },
  ]);

  return { allocation };
}

/** HTTP entry point for POST /assets/:id/allocate */
async function allocate(req, res) {
  const { allocatedTo, expectedReturnDate } = req.body;
  validateHolder(allocatedTo);

  const asset = await resolveAssetParam(req.params.id);
  const { allocation } = await allocateAsset({
    assetIdOrDoc: asset._id,
    allocatedTo,
    allocatedBy: req.user.id,
    expectedReturnDate,
  });

  // Side effects after commit (outside the critical section).
  if (allocatedTo.type === 'Employee') {
    notifyUser({
      user: allocatedTo.employee,
      type: 'AssetAssigned',
      message: `Asset ${asset.assetTag} (${asset.name}) has been allocated to you`,
      relatedEntity: { kind: 'Asset', id: asset._id },
    });
  }
  logActivity({
    actor: req.user.id,
    action: 'ASSET_ALLOCATED',
    entity: { kind: 'Asset', id: asset._id },
    metadata: {
      allocationId: String(allocation._id),
      assetTag: asset.assetTag,
      to: allocatedTo.type === 'Employee' ? undefined : allocatedTo.department,
      employee: allocatedTo.type === 'Employee' ? allocatedTo.employee : undefined,
    },
  });

  return res.status(201).json({
    success: true,
    data: { allocation },
    message: `Asset ${asset.assetTag} allocated`,
  });
}

/** Return flow (App_Flow §3): close allocation, restore asset to Available. */
async function returnAllocation(req, res) {
  const Allocation = mongoose.model('Allocation');
  const Asset = mongoose.model('Asset');
  const { returnConditionNotes } = req.body;

  const allocation = await runInTransaction(async (session) => {
    const current = await Allocation.findById(req.params.id).session(session);
    if (!current) throw new NotFoundError('Allocation not found');
    if (current.status !== 'Active') {
      throw new ValidationError(`Allocation is ${current.status}, not Active`);
    }

    // Permission: Asset Manager/Admin, the allocator, or the holder employee.
    const isHolder =
      current.allocatedTo &&
      current.allocatedTo.type === 'Employee' &&
      String(current.allocatedTo.employee) === String(req.user.id);
    const isAllocator = String(current.allocatedBy) === String(req.user.id);
    if (!isHolder && !isAllocator && !['admin', 'assetManager'].includes(req.user.role)) {
      throw new ForbiddenError(
        'Only the holder, the allocator, or an Asset Manager can return this asset'
      );
    }

    current.status = 'Returned';
    current.actualReturnDate = new Date();
    current.returnConditionNotes = returnConditionNotes || null;
    await current.save(opts(session));

    await Asset.updateOne(
      { _id: current.asset, status: 'Allocated' },
      { $set: { status: 'Available', currentAllocation: null } },
      opts(session)
    );

    return current;
  });

  const asset = await Asset.findById(allocation.asset);
  logActivity({
    actor: req.user.id,
    action: 'ASSET_RETURNED',
    entity: { kind: 'Asset', id: allocation.asset },
    metadata: { allocationId: String(allocation._id), assetTag: asset ? asset.assetTag : undefined },
  });

  return res.json({
    success: true,
    data: { allocation },
    message: 'Asset returned — status is now Available',
  });
}

/** Asset allocation history (Asset Detail tab). */
async function allocationHistory(req, res) {
  const Allocation = mongoose.model('Allocation');
  const asset = await resolveAssetParam(req.params.id);
  const allocations = await Allocation.find({ asset: asset._id })
    .sort({ allocationDate: -1 })
    .populate('allocatedTo.employee', 'name email')
    .populate('allocatedTo.department', 'name')
    .populate('allocatedBy', 'name');
  return res.json({ success: true, data: allocations });
}

module.exports = {
  allocateAsset,
  allocate,
  returnAllocation,
  allocationHistory,
  currentHolderInfo,
  validateHolder,
};
