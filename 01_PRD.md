# AssetFlow — Product Requirements Document (PRD)

**Enterprise Asset & Resource Management System**
Version 1.0 · Hackathon Build · Stack: Node.js/Express + MongoDB (backend), React (frontend)

---

## 1. Overview

AssetFlow is a centralized ERP module for tracking, allocating, booking, and maintaining an organization's physical assets and shared resources (equipment, furniture, vehicles, rooms). It replaces spreadsheets/paper logs with structured lifecycles, conflict-safe allocation and booking, an approval-gated maintenance pipeline, and scheduled audit cycles — without touching purchasing, invoicing, or accounting.

**Not industry-specific** — usable by offices, schools, hospitals, factories, agencies, etc.

## 2. Goals

- Give every organization a single source of truth for "who holds what, where it is, and its condition."
- Prevent double-allocation of assets and double-booking of shared resources through hard conflict rules.
- Enforce a realistic, non-self-elevating role model (no one signs up as Admin).
- Provide real-time operational visibility via a KPI dashboard and notifications.
- Run structured maintenance approval and audit-cycle workflows instead of free-form tickets.

## 3. Non-Goals

- No purchasing, invoicing, or accounting integration (acquisition cost is stored for reporting only).
- No multi-tenant/SaaS billing layer — single organization per deployment for the hackathon build.
- No mobile native app — responsive web only.

## 4. Target Users & Roles

| Role | Assigned By | Core Capabilities |
|---|---|---|
| **Employee** (default on signup) | Self (signup) | View own allocated assets, book shared resources, raise maintenance requests, initiate return/transfer requests |
| **Department Head** | Admin (promotion) | Everything Employee does + view department's assets, approve allocation/transfer requests within department, book on behalf of department |
| **Asset Manager** | Admin (promotion) | Register/allocate assets, approve transfers, approve maintenance requests, approve returns & condition check-ins, resolve audit discrepancies |
| **Admin** | Pre-seeded / promoted by existing Admin | Manages departments, asset categories, audit cycles, and role assignment; org-wide analytics |

**Critical rule:** Signup always creates an Employee account. Roles are elevated *only* from the Employee Directory (Screen 3, Tab C) by an Admin. No self-assigned admin roles anywhere in the flow.

## 5. Core Entities (domain model, see Backend Schema doc for full detail)

Organization → Department → Employee (User) → Asset (Category, Lifecycle State) → Allocation → Transfer Request → Booking (Resource) → Maintenance Request → Audit Cycle → Audit Item → Notification → Activity Log

## 6. Functional Requirements

### FR-1 Authentication & Onboarding
- FR-1.1 Signup creates Employee account only (name, email, password, department selection).
- FR-1.2 Login with email/password; session via JWT (access + refresh token).
- FR-1.3 Forgot password flow (token-based reset, emailed link simulated for demo).
- FR-1.4 Session validation middleware on all protected routes; expired/invalid tokens force re-login.

### FR-2 Organization Setup (Admin only)
- FR-2.1 Department CRUD: name, Department Head (from Employee Directory), optional Parent Department, Status.
- FR-2.2 Asset Category CRUD: name, optional custom fields (e.g., warranty period), Status.
- FR-2.3 Employee Directory: list/search employees; edit Department, Role, Status; **role promotion happens only here**.

### FR-3 Dashboard
- FR-3.1 KPI cards: Assets Available, Assets Allocated, Maintenance Today, Active Bookings, Pending Transfers, Upcoming Returns.
- FR-3.2 Overdue returns visually separated (red/flag) from upcoming returns.
- FR-3.3 Quick actions: Register Asset, Book Resource, Raise Maintenance Request (role-gated visibility).
- FR-3.4 Dashboard data scoped by role (Employee sees own; Department Head sees department; Admin/Asset Manager see org-wide).

### FR-4 Asset Registration & Directory
- FR-4.1 Register asset: Name, Category, auto-generated Asset Tag (`AF-0001` sequential), Serial Number (unique), Acquisition Date, Acquisition Cost (report-only), Condition, Location, photo/document upload, `isBookable` flag.
- FR-4.2 Search/filter by Asset Tag, Serial Number, QR code value, Category, Status, Department, Location.
- FR-4.3 Lifecycle status badge per asset: `Available | Allocated | Reserved | Under Maintenance | Lost | Retired | Disposed`.
- FR-4.4 Per-asset history tabs: Allocation History, Maintenance History.
- FR-4.5 QR code generated per asset (encodes Asset Tag) for scan-based lookup.

### FR-5 Asset Allocation & Transfer
- FR-5.1 Allocate asset to Employee or Department with optional Expected Return Date.
- FR-5.2 **Conflict rule:** allocating an already-`Allocated`/`Reserved` asset is blocked; UI shows current holder and offers "Transfer Request" instead of raw allocation.
- FR-5.3 Transfer workflow: `Requested → Approved (Asset Manager/Dept Head) → Re-allocated` (history auto-updated; old allocation closed, new one opened atomically).
- FR-5.4 Return flow: mark returned, capture condition check-in notes, asset status reverts to `Available`.
- FR-5.5 Overdue allocations (past Expected Return Date, still `Allocated`) auto-flagged nightly (or on-read) → feed Dashboard + Notifications.

### FR-6 Resource Booking
- FR-6.1 Calendar view per bookable resource showing existing bookings.
- FR-6.2 **Overlap validation:** new booking rejected if `existingStart < newEnd AND existingEnd > newStart` for that resource (Allen's interval-overlap rule) — back-to-back bookings (new start = existing end) are allowed.
- FR-6.3 Booking status: `Upcoming | Ongoing | Completed | Cancelled` (derived/updated from current time vs. slot, or explicit cancel).
- FR-6.4 Cancel/reschedule; reschedule re-runs overlap validation.
- FR-6.5 Reminder notification generated before slot start (simulated scheduler for demo).

### FR-7 Maintenance Management
- FR-7.1 Raise request: asset, issue description, priority (`Low|Medium|High|Critical`), photo attachment.
- FR-7.2 Workflow: `Pending → Approved/Rejected (Asset Manager) → Technician Assigned → In Progress → Resolved`.
- FR-7.3 Asset auto-transitions to `Under Maintenance` on approval, back to `Available` on `Resolved`.
- FR-7.4 Maintenance history retained per asset (join of all requests against that asset).

### FR-8 Asset Audit
- FR-8.1 Create Audit Cycle: scope (department and/or location), date range, name.
- FR-8.2 Assign one or more auditors to the cycle.
- FR-8.3 Auditor marks each in-scope asset: `Verified | Missing | Damaged` (with optional note).
- FR-8.4 System auto-generates a discrepancy report listing all `Missing`/`Damaged` items when requested or on close.
- FR-8.5 Close Audit Cycle: locks the cycle (no further marks), updates affected asset statuses (`Missing` confirmed → asset status `Lost`; `Damaged` confirmed → flagged for maintenance).
- FR-8.6 Audit history retained per cycle, browsable per asset too.

### FR-9 Reports & Analytics
- FR-9.1 Asset utilization: most-used vs. idle assets (by allocation/booking frequency).
- FR-9.2 Maintenance frequency by asset/category.
- FR-9.3 Assets due for maintenance or nearing retirement (age/condition heuristic).
- FR-9.4 Department-wise allocation summary.
- FR-9.5 Resource booking heatmap (peak usage windows by hour/day).
- FR-9.6 Export (CSV at minimum; PDF optional stretch) of any report view.

### FR-10 Activity Logs & Notifications
- FR-10.1 Notification triggers: Asset Assigned, Maintenance Approved/Rejected, Booking Confirmed/Cancelled/Reminder, Transfer Approved, Overdue Return Alert, Audit Discrepancy Flagged.
- FR-10.2 In-app notification center (read/unread, per-user).
- FR-10.3 Full activity log: actor, action, entity, timestamp — append-only, admin-browsable, filterable by user/entity/date.

## 7. Non-Functional Requirements

- **Security:** bcrypt password hashing, JWT auth, role-based route guards on every API endpoint (not just UI hiding), input validation on all writes.
- **Data integrity:** allocation/transfer/return and booking-create must be atomic (MongoDB transactions or equivalent single-document update pattern) to prevent race-condition double-allocation/double-booking.
- **Usability:** responsive layout (desktop-first for hackathon demo, functional down to tablet width); role-aware navigation (hide/disable actions the current role can't perform).
- **Performance:** indexed queries for search/filter and overlap checks (see Backend Schema doc); dashboard KPIs computed via aggregation pipelines, not client-side loops.
- **Auditability:** every state-changing action (allocate, transfer, approve, resolve, close-audit) writes an Activity Log entry.
- **Deployability:** must run fully on `localhost` with a local or Atlas MongoDB connection string via `.env`, no paid external services required for the demo path.

## 8. Success Metrics (hackathon demo criteria)

- Zero double-allocations / zero overlapping bookings reproducible in demo (test both conflict paths live).
- Full maintenance lifecycle demonstrable end-to-end in under 2 minutes.
- Full audit cycle (create → assign → mark → close → status update) demonstrable end-to-end.
- Dashboard reflects state changes without page-specific hacks (real aggregation).
- All 4 roles logged in via provided demo credentials with visibly different permissions.

## 9. Assumptions & Open Questions

- Assumption: single-organization deployment (no multi-tenant org switcher) for hackathon scope.
- Assumption: email delivery (password reset, reminders) is simulated/logged rather than sent via a real SMTP provider, unless time permits adding one.
- Open: whether QR scanning uses device camera (browser `getUserMedia`) or manual code entry — defaulted to manual entry + optional camera scan as stretch goal.
