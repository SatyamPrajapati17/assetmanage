/**
 * AssetFlow API sanity sweep — exercises every route family so boot/runtime
 * errors surface before the UI is opened. Complements scripts/smoke.mjs
 * (which verifies the two graded conflict rules).
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

let failures = 0;
const check = (name, r, okCodes = [200]) => {
  const good = okCodes.includes(r.status) && r.json?.success !== false;
  console.log(`${good ? '✅' : '❌'} ${name}: ${r.status}${good ? '' : ' ' + JSON.stringify(r.json).slice(0, 220)}`);
  if (!good) failures++;
};

// --- login all roles
const tokens = {};
for (const [role, email, pw] of [
  ['admin', 'admin@assetflow.demo', 'Admin@123'],
  ['manager', 'manager@assetflow.demo', 'Manager@123'],
  ['depthead', 'depthead@assetflow.demo', 'DeptHead@123'],
  ['employee', 'employee@assetflow.demo', 'Employee@123'],
]) {
  const r = await call('POST', '/auth/login', { body: { email, password: pw } });
  tokens[role] = r.json?.data?.accessToken;
  check(`login ${role}`, r);
}

const { admin, manager, depthead, employee } = tokens;

// --- reference data (public)
check('GET /departments', await call('GET', '/departments'));
check('GET /categories', await call('GET', '/categories'));

// --- assets
const assets = await call('GET', '/assets?limit=100', { token: admin });
check('GET /assets', assets);
const items = assets.json?.data?.items || [];
const dell = items.find((a) => a.assetTag === 'AF-0002');
check('GET /assets?status=Allocated', await call('GET', '/assets?status=Allocated', { token: admin }));
check('GET /assets?isBookable=true', await call('GET', '/assets?isBookable=true', { token: employee }));
check('GET /assets?q=dell', await call('GET', '/assets?q=dell', { token: admin }));
check('GET /assets/:id', dell ? await call('GET', `/assets/${dell._id}`, { token: admin }) : { status: 404, json: {} }, [200]);
if (dell) {
  check('GET /assets/:id/allocation-history', await call('GET', `/assets/${dell._id}/allocation-history`, { token: admin }));
  check('GET /assets/bookable', await call('GET', '/assets/bookable', { token: employee }));
}

// --- allocations
check('GET /allocations', await call('GET', '/allocations', { token: manager }));
check('GET /allocations?scope=all', await call('GET', '/allocations?scope=all', { token: admin }));
check('GET /allocations?overdue=true', await call('GET', '/allocations?overdue=true', { token: manager }));
check('GET /allocations?q=priya', await call('GET', '/allocations?q=priya', { token: manager }));
check('GET /allocations/mine', await call('GET', '/allocations/mine', { token: employee }));
check('GET /allocations (employee scope)', await call('GET', '/allocations', { token: employee }));

// --- bookings
const b2 = items.find((a) => /Conference Room B2/i.test(a.name));
check('GET /bookings', await call('GET', '/bookings', { token: admin }));
check('GET /bookings?mine=true (employee)', await call('GET', '/bookings?mine=true', { token: employee }));
const slot = (h, addDays = 2) => {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};
let mkBookingId = null;
if (b2) {
  const mk = await call('POST', '/bookings', {
    token: depthead,
    body: { resourceId: b2._id, start: slot(14), end: slot(15), purpose: 'sanity sweep' },
  });
  check('POST /bookings', mk, [201]);
  mkBookingId = mk.json?.data?.booking?._id;
  if (mkBookingId) {
    const rs = await call('PATCH', `/bookings/${mkBookingId}`, {
      token: depthead,
      body: { start: slot(16), end: slot(17) },
    });
    check('PATCH /bookings/:id (reschedule)', rs);
    const cx = await call('POST', `/bookings/${mkBookingId}/cancel`, { token: depthead, body: {} });
    check('POST /bookings/:id/cancel', cx);
  }
  // conflict demo still intact after reseed
  const ov = await call('POST', '/bookings', {
    token: admin,
    body: { resourceId: b2._id, start: slot(9, 1), end: slot(10, 1) },
  });
  check('POST /bookings overlap → 409', ov, [409]);
}

// --- dashboard + reports (all roles)
for (const t of ['admin', 'manager', 'depthead', 'employee']) {
  check(`GET /dashboard/summary (${t})`, await call('GET', '/dashboard/summary', { token: tokens[t] }));
}
for (const path of ['utilization', 'maintenance-frequency', 'nearing-retirement', 'department-summary', 'booking-heatmap']) {
  check(`GET /reports/${path}`, await call('GET', `/reports/${path}`, { token: admin }));
  const csv = await fetch(BASE + `/reports/${path}?format=csv`, { headers: { Authorization: `Bearer ${admin}` } });
  console.log(`${csv.ok ? '✅' : '❌'} GET /reports/${path}?format=csv: ${csv.status}`);
  if (!csv.ok) failures++;
}

// --- employees
check('GET /employees', await call('GET', '/employees', { token: admin }));
check('GET /employees (employee light)', await call('GET', '/employees', { token: employee }));

// --- maintenance
check('GET /maintenance', await call('GET', '/maintenance', { token: manager }));
const maint = await call('GET', '/maintenance', { token: manager });
const vanReq = maint.json?.data?.items?.[0];
if (vanReq) {
  check('GET /maintenance/:id', await call('GET', `/maintenance/${vanReq._id}`, { token: manager }));
}

// --- audits
check('GET /audits', await call('GET', '/audits', { token: admin }));

// --- transfers
check('GET /transfer-requests', await call('GET', '/transfer-requests', { token: manager }));

// --- notifications + logs
check('GET /notifications', await call('GET', '/notifications', { token: employee }));
check('GET /notifications/unread-count', await call('GET', '/notifications/unread-count', { token: employee }));
check('POST /notifications/read-all', await call('POST', '/notifications/read-all', { token: employee, body: {} }));
check('GET /activity-logs', await call('GET', '/activity-logs', { token: admin }));
check('GET /activity-logs (employee)', await call('GET', '/activity-logs', { token: employee }));

// --- auth extras
check('GET /auth/me', await call('GET', '/auth/me', { token: admin }));
const rfx = await call('POST', '/auth/refresh', { body: { refreshToken: 'bogus' } });
console.log(`${rfx.status === 401 ? '✅' : '❌'} POST /auth/refresh bogus → ${rfx.status} (expect 401)`);
if (rfx.status !== 401) failures++;

// --- RBAC negative tests
const empCreate = await call('POST', '/assets', { token: employee, body: { name: 'x' } });
console.log(`${empCreate.status === 403 ? '✅' : '❌'} employee POST /assets → ${empCreate.status} (expect 403)`);
if (empCreate.status !== 403) failures++;

console.log(failures ? `\nSANITY SWEEP: ${failures} FAILURE(S)` : '\nSANITY SWEEP PASSED — all endpoints healthy.');
process.exitCode = failures ? 1 : 0;
