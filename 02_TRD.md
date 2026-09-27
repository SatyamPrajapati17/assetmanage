# AssetFlow — Technical Requirements Document (TRD)

## 1. Architecture Overview

```
┌────────────────────┐      REST/JSON (HTTPS in prod, HTTP on localhost)     ┌──────────────────────┐
│   React Frontend    │  ───────────────────────────────────────────────►   │  Node.js / Express API │
│  (Vite, port 5173)  │  ◄───────────────────────────────────────────────   │   (port 5000)          │
└────────────────────┘                                                      └───────────┬───────────┘
                                                                                          │ Mongoose ODM
                                                                                          ▼
                                                                              ┌──────────────────────┐
                                                                              │   MongoDB (port 27017)│
                                                                              │  local or Atlas       │
                                                                              └──────────────────────┘
```

- **Frontend:** React 18 + Vite, React Router, Axios/Fetch, Context or Zustand for auth state, Tailwind CSS for styling (tokens in `DESIGN.md` if supplied).
- **Backend:** Node.js 20 LTS + Express 4, Mongoose 8 as the MongoDB ODM.
- **Database:** MongoDB 7 (local `mongod` or MongoDB Atlas free tier).
- **Auth:** JWT (access token ~15–60 min, refresh token ~7 days, httpOnly cookie or Authorization header — pick one and be consistent).
- **File uploads:** local `/uploads` disk storage via `multer` for the hackathon build (swap for S3-compatible storage in production).
- **Notifications:** in-app only (Mongo-stored `Notification` documents), no external push/email service required to run the demo.

## 2. Technology Stack Detail

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 20 LTS | |
| Web framework | Express 4 | REST API, JSON everywhere |
| ODM | Mongoose 8 | schema validation, middleware hooks, transactions |
| DB | MongoDB 7+ | replica-set mode required locally to use multi-document transactions (a single-node replica set is fine for dev — see Implementation Plan) |
| Auth | jsonwebtoken + bcryptjs | |
| Validation | zod or joi (request body validation) | |
| File upload | multer | disk storage, `/uploads` static-served |
| Scheduler | node-cron | overdue-flagging job, booking reminder job |
| Frontend | React 18 + Vite | |
| Styling | Tailwind CSS (+ tokens from `DESIGN.md` if present) | |
| State | React Context (auth) + local component state; React Query optional for server-state caching | |
| Charts | Recharts or Chart.js | for Reports & Analytics screen |
| QR | `qrcode` (server, to render) + `html5-qrcode` (client, optional scan) | |

## 3. API Design Principles

- Versioned base path: `/api/v1/...`
- Resource-oriented REST: `GET/POST /assets`, `GET/PATCH /assets/:id`, `POST /assets/:id/allocate`, etc.
- Every write endpoint requires `Authorization: Bearer <accessToken>` and is guarded by a role middleware (`requireRole(['admin','assetManager'])`), **not** enforced only in the UI.
- Standard response envelope:
```json
{ "success": true, "data": { }, "message": "" }
{ "success": false, "error": { "code": "ASSET_ALREADY_ALLOCATED", "message": "..." } }
```
- Pagination on list endpoints: `?page=1&limit=20&sort=-createdAt`.
- Filtering on list endpoints via query params mapped to indexed fields (`status`, `category`, `department`, `location`, `q` for text search).

## 4. Core Business Rules → Implementation

### 4.1 No Double-Allocation
- On `POST /assets/:id/allocate`:
  1. Start a MongoDB session/transaction.
  2. Re-read the asset with the session; if `status` is not `Available`, abort with `ASSET_ALREADY_ALLOCATED` and return current holder (populated).
  3. Otherwise create `Allocation` document, set `asset.status = 'Allocated'`, `asset.currentAllocation = allocation._id`, commit.
  4. On conflict, response includes `currentHolder` so the frontend can render the "currently held by X → Transfer Request" CTA (FR-5.2).
- Uses `findOneAndUpdate` with a status guard (`{ _id, status: 'Available' }`) as an atomicity fallback even without transactions (works on standalone Mongo too): if `matchedCount === 0`, treat as conflict.

### 4.2 No Double-Booking (Overlap Validation)
- Two intervals overlap iff `existing.start < new.end AND existing.end > new.start` (Allen's interval algebra — confirmed against current MongoDB scheduling guidance). Back-to-back (`new.start === existing.end`) is allowed.
- `POST /bookings`:
```js
const conflict = await Booking.findOne({
  resource: resourceId,
  status: { $in: ['Upcoming', 'Ongoing'] },
  start: { $lt: newEnd },
  end:   { $gt: newStart }
}).session(session);
if (conflict) throw new ConflictError('BOOKING_OVERLAP', conflict);
```
- Compound index `{ resource: 1, start: 1, end: 1 }` keeps this indexed (IXSCAN, not COLLSCAN).
- Wrap the conflict-check + insert in a transaction (or a unique partial index + retry) to close the race window between concurrent requests.

### 4.3 Maintenance State Machine
`Pending → (Asset Manager decision) → Approved → Technician Assigned → In Progress → Resolved`
`Pending → Rejected` (terminal)
- On `Approved`: asset `status = 'Under Maintenance'` (guarded — only if asset isn't already mid-transfer).
- On `Resolved`: asset `status = 'Available'` (unless it was `Allocated` pre-maintenance — store `preMaintenanceStatus` to restore correctly).

### 4.4 Audit Cycle Close
- `POST /audits/:id/close`:
  1. Verify all in-scope `AuditItem`s have a mark (or force-close with warning).
  2. For each `AuditItem` with `result: 'Missing'` → set linked `Asset.status = 'Lost'`.
  3. For `result: 'Damaged'` → set `Asset.status = 'Under Maintenance'` (or flag for a maintenance request to be raised).
  4. Set `AuditCycle.status = 'Closed'`, `closedAt`, lock further writes to its `AuditItem`s.

### 4.5 Overdue Detection
- `node-cron` job every 15 min (configurable) scans `Allocation` (status `Active`, `expectedReturnDate < now`) and `Booking` (status transitions `Upcoming → Ongoing → Completed` by wall clock) → flips flags, writes `Notification`s.
- Dashboard KPI queries can also compute "live" overdue counts on read via aggregation as a fallback/duplicate check.

## 5. Authentication & Authorization

- **Signup** (`POST /auth/signup`): creates `User` with `role: 'employee'` — server ignores/rejects any `role` field sent in the request body (defense against tampered payloads).
- **Login** (`POST /auth/login`): verify bcrypt hash, issue access + refresh JWT.
- **Role promotion** (`PATCH /employees/:id/role`): **admin-only** endpoint; this is the single code path that can ever change a user's role.
- **Middleware chain** per protected route: `authenticate` (verify JWT, attach `req.user`) → `requireRole([...])` → `requireDepartmentScope` (for Department Head endpoints, restrict query to `req.user.department`) → handler.
- **Password reset:** token stored hashed with expiry on `User.passwordResetToken/Expires`; for the demo, the reset link is logged to console/returned in API response instead of emailed (documented in Implementation Plan).

## 6. Error Handling & Validation

- Centralized Express error-handling middleware converts thrown `AppError` subclasses to the standard error envelope + correct HTTP status (400 validation, 401 auth, 403 role, 404 not found, 409 conflict for allocation/booking clashes, 500 fallback).
- All request bodies validated (zod/joi) before touching the DB layer.

## 7. Environment & Configuration

`.env` (backend):
```
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/assetflow
JWT_ACCESS_SECRET=change_me
JWT_REFRESH_SECRET=change_me_too
JWT_ACCESS_EXPIRES=45m
JWT_REFRESH_EXPIRES=7d
CLIENT_ORIGIN=http://localhost:5173
```

`.env` (frontend):
```
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

## 8. Non-Functional / Cross-Cutting

- **Indexes:** see Backend Schema doc §Indexes — every filter/search field and both overlap-check fields are indexed.
- **Logging:** request logging (morgan) in dev; Activity Log collection for business-level audit trail (separate from HTTP logs).
- **CORS:** locked to `CLIENT_ORIGIN` in dev.
- **Testing (stretch):** Jest/Supertest for the two conflict-critical endpoints (allocate, book) at minimum — these are the rules the problem statement explicitly tests.

## 9. Deployment Note (Hackathon Demo)

Runs entirely on `localhost` — no cloud deployment required. See Implementation Plan §"Run Locally" for exact commands, seed script, and demo credentials.
