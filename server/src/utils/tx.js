const mongoose = require('mongoose');

/**
 * Runs `fn(session)` inside a MongoDB transaction when the deployment supports
 * it (replica set / Atlas). On a standalone mongod it falls back to `fn(null)`;
 * services pair this with atomic status-guard updates so the conflict rules
 * stay safe without transactions (TRD §4.1 fallback pattern).
 *
 * Standalone quirk (seen live): startSession() succeeds but the first command
 * inside a transaction fails with IllegalOperation ("Transaction numbers are
 * only allowed on a replica set member or mongos"). We therefore probe support
 * once per connection with an empty withTransaction() before ever running real
 * work, and always end sessions defensively.
 */

/** Connection → boolean (does this deployment actually support transactions?) */
const txSupport = new WeakMap();

function isTransactionUnsupported(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  return (
    err.code === 20 || // IllegalOperation
    err.code === 263 || // NoSuchTransaction / transient transaction error family
    msg.includes('Transaction numbers are only allowed') ||
    msg.includes('replica set member or mongos') ||
    msg.includes('does not support transactions') ||
    msg.includes('multi-document transactions') ||
    msg.includes('Sessions are not supported') ||
    msg.includes('given transaction/Session number is outdated')
  );
}

async function probeTransactions(conn, session) {
  if (txSupport.has(conn)) return txSupport.get(conn);
  try {
    // Empty transaction: the commit reaches the server, so a standalone
    // mongod rejects it here — before any real operation is at risk.
    await session.withTransaction(async () => {});
    txSupport.set(conn, true);
    return true;
  } catch (err) {
    // Any probe failure ⇒ transactions unusable on this deployment.
    // The fallback (guarded atomic updates) is safe by design, so degrade
    // quietly instead of failing requests.
    txSupport.set(conn, false);
    console.warn(
      `[tx] transactions unavailable ( ${(err && err.message) || err} ) — falling back to guarded updates`
    );
    return false;
  }
}

async function runInTransaction(fn) {
  const conn = mongoose.connection;
  if (!conn || conn.readyState !== 1 || typeof conn.startSession !== 'function') {
    return fn(null);
  }

  let session = null;
  try {
    // Mongoose's Connection#startSession returns a Promise when no callback is
    // given — go through the underlying driver client, whose startSession()
    // returns a real ClientSession synchronously.
    const client = conn.client || conn.$client || conn;
    if (!client || typeof client.startSession !== 'function') return fn(null);
    session = client.startSession({ causalConsistency: false });
  } catch {
    session = null; // sessions unsupported at the driver level
  }
  if (!session) return fn(null);

  const endSession = () => {
    try {
      if (session && typeof session.endSession === 'function') session.endSession();
    } catch {
      /* already ended — nothing to do */
    }
  };

  try {
    let supported;
    try {
      supported = await probeTransactions(conn, session);
    } catch (err) {
      throw err; // probe failed for a non-unsupported reason → surface it
    }
    if (!supported) return fn(null);

    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    if (isTransactionUnsupported(err)) {
      // Topology shifted mid-flight → safe fallback without a session.
      return fn(null);
    }
    throw err;
  } finally {
    endSession();
  }
}

/** Mongo options helper: attach session when present. */
function opts(session, extra = {}) {
  return session ? { session, ...extra } : { ...extra };
}

module.exports = { runInTransaction, opts, isTransactionUnsupported };
