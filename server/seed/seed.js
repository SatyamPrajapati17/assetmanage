/**
 * AssetFlow seed script (Implementation Plan §4).
 * Creates demo departments, categories, the four role accounts, sample assets
 * (2 bookable, mixed statuses), one pre-existing ALLOCATION and one
 * pre-existing BOOKING so both conflict rules are demoable immediately.
 *
 * Run: npm run seed
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { connectDB } = require('../src/config/db');
const {
  User, Department, AssetCategory, Asset, Allocation, TransferRequest,
  Booking, MaintenanceRequest, AuditCycle, AuditItem, Notification,
  ActivityLog, Counter,
} = require('../src/models');

const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function seed() {
  await connectDB();

  console.log('Resetting collections…');
  await Promise.all([
    User.deleteMany({}), Department.deleteMany({}), AssetCategory.deleteMany({}),
    Asset.deleteMany({}), Allocation.deleteMany({}), TransferRequest.deleteMany({}),
    Booking.deleteMany({}), MaintenanceRequest.deleteMany({}), AuditCycle.deleteMany({}),
    AuditItem.deleteMany({}), Notification.deleteMany({}), ActivityLog.deleteMany({}),
    Counter.deleteMany({}),
  ]);

  // ---------------------------------------------------------------- Departments
  console.log('Creating departments…');
  const [engineering, operations, people] = await Department.create([
    { name: 'Engineering' },
    { name: 'Operations' },
    { name: 'People & Facilities' },
  ]);
  // parent/child pair: Engineering → QA Lab sub-team handled via parentDepartment
  const qaLab = await Department.create({ name: 'QA Lab', parentDepartment: engineering._id });

  // ---------------------------------------------------------------- Categories
  console.log('Creating asset categories…');
  const [electronics, furniture, vehicles] = await AssetCategory.create([
    {
      name: 'Electronics',
      customFields: [
        { key: 'warrantyPeriodMonths', label: 'Warranty (months)', type: 'number' },
        { key: 'manufacturer', label: 'Manufacturer', type: 'text' },
      ],
    },
    { name: 'Furniture' },
    { name: 'Vehicles' },
  ]);

  // ---------------------------------------------------------------- Users (4 demo roles)
  console.log('Creating demo users…');
  const mk = (name, email, password, role, department) =>
    bcrypt.hash(password, 10).then((passwordHash) => ({ name, email, passwordHash, role, department }));

  const users = await User.create([
    await mk('Asha Admin', 'admin@assetflow.demo', 'Admin@123', 'admin', null),
    await mk('Manav Manager', 'manager@assetflow.demo', 'Manager@123', 'assetManager', operations._id),
    await mk('Devika DeptHead', 'depthead@assetflow.demo', 'DeptHead@123', 'departmentHead', engineering._id),
    await mk('Ravi Employee', 'employee@assetflow.demo', 'Employee@123', 'employee', engineering._id),
    // extra employees for realistic demo (allocation targets, auditors…)
    await mk('Priya Sharma', 'priya@assetflow.demo', 'Employee@123', 'employee', engineering._id),
    await mk('Raj Verma', 'raj@assetflow.demo', 'Employee@123', 'employee', operations._id),
    await mk('Sameer Tech', 'sameer@assetflow.demo', 'Employee@123', 'employee', operations._id),
    // system actor for cron/server-initiated activity log entries
    await mk('System', 'system@assetflow.demo', 'System@123', 'admin', null),
  ]);

  const [admin, manager, deptHead, employee, priya, raj, sameer, systemUser] = users;

  // Wire department heads
  engineering.head = deptHead._id;
  operations.head = manager._id; // manager doubles as ops head for demo simplicity
  await Promise.all([engineering.save(), operations.save()]);

  // ---------------------------------------------------------------- Assets
  console.log('Creating assets…');
  const assetSpecs = [
    // [name, category, serial, condition, location, department, isBookable, status, warranty]
    ['MacBook Pro 16" (M3)', electronics, 'MBP-2024-0001', 'New', 'HQ · Floor 3', engineering, false, 'Available', 12],
    ['Dell XPS 15 Laptop', electronics, 'DXPS-2023-0114', 'Good', 'HQ · Floor 3', engineering, false, 'Allocated', 24],
    ['Conference Room B2', furniture, null, 'Good', 'HQ · Floor 2', operations, true, 'Available', null],
    ['Projector Epson EB-2247U', electronics, 'EPP-2022-0402', 'Fair', 'HQ · Floor 2', operations, true, 'Available', 18],
    ['Conference Room A1', furniture, null, 'Good', 'HQ · Floor 2', operations, true, 'Available', null],
    ['Standing Desk (Maple)', furniture, null, 'Good', 'HQ · Floor 3', engineering, false, 'Available', null],
    ['Herman Miller Aeron Chair', furniture, 'HMA-2021-0307', 'Fair', 'HQ · Floor 3', engineering, false, 'Allocated', null],
    ['Ford Transit Van (Ops)', vehicles, 'FTV-2020-0917', 'Good', 'Parking Bay 2', operations, false, 'Under Maintenance', null],
    ['iPhone 15 Test Device', electronics, 'IP15-2024-0058', 'New', 'QA Lab', qaLab, false, 'Available', 12],
    ['Laser Printer HP M479', electronics, 'HPL-2019-1123', 'Poor', 'HQ · Floor 1', operations, false, 'Available', null],
  ];
  const mkAsset = async (spec, i) => {
    const [name, category, serial, condition, location, department, isBookable, status, warranty] = spec;
    const seq = await Counter.nextSeq('assetTag');
    const asset = await Asset.create({
      assetTag: `AF-${String(seq).padStart(4, '0')}`,
      name,
      category: category._id,
      serialNumber: serial || undefined,
      acquisitionDate: daysFromNow(-400 - i * 45),
      acquisitionCost: 500 + i * 250,
      condition,
      location,
      department: department._id,
      isBookable,
      status, // honor spec: 'Allocated'/'Under Maintenance' assets get their Allocation/Request below
      customFieldValues: warranty ? { warrantyPeriodMonths: warranty, manufacturer: name.split(' ')[0] } : {},
    });
    return asset;
  };
  const assets = [];
  for (let i = 0; i < assetSpecs.length; i++) assets.push(await mkAsset(assetSpecs[i], i));

  const dell = assets[1];   // pre-allocated laptop for the double-allocation demo
  const chair = assets[6];
  const van = assets[7];

  // ---------------------------------------------------------------- Pre-existing allocation (conflict demo #1)
  console.log('Creating pre-existing allocation (Dell XPS → Priya Sharma)…');
  const preAllocation = await Allocation.create({
    asset: dell._id,
    allocatedTo: { type: 'Employee', employee: priya._id },
    allocatedBy: manager._id,
    allocationDate: daysFromNow(-15),
    expectedReturnDate: daysFromNow(14),
    status: 'Active',
  });
  dell.currentAllocation = preAllocation._id;
  await dell.save();

  // Second allocated asset (chair → Ravi) for a fuller directory view
  const chairAllocation = await Allocation.create({
    asset: chair._id,
    allocatedTo: { type: 'Employee', employee: employee._id },
    allocatedBy: manager._id,
    allocationDate: daysFromNow(-40),
    expectedReturnDate: daysFromNow(-3), // already overdue → demo overdue flag on next cron/on-read
    status: 'Active',
  });
  chair.currentAllocation = chairAllocation._id;
  await chair.save();

  // ---------------------------------------------------------------- Pre-existing booking (conflict demo #2)
  console.log('Creating pre-existing booking (Conference Room B2, tomorrow 09:00–10:00)…');
  const base = new Date();
  base.setDate(base.getDate() + 1);
  base.setHours(9, 0, 0, 0);
  const bookingEnd = new Date(base.getTime() + 60 * 60 * 1000);
  await Booking.create({
    resource: assets[2]._id,
    bookedBy: deptHead._id,
    onBehalfOfDepartment: engineering._id,
    start: base,
    end: bookingEnd,
    purpose: 'Sprint planning',
    status: 'Upcoming',
  });

  // A second upcoming booking for the calendar view
  const base2 = new Date(base.getTime() + 2 * 60 * 60 * 1000); // 11:00 same day
  await Booking.create({
    resource: assets[3]._id, // projector
    bookedBy: employee._id,
    start: base2,
    end: new Date(base2.getTime() + 45 * 60 * 1000),
    purpose: 'Design review',
    status: 'Upcoming',
  });

  // ---------------------------------------------------------------- Maintenance sample
  console.log('Creating sample maintenance request (Van — Under Maintenance)…');
  await MaintenanceRequest.create({
    asset: van._id,
    raisedBy: raj._id,
    issueDescription: 'Brake pads worn — van pulls left under braking; needs workshop visit.',
    priority: 'High',
    status: 'InProgress',
    approvedBy: manager._id,
    technician: sameer._id,
  });
  van.preMaintenanceStatus = 'Available';
  await van.save();

  // ---------------------------------------------------------------- Baseline activity log
  await ActivityLog.create([
    { actor: systemUser._id, action: 'SEED_ORG_CREATED', entity: { kind: 'System', id: null }, metadata: { departments: 4, categories: 3 } },
    { actor: manager._id, action: 'ASSET_REGISTERED', entity: { kind: 'Asset', id: dell._id }, metadata: { assetTag: dell.assetTag } },
    { actor: manager._id, action: 'ASSET_ALLOCATED', entity: { kind: 'Asset', id: dell._id }, metadata: { to: 'Priya Sharma' } },
    { actor: deptHead._id, action: 'BOOKING_CREATED', entity: { kind: 'Booking', id: null }, metadata: { resource: 'Conference Room B2' } },
  ]);

  await Notification.create([
    { user: priya._id, type: 'AssetAssigned', message: `Asset ${dell.assetTag} (Dell XPS 15 Laptop) has been allocated to you` },
    { user: employee._id, type: 'AssetAssigned', message: `Asset ${chair.assetTag} (Herman Miller Aeron Chair) has been allocated to you` },
    { user: employee._id, type: 'OverdueReturn', message: `Overdue: ${chair.assetTag} was expected back by ${chairAllocation.expectedReturnDate.toLocaleDateString()}` },
  ]);

  // ---------------------------------------------------------------- Summary
  const counts = {
    users: await User.countDocuments(),
    departments: await Department.countDocuments(),
    categories: await AssetCategory.countDocuments(),
    assets: await Asset.countDocuments(),
    allocations: await Allocation.countDocuments(),
    bookings: await Booking.countDocuments(),
    maintenance: await MaintenanceRequest.countDocuments(),
  };
  console.log('\n✅ Seed complete:', counts);
  console.log('\nDemo credentials (Implementation Plan §4):');
  console.table([
    { Role: 'Admin', Email: 'admin@assetflow.demo', Password: 'Admin@123' },
    { Role: 'Asset Manager', Email: 'manager@assetflow.demo', Password: 'Manager@123' },
    { Role: 'Department Head', Email: 'depthead@assetflow.demo', Password: 'DeptHead@123' },
    { Role: 'Employee', Email: 'employee@assetflow.demo', Password: 'Employee@123' },
  ]);
  console.log('Conflict demos ready:');
  console.log(` • ${dell.assetTag} Dell XPS 15 → already allocated to Priya Sharma (try allocating it!)`);
  console.log(` • Conference Room B2 → booked tomorrow 09:00–10:00 (try an overlapping slot!)`);
  console.log(` • Chair ${chair.assetTag} → overdue return (shows in red on the dashboard after the cron scan)`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
