# AssetFlow — Enterprise Asset & Resource Management

A centralized ERP module for tracking, allocating, booking, and maintaining an organization's physical assets and shared resources. Built for the AssetFlow hackathon brief.

**Stack:** Node.js 20 + Express 4 + Mongoose 8 (MongoDB 7) · React 18 + Vite + Tailwind CSS 4 · JWT auth · node-cron jobs · Recharts reports

## Run Locally

### Prerequisites
- **Node.js 20+**
- **MongoDB 7+** — either local or a free MongoDB Atlas cluster

**Option A — Local MongoDB as a single-node replica set** (enables multi-document transactions; one-time setup):

```bash
mongod --dbpath ./data/db --replSet rs0 --port 27017 --bind_ip localhost &
mongosh --eval "rs.initiate()"
```

**Option B — Plain local MongoDB** (no replica set): works out of the box. The allocate/book/close-audit flows automatically fall back to atomic status-guard updates, so both conflict rules stay enforced. Use this connection string in `server/.env`:

```
MONGO_URI=mongodb://127.0.0.1:27017/assetflow
```

**Option C — MongoDB Atlas (simplest):** create a free cluster, allow-list your IP, copy the connection string into `MONGO_URI`.

### Backend

```bash
cd server
cp .env.example .env      # fill in MONGO_URI + JWT secrets
npm install
npm run seed              # creates demo departments, categories, users, sample assets
npm run dev               # starts on http://localhost:5000
```

### Frontend

```bash
cd client
cp .env.example .env      # VITE_API_BASE_URL=http://localhost:5000/api/v1
npm install
npm run dev               # starts on http://localhost:5173
```

Open **http://localhost:5173** — the full app runs entirely on localhost, no external services required.

## Demo Credentials (seeded by `npm run seed`)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@assetflow.demo` | `Admin@123` |
| Asset Manager | `manager@assetflow.demo` | `Manager@123` |
| Department Head | `depthead@assetflow.demo` | `DeptHead@123` |
| Employee | `employee@assetflow.demo` | `Employee@123` |

## What's Seeded

- 4 departments (Engineering, Operations, People & Facilities, QA Lab — with a parent/child pair)
- 3 asset categories (Electronics with a `warrantyPeriodMonths` custom field, Furniture, Vehicles)
- 10 assets across categories — 3 bookable (2 rooms + projector), in mixed statuses
- **Pre-existing allocation:** Dell XPS 15 is already allocated to Priya Sharma → try allocating it again to see the double-allocation conflict
- **Pre-existing booking:** Conference Room B2 is booked tomorrow 09:00–10:00 → try an overlapping slot to see the double-booking conflict
- An **overdue allocation** (chair, expected back 3 days ago) → shows in red on the Dashboard after the cron scan
- 1 maintenance request already In Progress

## Demo Script (the two conflict rules)

1. **Double-allocation:** log in as Asset Manager → Allocation & Transfer → transfer/allocate an already-`Allocated` asset → the API returns `409 ASSET_ALREADY_ALLOCATED` and the UI shows *"Currently held by Priya Sharma…"* with a **Transfer Request** CTA instead of a raw allocate path.
2. **Transfer approval:** approve the transfer in the Transfer Requests tab → the old allocation flips to `TransferredOut`, a new one opens, the asset stays `Allocated` with its holder updated.
3. **Double-booking:** Resource Booking → Conference Room B2 → attempt 09:30–10:30 tomorrow → `409 BOOKING_OVERLAP` with the conflicting time range inline → attempt 10:00–11:00 (back-to-back) → succeeds.
4. **Maintenance lifecycle:** raise a request as Employee → approve as Asset Manager (asset → *Under Maintenance*) → assign technician → start → resolve (asset restored).
5. **Audit lifecycle:** create a cycle (scope Engineering) as Admin → mark one asset *Missing* → close the cycle → asset status flips to *Lost* + discrepancy report exports to CSV.
6. **Dashboard:** KPIs are aggregation-backed; overdue returns appear ember-red; notifications bell fills as actions happen; Activity Logs record every state change.

## API

Base path: `/api/v1` — standard envelope `{ success, data | error }`. Highlights:

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/signup` (always Employee), `/auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`, `GET /auth/me` |
| Org | `GET/POST/PATCH/DELETE /departments`, `/categories`, `GET /employees`, `PATCH /employees/:id/role` (admin-only promotion) |
| Assets | `GET/POST /assets`, `GET /assets/:idOrTag`, `PATCH /assets/:id`, `PATCH /assets/:id/status`, `GET /assets/bookable` |
| Allocation | `POST /assets/:id/allocate` (409 + currentHolder on conflict), `GET /allocations`, `POST /allocations/:id/return` |
| Transfers | `POST /transfer-requests`, `GET /transfer-requests`, `POST /transfer-requests/:id/approve` (atomic re-allocation), `/reject` |
| Bookings | `POST /bookings` (409 BOOKING_OVERLAP + conflict details), `GET /bookings`, `PATCH /bookings/:id`, `POST /bookings/:id/cancel` |
| Maintenance | `POST /maintenance`, `GET /maintenance`, `POST /maintenance/:id/approve\|reject\|assign\|advance` |
| Audit | `POST /audits`, `GET /audits/:id`, `PATCH /audits/:id/items/:itemId`, `GET /audits/:id/discrepancy-report`, `POST /audits/:id/close` |
| Insights | `GET /dashboard/summary`, `/reports/utilization\|maintenance-frequency\|nearing-retirement\|department-summary\|booking-heatmap` |
| Platform | `GET /notifications`, `GET /activity-logs`, `POST /uploads` |

### The two conflict rules (server-enforced, not just UI)

- **No double-allocation** (`TRD §4.1`): `Asset.findOneAndUpdate({ _id, status: 'Available' }, { $set: { status: 'Allocated' } })` inside a Mongo transaction when available; `matchedCount === 0` ⇒ `409 ASSET_ALREADY_ALLOCATED` with the populated current holder. The atomic guard works on standalone mongod too.
- **No double-booking** (`TRD §4.2`): overlap query `status ∈ {Upcoming, Ongoing} AND start < newEnd AND end > newStart` (Allen's interval rule — back-to-back is allowed) backed by the `{ resource, start, end }` compound index, wrapped in the same transaction/fallback pattern.

## Notes

- Signup always creates an **Employee** — the server ignores any role field in the payload. Role changes happen only via `PATCH /employees/:id/role` (admin-only).
- Password-reset emails and booking reminders are **simulated** (console + in-app notifications) per the hackathon assumptions.
- Uploads are stored on local disk under `server/uploads` and served at `/uploads/*`.
- Cron jobs run every 15 min (configurable via `CRON_EXPRESSION`): overdue-allocation flagging + booking `Upcoming → Ongoing → Completed` sync, plus a catch-up pass on boot.

> Demo passwords are for the hackathon environment only — rotate `JWT_*_SECRET` values and disable the seed script in any real deployment.
