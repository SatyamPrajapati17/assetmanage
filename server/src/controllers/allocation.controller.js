const mongoose = require('mongoose');
const { ok, asyncHandler } = require('../middleware/errorHandler');

/**
 * GET /allocations — list allocations with filters.
 * Scope: Employee sees own (as holder); Department Head sees own department's;
 * Admin/Asset Manager see everything.
 */
const list = asyncHandler(async (req, res) => {
  const Allocation = mongoose.model('Allocation');
  const { page = 1, limit = 50, status, asset, overdue, scope, q } = req.query;

  const filter = {};
  if (status) filter.status = { $in: status.split(',').map((s) => s.trim()) };
  if (asset) filter.asset = asset;
  if (overdue === 'true') filter.isOverdue = true;
  if (overdue === 'false') filter.isOverdue = false;

  if (scope !== 'all') {
    if (req.user.role === 'employee') {
      filter['allocatedTo.employee'] = req.user.id;
    } else if (req.user.role === 'departmentHead') {
      filter['allocatedTo.department'] = req.user.department;
    }
  }

  // Text search across asset tag/name and holder name (FR-4.2-style filtering).
  if (q) {
    const Asset = mongoose.model('Asset');
    const User = mongoose.model('User');
    const rx = { $regex: q, $options: 'i' };
    const [assetIds, userIds] = await Promise.all([
      Asset.find({ $or: [{ assetTag: rx }, { name: rx }] }).select('_id'),
      User.find({ name: rx }).select('_id'),
    ]);
    filter.$or = [
      { asset: { $in: assetIds.map((a) => a._id) } },
      { 'allocatedTo.employee': { $in: userIds.map((u) => u._id) } },
    ];
  }

  const [items, total] = await Promise.all([
    Allocation.find(filter)
      .sort({ allocationDate: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .populate('asset', 'name assetTag status location category')
      .populate('allocatedTo.employee', 'name email department')
      .populate('allocatedTo.department', 'name')
      .populate('allocatedBy', 'name'),
    Allocation.countDocuments(filter),
  ]);

  // Employee/Dept-Head view: include department-held assets too? Keep simple:
  // departmentHead also sees allocations whose holder is a department member.
  return ok(res, { items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) || 1 });
});

/** GET /allocations/mine — convenience endpoint for Employee dashboard. */
const mine = asyncHandler(async (req, res) => {
  const Allocation = mongoose.model('Allocation');
  const items = await Allocation.find({ 'allocatedTo.employee': req.user.id, status: 'Active' })
    .sort({ allocationDate: -1 })
    .populate('asset', 'name assetTag status location');
  return ok(res, { items });
});

module.exports = { list, mine };
