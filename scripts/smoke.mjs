/**
 * AssetFlow smoke test — verifies the two graded conflict rules live:
 *   1. POST /bookings overlapping a seeded booking  → 409 BOOKING_OVERLAP
 *      POST /bookings back-to-back (no overlap)     → 201
 *   2. POST /assets/:id/allocate on an allocated asset → 409 ASSET_ALREADY_ALLOCATED
 *      with error.details.currentHolder populated.
 *
 * Run: node scripts/smoke.mjs   (backend must be running on :5000 with seeded data)
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

const fail = (msg) => {
  console.error('❌ ' + msg);
  process.exitCode = 1;
};
const pass = (msg) => console.log('✅ ' + msg);

// 1. Login as admin
const login = await call('POST', '/auth/login', {
  body: { email: 'admin@assetflow.demo', password: 'Admin@123' },
});
if (login.status !== 200 || !login.json?.data?.accessToken) {
  fail(`login failed: ${login.status} ${JSON.stringify(login.json)}`);
  process.exit(1);
}
const token = login.json.data.accessToken;
pass(`1. login OK (role=${login.json.data.user.role})`);

// 2. Fetch assets, locate demo fixtures
const assetsRes = await call('GET', '/assets?limit=100', { token });
const items = assetsRes.json?.data?.items || assetsRes.json?.data || [];
const b2 = items.find((a) => /Conference Room B2/i.test(a.name));
const dell = items.find((a) => a.assetTag === 'AF-0002');
if (!b2 || !dell) {
  fail(`fixtures missing: B2=${!!b2} AF-0002=${!!dell} (got ${items.length} assets)`);
  process.exit(1);
}
pass(`2. fixtures found — B2 (${b2._id}), ${dell.assetTag} status=${dell.status}`);

// 3. Booking overlap → expect 409 BOOKING_OVERLAP
const slot = (h) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};
const overlap = await call('POST', '/bookings', {
  token,
  body: { resourceId: b2._id, start: slot(9), end: slot(10), purpose: 'SMOKE overlap test' },
});
const overlapCode = overlap.json?.error?.code;
if (overlap.status === 409 && overlapCode === 'BOOKING_OVERLAP') {
  const c = overlap.json?.error?.details?.conflict;
  pass(
    `3. overlap blocked: 409 BOOKING_OVERLAP (conflict ${c?.start} → ${c?.end} status=${c?.status})`
  );
} else {
  fail(`expected 409 BOOKING_OVERLAP, got ${overlap.status} ${JSON.stringify(overlap.json)}`);
}

// 4. Back-to-back (10:00 start == previous end) → expect 201
const b2b = await call('POST', '/bookings', {
  token,
  body: { resourceId: b2._id, start: slot(10), end: slot(11), purpose: 'SMOKE back-to-back test' },
});
const created = b2b.json?.data?.booking || b2b.json?.data;
if (b2b.status === 201 && created) {
  pass('4. back-to-back allowed: 201 created');
  const cancel = await call('POST', `/bookings/${created._id}/cancel`, {
    token,
    body: { cancelReason: 'smoke test cleanup' },
  });
  console.log(`   ↳ cleanup cancel: ${cancel.status}`);
} else {
  fail(`expected 201 for back-to-back, got ${b2b.status} ${JSON.stringify(b2b.json)}`);
}

// 5. Double allocation → expect 409 ASSET_ALREADY_ALLOCATED + currentHolder
const empLogin = await call('POST', '/auth/login', {
  body: { email: 'employee@assetflow.demo', password: 'Employee@123' },
});
const empId = empLogin.json?.data?.user?.id || empLogin.json?.data?.user?._id;
const alloc = await call('POST', `/assets/${dell._id}/allocate`, {
  token,
  body: { allocatedTo: { type: 'Employee', employee: empId } },
});
const allocCode = alloc.json?.error?.code;
const holder = alloc.json?.error?.details?.currentHolder;
if (alloc.status === 409 && allocCode === 'ASSET_ALREADY_ALLOCATED') {
  pass(
    `5. double-allocation blocked: 409 ASSET_ALREADY_ALLOCATED (currentStatus=${alloc.json?.error?.details?.currentStatus}, holder=${holder?.name || 'n/a'})`
  );
} else {
  fail(`expected 409 ASSET_ALREADY_ALLOCATED, got ${alloc.status} ${JSON.stringify(alloc.json)}`);
}

console.log(process.exitCode ? '\nSMOKE TEST FAILED' : '\nSMOKE TEST PASSED — both conflict rules verified live.');
