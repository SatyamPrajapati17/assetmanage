# AssetFlow — Pitch Deck

> **The asset & resource ERP that finally knows where everything is — and who broke it first.**
>
> *Hackathon build · MERN · Two hard concurrency guarantees, proven live*

---

## Slide 1 — Title

# AssetFlow
### Enterprise Asset & Resource Management ERP

One system of record for every laptop, projector, van and conference room —
allocation, booking, maintenance, audits and governance in a single workflow.

**Live demo:** localhost:5173 (or the Vercel URL) · Seeded org with 10 assets, 8 users, 4 role accounts

---

## Slide 2 — The Problem

Enterprises track thousands of physical assets in spreadsheets, WhatsApp groups and sticky notes.

- **"Who has the Dell XPS?"** — Nobody knows. IT buys duplicates. Laptops vanish.
- **"Why is the conference room double-booked *again*?"** — Two people booked the same slot from two tabs.
- **"The audit says 14 assets are missing. Which ones, and since when?"** — No trail. No accountability.
- **Maintenance limbo** — A broken van sits for weeks because nobody owns the request after it's raised.

**The result:** shrinkage, duplicate spend, wasted hours, and zero auditability.

---

## Slide 3 — The Solution

**AssetFlow** is a role-based ERP that closes the loop on the full asset lifecycle:

```
Register → Allocate → Book → Maintain → Audit → Retire
    QR        guard    overlap  pipeline   cycle    status
```

- **Asset Directory** — QR-coded registry with categories, custom fields, photos, lifecycle statuses
- **Allocation & Transfers** — atomic hand-overs with return tracking and overdue flags
- **Resource Booking** — calendar with hard double-booking prevention
- **Maintenance Pipeline** — approval-gated state machine, technicians, resolution history
- **Audit Cycles** — scoped checklists, discrepancy reports, CSV export, auto status enforcement
- **Governance** — every action in an immutable activity log; KPIs scoped to your role

---

## Slide 4 — The Two Rules That Make It Real

Most demos fall apart when two users click at once. Ours doesn't.

### Rule 1 — No Double Allocation
`POST /assets/:id/allocate` flips the asset with a **guarded atomic update**
(`findOneAndUpdate({ _id, status: 'Available' }, { $set: { status: 'Allocated' } })`).
Two managers racing for the same laptop → **exactly one wins**.
The loser gets `409 ASSET_ALREADY_ALLOCATED` *with the current holder's name* and a
one-click path to a Transfer Request instead.

### Rule 2 — No Double Booking
Booking overlap uses **Allen's interval algebra**:
`existing.start < new.end AND existing.end > new.start` (back-to-back slots allowed).
Result: `409 BOOKING_OVERLAP` with the conflicting slot inline — *before* the booking is ever created.

**Both rules are verified live in this repo** — see `scripts/smoke.mjs` (login → conflict → 409 → assertion).

---

## Slide 5 — Engineering Under the Hood

| Layer | Tech | Highlights |
|---|---|---|
| API | Node + Express 4 + Mongoose 8 | 15 route families, envelope responses, zod validation |
| Data | MongoDB | 13 models, compound indexes (`{resource,start,end}`), counters for `AF-0001` tags |
| Transactions | `runInTransaction()` | Mongo transactions on replica sets, **auto-fallback to guarded atomic updates on standalone** — conflict rules safe either way |
| Concurrency | wrapRouter safety net | Express 4 async rejections can't kill the process |
| Auth | JWT access+refresh, bcrypt | 4 roles, server-enforced RBAC, role changes via exactly one admin-only endpoint |
| Background | node-cron | Overdue-return scan + booking status sync, catch-up on boot, on-read fallback |
| Client | React 18 + Vite + Tailwind 4 | 10 pages, role-scoped nav, conflict banners, CSV exports |
| Tests | `scripts/smoke.mjs`, `scripts/sanity.mjs`, `scripts/ui-test.mjs` | API conflict rules, 50+ endpoint sweep, headless-Chrome page crash detection |

**Defense in depth:** even without database transactions (standalone mongod), the status-guard
pattern keeps both conflict rules correct. The fallback isn't a downgrade — it's the same guarantee, cheaper.

---

## Slide 6 — Built for Four Kinds of People

| Role | Sees | Can Do |
|---|---|---|
| **Employee** | Own assets, bookable resources | Book rooms, raise maintenance, view own history |
| **Department Head** | Department assets & people | Book on behalf of the department, approve transfers in/out |
| **Asset Manager** | Everything operational | Allocate, return, approve maintenance, assign technicians, run audits |
| **Admin** | Governance | Org setup, categories & custom fields, **the only role-change path**, activity logs |

Navigation, dashboards and API permissions all degrade *down* — an employee hitting a
manager endpoint gets a clean `403`, never a broken screen.

---

## Slide 7 — The Demo (5 minutes)

1. **Login as Admin** (one-click quick-fill) → KPI dashboard, overdue chair in red
2. **Allocate Dell XPS to a second employee** → conflict banner: *"Currently held by Priya Sharma → Raise Transfer Request"*
3. **Book Conference Room B2, 09:00–10:00 tomorrow** → `BOOKING_OVERLAP` with the conflicting slot shown; book 10:00–11:00 → confirmed (back-to-back works)
4. **Raise a maintenance request as Employee → approve as Manager → assign technician → resolve** → asset status restored automatically
5. **Run an audit cycle** → mark an asset *Missing* → close cycle → asset flips to Lost, discrepancy CSV downloads
6. **Open Activity Logs** → every step above, attributed, in order

---

## Slide 8 — Why Teams Pick It (Differentiators)

- **Conflict-first design** — the hard parts (races, double-books) are guarantees, not best-efforts
- **Auditable by default** — one immutable log entry per state change, attributed to a user (or the System actor for cron)
- **Category-driven custom fields** — Electronics gets warranty & manufacturer; Furniture doesn't. No schema migration.
- **QR on every asset** — printable data-URL codes generated at registration; scan-to-resolve API
- **Reports with teeth** — utilization, maintenance frequency, nearing-retirement, department summary, booking heatmap — all CSV-exportable
- **Graceful everywhere** — forgot-password demo mode, uploads, fallbacks; nothing half-broken

---

## Slide 9 — Architecture

```
┌─────────────────────┐      /api/v1/*        ┌──────────────────────────┐
│  React 18 + Vite    │ ────────────────────▶ │  Express 4 API           │
│  Tailwind 4         │   JWT Bearer          │  zod-validated routes    │
│  10 role-scoped     │ ◀──────────────────── │  controllers → services  │
│  pages              │   {success,data|err}  │        │                 │
└─────────────────────┘                       ┌────────▼─────────────────┐
        ▲                                     │  Mongoose 8 models (13)  │
        │ QR / CSV / photos                   │  guarded updates + txns  │
        ▼                                     └────────┬─────────────────┘
   ActivityLog ◀── node-cron (overdue, booking sync) ──▶ MongoDB
```

Same-origin deployment on Vercel: static client + serverless API, zero CORS surface.

---

## Slide 10 — What We'd Build Next

- Email/SMS notifications (hooks already in place — `notifyUser()` is transport-agnostic)
- Native mobile scan-and-return flow (QR endpoints are ready)
- Depreciation & finance hooks (acquisition cost data already captured)
- SSO/SCIM for enterprise onboarding
- Barcode label printing in bulk

---

## Slide 11 — The Ask

We're looking for feedback on:
1. **Which vertical first?** IT hardware, facilities, or fleet — the data model already supports all three
2. **Deployment shape** — same-origin Vercel (this demo) vs. VPC + Atlas for regulated customers
3. **Pricing intuition** — per-seat, per-asset, or flat by org size?

---

## Appendix — Run It Yourself

```bash
cd server && cp .env.example .env && npm install && npm run seed && npm run dev
cd client && cp .env.example .env && npm install && npm run dev
# → http://localhost:5173   (demo credentials pre-seeded, one-click login)
node scripts/smoke.mjs     # proves both conflict rules live
node scripts/sanity.mjs    # 50+ endpoint sweep
node scripts/ui-test.mjs   # headless-Chrome crash sweep of all 8 pages
```

Demo accounts: `admin@assetflow.demo / Admin@123` · `manager@assetflow.demo / Manager@123`
`depthead@assetflow.demo / DeptHead@123` · `employee@assetflow.demo / Employee@123`
