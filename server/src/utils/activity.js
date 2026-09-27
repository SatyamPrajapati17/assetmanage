/**
 * Central activity-log + notification writer (App_Flow §9).
 * Every state-changing action writes exactly one ActivityLog entry and,
 * where relevant, Notification documents to the affected users.
 */
const mongoose = require('mongoose');

/**
 * Writes an ActivityLog entry. For server-initiated events (cron), the seed
 * script creates a "System" user; pass its id as actor. If actor is not a
 * valid ObjectId the write fails gracefully (never blocks the main flow).
 */
async function logActivity({ actor, action, entity, metadata }) {
  try {
    const ActivityLog = mongoose.model('ActivityLog');
    let actorId = null;
    if (actor) {
      const s = String(actor);
      if (/^[0-9a-fA-F]{24}$/.test(s)) actorId = s;
    }
    await ActivityLog.create({ actor: actorId, action, entity, metadata });
  } catch (err) {
    console.error('[activitylog] failed:', err.message);
  }
}

/** Creates a Notification; fails gracefully. */
async function notifyUser({ user, type, message, relatedEntity }) {
  try {
    if (!user) return;
    const s = String(user);
    if (!/^[0-9a-fA-F]{24}$/.test(s)) return;
    const Notification = mongoose.model('Notification');
    await Notification.create({ user: s, type, message, relatedEntity });
  } catch (err) {
    console.error('[notification] failed:', err.message);
  }
}

function notifyMany(users, payload) {
  (Array.isArray(users) ? users : [users]).forEach((u) => notifyUser({ ...payload, user: u }));
}

module.exports = { logActivity, notifyUser, notifyMany };
