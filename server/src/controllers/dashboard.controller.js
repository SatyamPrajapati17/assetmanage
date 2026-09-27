const mongoose = require('mongoose');
const { ok, asyncHandler } = require('../middleware/errorHandler');

/**
 * Dashboard KPIs (FR-3) — computed via aggregation pipelines, scoped by role:
 * Employee → own data; Department Head → department; Admin/Asset Manager → org-wide.
 */
const summary = asyncHandler(async (req, res) => {
  const Asset = mongoose.model('Asset');
  const Allocation = mongoose.model('Allocation');
  const Booking = mongoose.model('Booking');
  const MaintenanceRequest = mongoose.model('MaintenanceRequest');
  const TransferRequest = mongoose.model('TransferRequest');
  const User = mongoose.model('User');

  const scope = {};
  const user = req.user;

  // Resolve visible user ids for department scoping (default [] avoids $in:null crashes).
  let deptUserIds = [];
  if (user.role === 'departmentHead' && user.department) {
    const members = await User.find({ department: user.department }).select('_id');
    deptUserIds = members.map((m) => m._id);
    scope.department = user.department;
  }
  if (user.role === 'employee') {
    scope.employeeId = user.id;
  }

  const isOrgWide = ['admin', 'assetManager'].includes(user.role);

  // --- Assets available / allocated ---
  const assetFilter = isOrgWide
    ? {}
    : user.role === 'departmentHead'
      ? { $or: [{ department: user.department }, { department: null }] }
      : {}; // employees browse org assets; "available" count is org-wide info
  const [assetsAvailable, assetsAllocated] = await Promise.all([
    Asset.countDocuments({ ...assetFilter, status: 'Available' }),
    Asset.countDocuments({ ...assetFilter, status: 'Allocated' }),
  ]);

  // --- Maintenance today (requests raised or resolved today, scoped) ---
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const maintFilter = { createdAt: { $gte: startOfDay } };
  if (user.role === 'employee') maintFilter.raisedBy = user.id;
  if (user.role === 'departmentHead') maintFilter.raisedBy = { $in: deptUserIds };
  const maintenanceToday = await MaintenanceRequest.countDocuments(maintFilter);

  // --- Active bookings (Upcoming + Ongoing, scoped) ---
  const bookingFilter = { status: { $in: ['Upcoming', 'Ongoing'] } };
  if (user.role === 'employee') bookingFilter.bookedBy = user.id;
  if (user.role === 'departmentHead') bookingFilter.bookedBy = { $in: deptUserIds };
  const activeBookings = await Booking.countDocuments(bookingFilter);

  // --- Pending transfers (Requested; scoped) ---
  const transferFilter = { status: 'Requested' };
  if (user.role === 'employee') transferFilter.requestedBy = user.id;
  if (user.role === 'departmentHead') {
    const deptMembers = deptUserIds;
    transferFilter.$or = [{ requestedBy: { $in: deptMembers } }, { 'requestedTo.employee': { $in: deptMembers } }];
  }
  const pendingTransfers = await TransferRequest.countDocuments(transferFilter);

  // --- Upcoming returns (next 7 days) & overdue (live-computed per TRD §4.5) ---
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const allocFilter = { status: 'Active' };
  if (user.role === 'employee') allocFilter['allocatedTo.employee'] = user.id;
  if (user.role === 'departmentHead') {
    allocFilter.$or = [
      { 'allocatedTo.employee': { $in: deptUserIds } },
      { 'allocatedTo.department': user.department },
    ];
  }

  const upcomingReturns = await Allocation.countDocuments({
    ...allocFilter,
    expectedReturnDate: { $gte: now, $lte: in7Days },
    isOverdue: false,
  });

  const overdueReturns = await Allocation.countDocuments({
    ...allocFilter,
    expectedReturnDate: { $lt: now },
    isOverdue: true,
  });

  const overdueList = await Allocation.find({
    ...allocFilter,
    expectedReturnDate: { $lt: now },
    isOverdue: true,
  })
    .sort({ expectedReturnDate: 1 })
    .limit(10)
    .populate('asset', 'name assetTag')
    .populate('allocatedTo.employee', 'name');

  const upcomingList = await Allocation.find({
    ...allocFilter,
    expectedReturnDate: { $gte: now, $lte: in7Days },
    isOverdue: false,
  })
    .sort({ expectedReturnDate: 1 })
    .limit(10)
    .populate('asset', 'name assetTag')
    .populate('allocatedTo.employee', 'name');

  // --- Recent activity (own/department/org per role) ---
  const ActivityLog = mongoose.model('ActivityLog');
  const activityFilter = {};
  if (user.role === 'employee') activityFilter.actor = user.id;
  if (user.role === 'departmentHead') activityFilter.actor = { $in: deptUserIds };
  const recentActivity = await ActivityLog.find(activityFilter)
    .sort({ timestamp: -1 })
    .limit(12)
    .populate('actor', 'name role');

  // --- Mini booking preview (next 5 bookings visible to the user) ---
  const previewFilter = { status: { $in: ['Upcoming', 'Ongoing'] }, start: { $gte: startOfDay } };
  if (user.role === 'employee') previewFilter.bookedBy = user.id;
  if (user.role === 'departmentHead') previewFilter.bookedBy = { $in: deptUserIds };
  const bookingPreview = await Booking.find(previewFilter)
    .sort({ start: 1 })
    .limit(5)
    .populate('resource', 'name assetTag')
    .populate('bookedBy', 'name');

  return ok(res, {
    kpis: {
      assetsAvailable,
      assetsAllocated,
      maintenanceToday,
      activeBookings,
      pendingTransfers,
      upcomingReturns,
    },
    overdueReturns: { count: overdueReturns, items: overdueList },
    upcomingReturnsList: upcomingList,
    recentActivity,
    bookingPreview,
  });
});

module.exports = { summary };
