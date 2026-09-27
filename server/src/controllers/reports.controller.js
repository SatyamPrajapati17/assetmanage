const mongoose = require('mongoose');
const { ok, asyncHandler } = require('../middleware/errorHandler');

/** Shared CSV serializer. */
function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}

function departmentScopeOrAll(req) {
  return ['admin', 'assetManager'].includes(req.user.role) ? null : req.user.department;
}

/** FR-9.1 — utilization: allocation+booking frequency per asset, most-used vs idle. */
const utilization = asyncHandler(async (req, res) => {
  const Asset = mongoose.model('Asset');
  const Allocation = mongoose.model('Allocation');
  const Booking = mongoose.model('Booking');

  const assets = await Asset.find().populate('category', 'name').select('name assetTag status category location');
  const dept = departmentScopeOrAll(req);

  const [allocCounts, bookingCounts] = await Promise.all([
    Allocation.aggregate([{ $group: { _id: '$asset', count: { $sum: 1 } } }]),
    Booking.aggregate([{ $match: { status: { $ne: 'Cancelled' } } }, { $group: { _id: '$resource', count: { $sum: 1 } } }]),
  ]);
  const aMap = new Map(allocCounts.map((r) => [String(r._id), r.count]));
  const bMap = new Map(bookingCounts.map((r) => [String(r._id), r.count]));

  let rows = assets.map((a) => ({
    assetTag: a.assetTag,
    name: a.name,
    category: a.category ? a.category.name : '',
    status: a.status,
    allocations: aMap.get(String(a._id)) || 0,
    bookings: bMap.get(String(a._id)) || 0,
    uses: (aMap.get(String(a._id)) || 0) + (bMap.get(String(a._id)) || 0),
  }));
  rows.sort((x, y) => y.uses - x.uses);

  return ok(res, { rows, csv: toCsv(rows) });
});

/** FR-9.2 — maintenance frequency by asset and category. */
const maintenanceFrequency = asyncHandler(async (req, res) => {
  const MaintenanceRequest = mongoose.model('MaintenanceRequest');
  const byAsset = await MaintenanceRequest.aggregate([
    { $group: { _id: '$asset', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
    { $lookup: { from: 'assets', localField: '_id', foreignField: '_id', as: 'asset' } },
    { $unwind: '$asset' },
    { $project: { assetTag: '$asset.assetTag', name: '$asset.name', count: 1 } },
  ]);

  const byCategory = await MaintenanceRequest.aggregate([
    {
      $lookup: { from: 'assets', localField: 'asset', foreignField: '_id', as: 'asset' },
    },
    { $unwind: '$asset' },
    {
      $lookup: { from: 'assetcategories', localField: 'asset.category', foreignField: '_id', as: 'category' },
    },
    { $unwind: '$category' },
    { $group: { _id: '$category.name', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const rows = byAsset.map((r) => ({ assetTag: r.assetTag, name: r.name, count: r.count }));
  return ok(res, { byAsset: rows, byCategory, csv: toCsv(rows) });
});

/** FR-9.3 — assets due for maintenance / nearing retirement (age & condition heuristic). */
const nearingRetirement = asyncHandler(async (req, res) => {
  const Asset = mongoose.model('Asset');
  const assets = await Asset.find({ status: { $nin: ['Disposed'] } })
    .populate('category', 'name')
    .select('name assetTag status condition acquisitionDate acquisitionCost location');

  const YEARS = 5; // heuristic retirement age
  const rows = assets
    .map((a) => {
      const ageYears = a.acquisitionDate ? (Date.now() - a.acquisitionDate.getTime()) / (365.25 * 24 * 3600 * 1000) : null;
      const conditionScore = { New: 0, Good: 1, Fair: 2, Poor: 3, Damaged: 4 }[a.condition] ?? 0;
      const ageScore = ageYears === null ? 0 : Math.min(ageYears / YEARS, 2);
      const risk = conditionScore + ageScore;
      return {
        assetTag: a.assetTag,
        name: a.name,
        category: a.category ? a.category.name : '',
        status: a.status,
        condition: a.condition,
        ageYears: ageYears === null ? null : Number(ageYears.toFixed(1)),
        riskScore: Number(risk.toFixed(2)),
        flag: risk >= 3.5 ? 'Due for replacement' : risk >= 2 ? 'Monitor' : 'Healthy',
      };
    })
    .sort((x, y) => y.riskScore - x.riskScore);

  return ok(res, { rows, csv: toCsv(rows) });
});

/** FR-9.4 — department-wise allocation summary. */
const departmentSummary = asyncHandler(async (req, res) => {
  const Department = mongoose.model('Department');
  const Allocation = mongoose.model('Allocation');
  const Asset = mongoose.model('Asset');

  const departments = await Department.find().select('name status');
  const rows = await Promise.all(
    departments.map(async (d) => {
      const [activeAllocations, totalAssets] = await Promise.all([
        Allocation.countDocuments({ 'allocatedTo.department': d._id, status: 'Active' }),
        Asset.countDocuments({ department: d._id }),
      ]);
      return { department: d.name, activeAllocations, totalAssets };
    })
  );
  rows.sort((a, b) => b.activeAllocations - a.activeAllocations);
  return ok(res, { rows, csv: toCsv(rows) });
});

/** FR-9.5 — booking heatmap: hour × day usage grid. */
const bookingHeatmap = asyncHandler(async (req, res) => {
  const Booking = mongoose.model('Booking');
  const matches = await Booking.find({ status: { $in: ['Completed', 'Ongoing', 'Upcoming'] } })
    .select('start end')
    .lean();

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const grid = {};
  days.forEach((d) => {
    grid[d] = {};
    for (let h = 0; h < 24; h++) grid[d][h] = 0;
  });

  matches.forEach((b) => {
    // Count each hour slot the booking spans (cap 4h per booking for sanity).
    const start = new Date(b.start);
    const end = new Date(b.end);
    const cursor = new Date(start);
    let guard = 0;
    while (cursor < end && guard < 16) {
      const d = days[cursor.getDay()];
      const h = cursor.getHours();
      grid[d][h] += 1;
      cursor.setHours(cursor.getHours() + 1);
      guard += 1;
    }
  });

  return ok(res, { grid, csv: toCsv(
    Object.entries(grid).flatMap(([day, hours]) =>
      Object.entries(hours).map(([h, count]) => ({ day, hour: `${h}:00`, count }))
    )
  ) });
});

module.exports = { utilization, maintenanceFrequency, nearingRetirement, departmentSummary, bookingHeatmap };
