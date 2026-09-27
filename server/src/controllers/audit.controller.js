const mongoose = require('mongoose');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const { runInTransaction, opts } = require('../utils/tx');
const { ok, asyncHandler } = require('../middleware/errorHandler');
const { logActivity, notifyUser } = require('../utils/activity');

/**
 * Audit lifecycle (TRD §4.4 / App_Flow §6):
 * Planned → Active (mark items Verified/Missing/Damaged) → Closed
 * On close: Missing → Asset Lost; Damaged → flagged Under Maintenance.
 */

/** POST /audits — create cycle; auto-generates in-scope AuditItems (FR-8.1/8.2). */
const create = asyncHandler(async (req, res) => {
  const AuditCycle = mongoose.model('AuditCycle');
  const AuditItem = mongoose.model('AuditItem');
  const Asset = mongoose.model('Asset');
  const Department = mongoose.model('Department');
  const User = mongoose.model('User');

  const { name, scope, dateRange, auditors } = req.body;
  if (!name || !scope) throw new ValidationError('name and scope are required');
  const hasScope = (scope.departments && scope.departments.length) || (scope.locations && scope.locations.length);
  if (!hasScope) throw new ValidationError('Scope must include at least one department or location');

  if (auditors && auditors.length) {
    const count = await User.countDocuments({ _id: { $in: auditors } });
    if (count !== auditors.length) throw new ValidationError('One or more auditors not found');
  }

  const cycle = await AuditCycle.create({
    name,
    scope: {
      departments: scope.departments || [],
      locations: scope.locations || [],
    },
    dateRange: dateRange || null,
    auditors: auditors || [],
    status: 'Planned',
    createdBy: req.user.id,
  });

  // In-scope assets: department match OR location match.
  const assetFilter = { status: { $nin: ['Disposed', 'Retired'] } };
  const or = [];
  if (scope.departments && scope.departments.length) or.push({ department: { $in: scope.departments } });
  if (scope.locations && scope.locations.length) or.push({ location: { $in: scope.locations } });
  if (or.length) assetFilter.$or = or;
  const assets = await Asset.find(assetFilter).select('_id');

  if (assets.length) {
    await AuditItem.insertMany(
      assets.map((a) => ({ auditCycle: cycle._id, asset: a._id, result: 'Pending' })),
      { ordered: false }
    );
  }

  logActivity({
    actor: req.user.id,
    action: 'AUDIT_CYCLE_CREATED',
    entity: { kind: 'AuditCycle', id: cycle._id },
    metadata: { name, inScopeAssets: assets.length },
  });

  return ok(
    res,
    { cycle, inScopeAssets: assets.length },
    `Audit cycle created with ${assets.length} in-scope asset(s)`,
    201
  );
});

/** GET /audits — list cycles with counts. */
const list = asyncHandler(async (_req, res) => {
  const AuditCycle = mongoose.model('AuditCycle');
  const AuditItem = mongoose.model('AuditItem');
  const cycles = await AuditCycle.find()
    .sort({ createdAt: -1 })
    .populate('auditors', 'name email')
    .populate('scope.departments', 'name')
    .populate('createdBy', 'name');

  const items = await Promise.all(
    cycles.map(async (c) => {
      const counts = await AuditItem.aggregate([
        { $match: { auditCycle: c._id } },
        { $group: { _id: '$result', count: { $sum: 1 } } },
      ]);
      const byResult = { Pending: 0, Verified: 0, Missing: 0, Damaged: 0 };
      counts.forEach((r) => {
        byResult[r._id] = r.count;
      });
      return { ...c.toObject(), counts: byResult, total: Object.values(byResult).reduce((a, b) => a + b, 0) };
    })
  );

  return ok(res, { items });
});

/** GET /audits/:id — cycle detail + items. */
const getOne = asyncHandler(async (req, res) => {
  const AuditCycle = mongoose.model('AuditCycle');
  const AuditItem = mongoose.model('AuditItem');
  const cycle = await AuditCycle.findById(req.params.id)
    .populate('auditors', 'name email')
    .populate('scope.departments', 'name')
    .populate('createdBy', 'name');
  if (!cycle) throw new NotFoundError('Audit cycle not found');

  const items = await AuditItem.find({ auditCycle: cycle._id })
    .populate({ path: 'asset', select: 'name assetTag status location category', populate: { path: 'category', select: 'name' } })
    .populate('markedBy', 'name');

  return ok(res, { cycle, items });
});

/** POST /audits/:id/activate — Planned → Active. */
const activate = asyncHandler(async (req, res) => {
  const AuditCycle = mongoose.model('AuditCycle');
  const cycle = await AuditCycle.findById(req.params.id);
  if (!cycle) throw new NotFoundError('Audit cycle not found');
  if (cycle.status !== 'Planned') throw new ValidationError(`Cycle is ${cycle.status}, not Planned`);
  cycle.status = 'Active';
  await cycle.save();
  logActivity({ actor: req.user.id, action: 'AUDIT_CYCLE_ACTIVATED', entity: { kind: 'AuditCycle', id: cycle._id } });
  return ok(res, { cycle }, 'Audit cycle is now Active');
});

/**
 * PATCH /audits/:id/items/:itemId — auditor marks an item.
 * Allowed while the cycle is Planned (early marks) or Active; locked when Closed.
 */
const markItem = asyncHandler(async (req, res) => {
  const AuditCycle = mongoose.model('AuditCycle');
  const AuditItem = mongoose.model('AuditItem');
  const cycle = await AuditCycle.findById(req.params.id);
  if (!cycle) throw new NotFoundError('Audit cycle not found');
  if (cycle.status === 'Closed') throw new ValidationError('This cycle is closed — marks are locked');

  const isAuditor = cycle.auditors.some((a) => String(a) === String(req.user.id));
  const isManager = ['admin', 'assetManager'].includes(req.user.role);
  if (!isAuditor && !isManager) {
    throw new ForbiddenError('Only an assigned auditor or an Asset Manager can mark audit items');
  }

  const { result, note } = req.body;
  if (!['Verified', 'Missing', 'Damaged'].includes(result)) {
    throw new ValidationError('result must be Verified, Missing or Damaged');
  }

  const item = await AuditItem.findOne({ _id: req.params.itemId, auditCycle: cycle._id });
  if (!item) throw new NotFoundError('Audit item not found in this cycle');

  item.result = result;
  item.note = note || null;
  item.markedBy = req.user.id;
  item.markedAt = new Date();
  await item.save();

  if (cycle.status === 'Planned') {
    cycle.status = 'Active'; // first mark activates the cycle
    await cycle.save();
  }

  if (['Missing', 'Damaged'].includes(result)) {
    logActivity({
      actor: req.user.id,
      action: 'AUDIT_DISCREPANCY_FLAGGED',
      entity: { kind: 'AuditItem', id: item._id },
      metadata: { result, cycle: cycle.name },
    });
  }

  return ok(res, { item }, `Marked ${result}`);
});

/** GET /audits/:id/discrepancy-report — Missing/Damaged items + export payload. */
const discrepancyReport = asyncHandler(async (req, res) => {
  const AuditItem = mongoose.model('AuditItem');
  const items = await AuditItem.find({ auditCycle: req.params.id, result: { $in: ['Missing', 'Damaged'] } })
    .populate({ path: 'asset', select: 'name assetTag status location', populate: { path: 'category', select: 'name' } })
    .populate('markedBy', 'name');

  const rows = items.map((i) => ({
    assetTag: i.asset ? i.asset.assetTag : '',
    name: i.asset ? i.asset.name : '',
    category: i.asset && i.asset.category ? i.asset.category.name : '',
    location: i.asset ? i.asset.location : '',
    result: i.result,
    note: i.note || '',
    markedBy: i.markedBy ? i.markedBy.name : '',
    markedAt: i.markedAt ? i.markedAt.toISOString() : '',
  }));

  return ok(res, { rows, csv: toCsv(rows) });
});

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}

/**
 * POST /audits/:id/close — locks the cycle and applies status updates (TRD §4.4):
 * Missing → Asset Lost · Damaged → Asset Under Maintenance.
 * `force: true` allows closing with pending marks (explicit override).
 */
const close = asyncHandler(async (req, res) => {
  const AuditCycle = mongoose.model('AuditCycle');
  const AuditItem = mongoose.model('AuditItem');
  const cycle = await AuditCycle.findById(req.params.id);
  if (!cycle) throw new NotFoundError('Audit cycle not found');
  if (cycle.status === 'Closed') throw new ValidationError('Cycle is already closed');

  const pending = await AuditItem.countDocuments({ auditCycle: cycle._id, result: 'Pending' });
  const force = Boolean(req.body && req.body.force);
  if (pending > 0 && !force) {
    throw new ValidationError(
      `${pending} item(s) still Pending — mark them or pass force:true (override checkbox) to close anyway`
    );
  }

  const discrepancyItems = await AuditItem.find({
    auditCycle: cycle._id,
    result: { $in: ['Missing', 'Damaged'] },
  });

  const updatedAssets = await runInTransaction(async (session) => {
    const Asset = mongoose.model('Asset');
    const updated = [];

    for (const item of discrepancyItems) {
      const asset = await Asset.findOne({ _id: item.asset }).session(session);
      if (!asset) continue;
      const before = asset.status;
      if (item.result === 'Missing' && asset.status !== 'Lost') {
        asset.status = 'Lost';
        await asset.save(opts(session));
      } else if (item.result === 'Damaged' && asset.status !== 'Under Maintenance') {
        asset.preMaintenanceStatus = asset.preMaintenanceStatus || asset.status;
        asset.status = 'Under Maintenance';
        await asset.save(opts(session));
      }
      updated.push({ assetId: String(asset._id), assetTag: asset.assetTag, from: before, to: asset.status });
    }

    cycle.status = 'Closed';
    cycle.closedAt = new Date();
    await cycle.save(opts(session));
    return updated;
  });

  // Notify auditors + creator about discrepancies.
  const recipients = new Set([...(cycle.auditors || []).map(String), String(cycle.createdBy || '')]);
  recipients.delete('');
  discrepancyItems.slice(0, 20).forEach((item) => {
    recipients.forEach((uid) =>
      notifyUser({
        user: uid,
        type: 'AuditDiscrepancy',
        message: `Audit "${cycle.name}": item marked ${item.result} — asset status updated`,
        relatedEntity: { kind: 'AuditItem', id: item._id },
      })
    );
  });

  logActivity({
    actor: req.user.id,
    action: 'AUDIT_CYCLE_CLOSED',
    entity: { kind: 'AuditCycle', id: cycle._id },
    metadata: { discrepancies: discrepancyItems.length, updatedAssets },
  });

  return ok(
    res,
    { cycle, updatedAssets, discrepancies: discrepancyItems.length },
    `Cycle closed — ${discrepancyItems.length} discrepancy item(s) applied`
  );
});

module.exports = { create, list, getOne, activate, markItem, discrepancyReport, close };
