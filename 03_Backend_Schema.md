# AssetFlow — Backend Schema (MongoDB / Mongoose)

Design approach: reference (not embed) across high-write, independently-queried entities (assets, allocations, bookings, maintenance, audits) since each has its own lifecycle and history needs to be queried independently. Small, bounded, rarely-changing sub-data (e.g., category custom fields) is embedded.

---

## 1. `users`
```js
{
  _id: ObjectId,
  name: String,               // required
  email: String,               // required, unique, lowercase, indexed
  passwordHash: String,        // required, bcrypt
  role: {                      // ONLY ever changed via PATCH /employees/:id/role (admin-only)
    type: String,
    enum: ['employee', 'departmentHead', 'assetManager', 'admin'],
    default: 'employee'
  },
  department: { type: ObjectId, ref: 'Department', index: true },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  passwordResetTokenHash: String,
  passwordResetExpires: Date,
  refreshTokenHash: String,    // optional, for refresh-token rotation/revocation
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes:** `{ email: 1 }` unique · `{ department: 1 }` · `{ role: 1 }`

---

## 2. `departments`
```js
{
  _id: ObjectId,
  name: String,                 // required, unique
  head: { type: ObjectId, ref: 'User' },
  parentDepartment: { type: ObjectId, ref: 'Department', default: null },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes:** `{ name: 1 }` unique · `{ parentDepartment: 1 }`

---

## 3. `assetcategories`
```js
{
  _id: ObjectId,
  name: String,                 // required, unique — e.g. "Electronics", "Vehicles"
  customFields: [{              // e.g. { key: 'warrantyPeriodMonths', label: 'Warranty (months)', type: 'number' }
    key: String,
    label: String,
    type: { type: String, enum: ['text', 'number', 'date', 'boolean'] }
  }],
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes:** `{ name: 1 }` unique

---

## 4. `assets`
```js
{
  _id: ObjectId,
  assetTag: String,             // required, unique — auto-generated "AF-0001" (sequence, see §8)
  name: String,                 // required
  category: { type: ObjectId, ref: 'AssetCategory', required: true, index: true },
  serialNumber: { type: String, unique: true, sparse: true },
  qrCode: String,                // encodes assetTag, generated on create
  acquisitionDate: Date,
  acquisitionCost: Number,       // report-only, NOT linked to accounting
  condition: { type: String, enum: ['New', 'Good', 'Fair', 'Poor', 'Damaged'], default: 'New' },
  location: { type: String, index: true },
  department: { type: ObjectId, ref: 'Department', index: true }, // home/owning department, optional
  photos: [String],              // file paths / URLs
  documents: [String],
  isBookable: { type: Boolean, default: false, index: true }, // shared/bookable flag
  status: {
    type: String,
    enum: ['Available', 'Allocated', 'Reserved', 'Under Maintenance', 'Lost', 'Retired', 'Disposed'],
    default: 'Available',
    index: true
  },
  preMaintenanceStatus: String,   // internal: status to restore to after maintenance Resolved
  currentAllocation: { type: ObjectId, ref: 'Allocation', default: null },
  customFieldValues: mongoose.Schema.Types.Mixed, // keyed by category.customFields[].key
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes:** `{ assetTag: 1 }` unique · `{ serialNumber: 1 }` unique-sparse · `{ status: 1 }` · `{ category: 1 }` · `{ department: 1 }` · `{ location: 1 }` · text index on `{ name: 'text', assetTag: 'text', serialNumber: 'text' }` for search.

**Allowed status transitions (enforced in service layer, not just UI):**
`Available → Allocated | Reserved | Under Maintenance | Retired`
`Allocated → Available (return) | Under Maintenance`
`Reserved → Available | Allocated`
`Under Maintenance → Available (resolved) | Lost | Retired`
`Lost → Available (recovered, admin override) | Disposed`
`Retired → Disposed`
`Disposed` — terminal.

---

## 5. `allocations`
```js
{
  _id: ObjectId,
  asset: { type: ObjectId, ref: 'Asset', required: true, index: true },
  allocatedTo: {
    type: { type: String, enum: ['Employee', 'Department'], required: true },
    employee: { type: ObjectId, ref: 'User' },
    department: { type: ObjectId, ref: 'Department' }
  },
  allocatedBy: { type: ObjectId, ref: 'User', required: true },  // Asset Manager
  allocationDate: { type: Date, default: Date.now },
  expectedReturnDate: Date,
  actualReturnDate: Date,
  returnConditionNotes: String,
  status: { type: String, enum: ['Active', 'Returned', 'TransferredOut'], default: 'Active', index: true },
  isOverdue: { type: Boolean, default: false, index: true }, // set by cron job
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes:** `{ asset: 1, status: 1 }` · `{ 'allocatedTo.employee': 1 }` · `{ 'allocatedTo.department': 1 }` · `{ status: 1, expectedReturnDate: 1 }` (overdue scan)

---

## 6. `transferrequests`
```js
{
  _id: ObjectId,
  asset: { type: ObjectId, ref: 'Asset', required: true, index: true },
  fromAllocation: { type: ObjectId, ref: 'Allocation' },
  requestedBy: { type: ObjectId, ref: 'User', required: true },
  requestedTo: {
    type: { type: String, enum: ['Employee', 'Department'], required: true },
    employee: { type: ObjectId, ref: 'User' },
    department: { type: ObjectId, ref: 'Department' }
  },
  reason: String,
  status: { type: String, enum: ['Requested', 'Approved', 'Rejected', 'Completed'], default: 'Requested', index: true },
  approvedBy: { type: ObjectId, ref: 'User' },
  approvedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes:** `{ asset: 1, status: 1 }` · `{ requestedBy: 1 }`

---

## 7. `bookings`
```js
{
  _id: ObjectId,
  resource: { type: ObjectId, ref: 'Asset', required: true, index: true }, // asset with isBookable=true
  bookedBy: { type: ObjectId, ref: 'User', required: true },
  onBehalfOfDepartment: { type: ObjectId, ref: 'Department' }, // set when Dept Head books for dept
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  purpose: String,
  status: { type: String, enum: ['Upcoming', 'Ongoing', 'Completed', 'Cancelled'], default: 'Upcoming', index: true },
  cancelledBy: { type: ObjectId, ref: 'User' },
  cancelReason: String,
  reminderSent: { type: Boolean, default: false },
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes:** `{ resource: 1, start: 1, end: 1 }` (overlap-check compound index) · `{ bookedBy: 1 }` · `{ status: 1, start: 1 }`

**Overlap validation query** (see TRD §4.2):
```js
{ resource, status: { $in: ['Upcoming','Ongoing'] }, start: { $lt: newEnd }, end: { $gt: newStart } }
```

---

## 8. `maintenancerequests`
```js
{
  _id: ObjectId,
  asset: { type: ObjectId, ref: 'Asset', required: true, index: true },
  raisedBy: { type: ObjectId, ref: 'User', required: true },
  issueDescription: String,
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
  photo: String,
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'TechnicianAssigned', 'InProgress', 'Resolved'],
    default: 'Pending',
    index: true
  },
  approvedBy: { type: ObjectId, ref: 'User' },
  rejectionReason: String,
  technician: { type: ObjectId, ref: 'User' },     // or plain string if external technician
  resolutionNotes: String,
  resolvedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes:** `{ asset: 1, status: 1 }` · `{ status: 1, priority: 1 }`

---

## 9. `auditcycles`
```js
{
  _id: ObjectId,
  name: String,
  scope: {
    departments: [{ type: ObjectId, ref: 'Department' }],
    locations: [String]
  },
  dateRange: { start: Date, end: Date },
  auditors: [{ type: ObjectId, ref: 'User' }],
  status: { type: String, enum: ['Planned', 'Active', 'Closed'], default: 'Planned', index: true },
  createdBy: { type: ObjectId, ref: 'User' },
  closedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes:** `{ status: 1 }` · `{ 'scope.departments': 1 }`

## 9a. `audititems`
```js
{
  _id: ObjectId,
  auditCycle: { type: ObjectId, ref: 'AuditCycle', required: true, index: true },
  asset: { type: ObjectId, ref: 'Asset', required: true, index: true },
  result: { type: String, enum: ['Pending', 'Verified', 'Missing', 'Damaged'], default: 'Pending' },
  note: String,
  markedBy: { type: ObjectId, ref: 'User' },
  markedAt: Date
}
```
**Indexes:** `{ auditCycle: 1, result: 1 }` · unique compound `{ auditCycle: 1, asset: 1 }`

---

## 10. `notifications`
```js
{
  _id: ObjectId,
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['AssetAssigned', 'MaintenanceApproved', 'MaintenanceRejected', 'BookingConfirmed',
           'BookingCancelled', 'BookingReminder', 'TransferApproved', 'OverdueReturn', 'AuditDiscrepancy'],
  },
  message: String,
  relatedEntity: { kind: String, id: ObjectId }, // polymorphic reference
  read: { type: Boolean, default: false, index: true },
  createdAt: Date
}
```
**Indexes:** `{ user: 1, read: 1, createdAt: -1 }`

---

## 11. `activitylogs`
```js
{
  _id: ObjectId,
  actor: { type: ObjectId, ref: 'User', required: true, index: true },
  action: String,                 // e.g. "ASSET_ALLOCATED", "MAINTENANCE_APPROVED"
  entity: { kind: String, id: ObjectId },
  metadata: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now, index: true }
}
```
**Indexes:** `{ actor: 1, timestamp: -1 }` · `{ 'entity.kind': 1, 'entity.id': 1 }`

---

## 12. `counters` (utility collection for sequential Asset Tags)
```js
{ _id: 'assetTag', seq: Number }
```
Increment atomically via `findOneAndUpdate({ _id: 'assetTag' }, { $inc: { seq: 1 } }, { upsert: true, new: true })`, format as `AF-${String(seq).padStart(4, '0')}`.

---

## 13. Relationship Summary

```
Department 1─* User (employees)
Department 1─1 User (head)
Department 1─* Department (parentDepartment, self-referencing hierarchy)
AssetCategory 1─* Asset
Asset 1─* Allocation (history)   Asset 0─1 Allocation (currentAllocation, active)
Asset 1─* TransferRequest
Asset 1─* Booking (only if isBookable)
Asset 1─* MaintenanceRequest
Asset 1─* AuditItem   AuditCycle 1─* AuditItem
User 1─* Notification
User 1─* ActivityLog (as actor)
```

## 14. Data Integrity Notes

- Prefer a **single-node replica set** in local MongoDB (`mongod --replSet rs0`) so `mongoose` sessions/transactions work for the allocate/book/close-audit flows; see Implementation Plan for the one-time `rs.initiate()` step.
- Where transactions aren't available (e.g. constrained environment), fall back to the atomic `findOneAndUpdate` status-guard pattern described in the TRD — it is safe on a standalone `mongod` too.
- All enum fields validated at the Mongoose schema level *and* re-checked in the service layer before any state transition (defense in depth against direct API calls that bypass expected UI flow).
