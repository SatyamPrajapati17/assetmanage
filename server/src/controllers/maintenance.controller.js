const mongoose = require('mongoose');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const { runInTransaction, opts } = require('../utils/tx');
const { ok, asyncHandler } = require('../middleware/errorHandler');
const { logActivity, notifyUser } = require('../utils/activity');
const { resolveAssetParam } = require('../utils/helpers');

/**
 * Maintenance state machine (TRD §4.3 / App_Flow §5):
 * Pending → Approved → TechnicianAssigned → InProgress → Resolved
 * Pending → Rejected (terminal)
 * On Approved: asset → 'Under Maintenance' (preMaintenanceStatus stored).
 * On Resolved: asset → preMaintenanceStatus (restored) or 'Available'.
 */

const NEXT_STATE = {
  Approved: 'TechnicianAssigned',
  TechnicianAssigned: 'InProgress',
  InProgress: 'Resolved',
};

/** Shared core: create a maintenance request for an asset. */
async function createRequest({ asset, raisedBy, issueDescription, priority, photo }) {
  const MaintenanceRequest = mongoose.model('MaintenanceRequest');
  const request = await MaintenanceRequest.create({
    asset: asset._id,
    raisedBy,
    issueDescription,
    priority: priority || 'Medium',
    photo: photo || null,
    status: 'Pending',
  });
  logActivity({
    actor: raisedBy,
    action: 'MAINTENANCE_REQUESTED',
    entity: { kind: 'MaintenanceRequest', id: request._id },
    metadata: { assetTag: asset.assetTag, priority: request.priority },
  });
  return request;
}

/** POST /maintenance — body: { assetId, issueDescription, priority, photo } */
const create = asyncHandler(async (req, res) => {
  const { assetId, issueDescription, priority, photo } = req.body;
  const Asset = mongoose.model('Asset');
  const asset = await Asset.findById(assetId);
  if (!asset) throw new NotFoundError('Asset not found');
  if (!issueDescription || issueDescription.trim().length < 5) {
    throw new ValidationError('Issue description must be at least 5 characters');
  }
  if (['Retired', 'Disposed'].includes(asset.status)) {
    throw new ValidationError(`Cannot raise maintenance on a ${asset.status.toLowerCase()} asset`);
  }
  const request = await createRequest({ asset, raisedBy: req.user.id, issueDescription, priority, photo });
  return ok(res, { request }, 'Maintenance request raised', 201);
});

/** POST /assets/:id/maintenance — same, asset resolved from path param. */
const createForAsset = asyncHandler(async (req, res) => {
  const { issueDescription, priority, photo } = req.body;
  const asset = await resolveAssetParam(req.params.id);
  if (!issueDescription || issueDescription.trim().length < 5) {
    throw new ValidationError('Issue description must be at least 5 characters');
  }
  if (['Retired', 'Disposed'].includes(asset.status)) {
    throw new ValidationError(`Cannot raise maintenance on a ${asset.status.toLowerCase()} asset`);
  }
  const request = await createRequest({ asset, raisedBy: req.user.id, issueDescription, priority, photo });
  return ok(res, { request }, 'Maintenance request raised', 201);
});

/** GET /maintenance — list with filters (asset, status, priority, mine). */
const list = asyncHandler(async (req, res) => {
  const MaintenanceRequest = mongoose.model('MaintenanceRequest');
  const { page = 1, limit = 50, status, priority, asset, mine } = req.query;
  const filter = {};
  if (status) filter.status = { $in: status.split(',').map((s) => s.trim()) };
  if (priority) filter.priority = priority;
  if (asset) filter.asset = asset;
  if (mine === 'true') filter.raisedBy = req.user.id;

  const [items, total] = await Promise.all([
    MaintenanceRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .populate('asset', 'name assetTag status location')
      .populate('raisedBy', 'name email')
      .populate('approvedBy', 'name')
      .populate('technician', 'name'),
    MaintenanceRequest.countDocuments(filter),
  ]);
  return ok(res, { items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) || 1 });
});

/** GET /maintenance/:id */
const getOne = asyncHandler(async (req, res) => {
  const MaintenanceRequest = mongoose.model('MaintenanceRequest');
  const request = await MaintenanceRequest.findById(req.params.id)
    .populate('asset', 'name assetTag status location')
    .populate('raisedBy', 'name email')
    .populate('approvedBy', 'name')
    .populate('technician', 'name email');
  if (!request) throw new NotFoundError('Maintenance request not found');
  return ok(res, { request });
});

/** POST /maintenance/:id/approve (Asset Manager/Admin) — asset flips to Under Maintenance. */
const approve = asyncHandler(async (req, res) => {
  const MaintenanceRequest = mongoose.model('MaintenanceRequest');
  const request = await MaintenanceRequest.findById(req.params.id);
  if (!request) throw new NotFoundError('Maintenance request not found');
  if (request.status !== 'Pending') {
    throw new ValidationError(`Request is ${request.status}, not Pending`);
  }

  await runInTransaction(async (session) => {
    const Asset = mongoose.model('Asset');
    const asset = await Asset.findOne({ _id: request.asset }).session(session);
    if (!asset) throw new NotFoundError('Asset not found');

    // Guarded transition — don't clobber an asset that's mid-transfer/allocated.
    // Store the status we should restore after resolution (TRD §4.3).
    asset.preMaintenanceStatus = asset.status;
    if (asset.status !== 'Under Maintenance') {
      asset.status = 'Under Maintenance';
    }
    await asset.save(opts(session));

    request.status = 'Approved';
    request.approvedBy = req.user.id;
    await request.save(opts(session));
  });

  notifyUser({
    user: request.raisedBy,
    type: 'MaintenanceApproved',
    message: `Your maintenance request for ${request.asset.assetTag || 'asset'} was approved`,
    relatedEntity: { kind: 'MaintenanceRequest', id: request._id },
  });
  logActivity({
    actor: req.user.id,
    action: 'MAINTENANCE_APPROVED',
    entity: { kind: 'MaintenanceRequest', id: request._id },
  });

  const populated = await MaintenanceRequest.findById(request._id)
    .populate('asset', 'name assetTag status')
    .populate('approvedBy', 'name');
  return ok(res, { request: populated }, 'Approved — asset is now Under Maintenance');
});

/** POST /maintenance/:id/reject (Asset Manager/Admin) — terminal. */
const reject = asyncHandler(async (req, res) => {
  const MaintenanceRequest = mongoose.model('MaintenanceRequest');
  const request = await MaintenanceRequest.findById(req.params.id);
  if (!request) throw new NotFoundError('Maintenance request not found');
  if (request.status !== 'Pending') {
    throw new ValidationError(`Request is ${request.status}, not Pending`);
  }
  request.status = 'Rejected';
  request.rejectionReason = req.body.rejectionReason || null;
  request.approvedBy = req.user.id;
  await request.save();

  notifyUser({
    user: request.raisedBy,
    type: 'MaintenanceRejected',
    message: `Your maintenance request was rejected${request.rejectionReason ? `: ${request.rejectionReason}` : ''}`,
    relatedEntity: { kind: 'MaintenanceRequest', id: request._id },
  });
  logActivity({
    actor: req.user.id,
    action: 'MAINTENANCE_REJECTED',
    entity: { kind: 'MaintenanceRequest', id: request._id },
    metadata: { reason: request.rejectionReason },
  });

  return ok(res, { request }, 'Request rejected');
});

/** POST /maintenance/:id/assign — technician can be a user id or a plain name. */
const assignTechnician = asyncHandler(async (req, res) => {
  const MaintenanceRequest = mongoose.model('MaintenanceRequest');
  const request = await MaintenanceRequest.findById(req.params.id);
  if (!request) throw new NotFoundError('Maintenance request not found');
  if (request.status !== 'Approved') {
    throw new ValidationError(`Request is ${request.status} — only Approved requests can get a technician`);
  }
  const { technicianId, technicianName } = req.body;
  if (!technicianId && !technicianName) {
    throw new ValidationError('Provide technicianId (existing user) or technicianName (external)');
  }
  request.technician = technicianId || null;
  request.technicianName = technicianName || null;
  request.status = 'TechnicianAssigned';
  await request.save();

  logActivity({
    actor: req.user.id,
    action: 'MAINTENANCE_TECHNICIAN_ASSIGNED',
    entity: { kind: 'MaintenanceRequest', id: request._id },
    metadata: { technicianId, technicianName },
  });
  return ok(res, { request }, 'Technician assigned');
});

/** POST /maintenance/:id/advance — TechnicianAssigned → InProgress → Resolved. */
const advance = asyncHandler(async (req, res) => {
  const MaintenanceRequest = mongoose.model('MaintenanceRequest');
  const request = await MaintenanceRequest.findById(req.params.id);
  if (!request) throw new NotFoundError('Maintenance request not found');

  const next = NEXT_STATE[request.status];
  if (!next) {
    throw new ValidationError(`Cannot advance a ${request.status} request`);
  }

  // Permission: Asset Manager/Admin can advance always; an assigned technician user can advance own.
  const isManager = ['admin', 'assetManager'].includes(req.user.role);
  const isAssignedTech = request.technician && String(request.technician) === String(req.user.id);
  if (!isManager && !isAssignedTech) {
    throw new ForbiddenError('Only an Asset Manager or the assigned technician can advance this request');
  }

  if (next === 'InProgress') {
    request.status = 'InProgress';
  } else {
    // → Resolved: restore asset status per TRD §4.3.
    await runInTransaction(async (session) => {
      const Asset = mongoose.model('Asset');
      const asset = await Asset.findOne({ _id: request.asset }).session(session);
      if (!asset) throw new NotFoundError('Asset not found');
      const restoreTo =
        asset.preMaintenanceStatus && ['Available', 'Allocated', 'Reserved'].includes(asset.preMaintenanceStatus)
          ? asset.preMaintenanceStatus
          : 'Available';
      asset.status = restoreTo;
      asset.preMaintenanceStatus = null;
      await asset.save(opts(session));

      request.status = 'Resolved';
      request.resolutionNotes = req.body.resolutionNotes || null;
      request.resolvedAt = new Date();
      await request.save(opts(session));
    });
  }

  logActivity({
    actor: req.user.id,
    action: next === 'Resolved' ? 'MAINTENANCE_RESOLVED' : 'MAINTENANCE_STARTED',
    entity: { kind: 'MaintenanceRequest', id: request._id },
  });

  const populated = await MaintenanceRequest.findById(request._id)
    .populate('asset', 'name assetTag status')
    .populate('technician', 'name');
  return ok(res, { request: populated }, next === 'Resolved' ? 'Resolved — asset restored' : `Status → ${next}`);
});

module.exports = { create, createForAsset, list, getOne, approve, reject, assignTechnician, advance };
