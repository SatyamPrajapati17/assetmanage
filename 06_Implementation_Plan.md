# AssetFlow — Implementation Plan

## 1. Suggested Repo Structure

```
assetflow/
├── server/
│   ├── src/
│   │   ├── config/          (db.js, env.js)
│   │   ├── models/          (User.js, Department.js, AssetCategory.js, Asset.js,
│   │   │                     Allocation.js, TransferRequest.js, Booking.js,
│   │   │                     MaintenanceRequest.js, AuditCycle.js, AuditItem.js,
│   │   │                     Notification.js, ActivityLog.js, Counter.js)
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── middleware/      (auth.js, requireRole.js, errorHandler.js, validate.js)
│   │   ├── services/        (allocationService.js, bookingService.js, ...)
│   │   ├── jobs/            (overdueScan.js, bookingStatusSync.js — node-cron)
│   │   ├── utils/
│   │   └── app.js
│   ├── seed/
│   │   └── seed.js
│   ├── .env.example
│   └── package.json
├── client/
│   ├── src/
│   │   ├── pages/            (Login, Dashboard, OrgSetup, AssetDirectory,
│   │   │                      Allocation, Booking, Maintenance, Audit, Reports, Logs)
│   │   ├── components/
│   │   ├── context/AuthContext.jsx
│   │   ├── api/
│   │   └── App.jsx
│   ├── .env.example
│   └── package.json
└── README.md
```

## 2. Build Phases (hackathon-paced)

| Phase | Scope | Deliverable |
|---|---|---|
| **0 — Setup** | Repo scaffold, MongoDB connection, base Express app, base Vite app, auth boilerplate | App boots, empty login page loads |
| **1 — Auth & Org Foundation** | Signup/login/JWT, Department + AssetCategory CRUD, Employee Directory + role promotion | Admin can create org structure and promote roles |
| **2 — Asset Core** | Asset model, register/search/filter, asset tag auto-gen, QR generation, detail view | Assets can be created and browsed |
| **3 — Allocation & Transfer** | Allocate with conflict guard, transfer workflow, return flow, overdue cron | Double-allocation demonstrably blocked; transfer works end-to-end |
| **4 — Booking** | Bookable flag, calendar UI, overlap-validated booking create/cancel/reschedule | Overlap demonstrably blocked; back-to-back demonstrably allowed |
| **5 — Maintenance** | Request creation, approval workflow, status-driven asset transitions | Full Pending→Resolved cycle working |
| **6 — Audit** | Cycle creation, auditor marking, discrepancy report, close-cycle status updates | Full Planned→Closed cycle working |
| **7 — Dashboard, Reports, Notifications, Logs** | KPI aggregations, charts, notification center, activity log viewer | Everything visible and demoable |
| **8 — Polish** | Apply design tokens, empty/loading/error states, seed data, demo script rehearsal | Demo-ready build |

Prioritize Phases 0–4 first — they cover the two conflict rules the problem statement explicitly tests (allocation, booking). Phases 5–8 build out breadth once the core is solid.

## 3. Run Locally

### Prerequisites
- Node.js 20+
- MongoDB 7+ running locally **as a single-node replica set** (needed for transactions used in the allocate/book/close-audit flows) — or a free MongoDB Atlas cluster (Atlas is already replica-set by default, simplest path for a hackathon).

**Option A — Local MongoDB with replica set (one-time setup):**
```bash
mongod --dbpath ./data/db --replSet rs0 --port 27017 --bind_ip localhost &
mongosh --eval "rs.initiate()"
```

**Option B — MongoDB Atlas (simplest):** create a free cluster, allow-list your IP, copy the connection string into `MONGO_URI`.

### Backend
```bash
cd server
cp .env.example .env      # fill in MONGO_URI + JWT secrets
npm install
npm run seed               # creates demo departments, categories, users, sample assets
npm run dev                # starts on http://localhost:5000
```

### Frontend
```bash
cd client
cp .env.example .env       # VITE_API_BASE_URL=http://localhost:5000/api/v1
npm install
npm run dev                # starts on http://localhost:5173
```

Open **http://localhost:5173** — the full app runs entirely on localhost, no external services required.

## 4. Seed Data — Demo Login Credentials

The seed script (`server/seed/seed.js`) should create one account per role so every permission tier is demoable immediately after `npm run seed`:

| Role | Email | Password | Notes |
|---|---|---|---|
| Admin | `admin@assetflow.demo` | `Admin@123` | Full org setup access |
| Asset Manager | `manager@assetflow.demo` | `Manager@123` | Can register/allocate/approve maintenance |
| Department Head | `depthead@assetflow.demo` | `DeptHead@123` | Scoped to "Engineering" department |
| Employee | `employee@assetflow.demo` | `Employee@123` | Standard signup-equivalent account |

Seed script should also create:
- 2–3 departments (e.g., "Engineering", "Operations", parent/child relationship on one pair)
- 3–4 asset categories (Electronics, Furniture, Vehicles, with Electronics having a `warrantyPeriodMonths` custom field)
- 8–10 sample assets across categories, at least 2 marked `isBookable`, in a mix of statuses (`Available`, `Allocated`, `Under Maintenance`)
- 1 pre-existing allocation (so the double-allocation conflict is demoable immediately without manual setup)
- 1 pre-existing booking (so the overlap conflict is demoable immediately)

> Passwords above are for the hackathon demo environment only — never reuse these in a real deployment; rotate `JWT_*_SECRET` values and disable the seed script in any non-demo environment.

## 5. Demo Script (suggested run-through order)

1. **Login as Admin** → show Org Setup: create a department, a category, promote an Employee to Department Head.
2. **Login as Asset Manager** → register a new asset (auto Asset Tag + QR) → attempt to allocate the pre-seeded already-allocated asset → show the block + "currently held by" + Transfer Request CTA.
3. Approve the transfer → show history update on the asset detail page.
4. **Book a resource** → attempt an overlapping slot (blocked, shows conflicting time) → book a back-to-back slot (succeeds).
5. **Raise a maintenance request as Employee** → **approve as Asset Manager** (asset flips to Under Maintenance) → assign technician → resolve (asset flips back).
6. **Run an audit cycle**: create cycle, assign auditor, mark one asset Missing → close cycle → show asset status auto-updated to Lost + discrepancy report.
7. **Dashboard** tour: KPIs, overdue vs upcoming returns, notifications bell, Reports & Analytics charts, Activity Log.

## 6. Testing Priorities (if time allows)

- Supertest coverage for `POST /assets/:id/allocate` (conflict + success paths) and `POST /bookings` (overlap + back-to-back paths) — these are the two rules explicitly graded by the problem statement.
- Manual test matrix: each role logging in and confirming nav/action visibility matches §1 of the UI Flow doc.

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Race condition on concurrent allocate/book requests | Use transactions (replica-set Mongo) or atomic `findOneAndUpdate` status-guard fallback (see TRD §4.1–4.2) |
| Local MongoDB not running as replica set → transactions fail | Default to Atlas for the demo, or document the one-time `rs.initiate()` step (see §3) |
| Scope creep across 10 screens in limited hackathon time | Follow phase order in §2 — conflict rules and core CRUD before analytics/polish |
| Judges test edge cases live | Rehearse the exact demo script in §5, including the two conflict rejections, on the seeded data |
