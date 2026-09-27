const cron = require('node-cron');
const mongoose = require('mongoose');
const { logActivity, notifyUser } = require('../utils/activity');

// Ensure every schema is registered before jobs call mongoose.model(name).
require('../models');

/** Resolve the seeded "System" user to attribute server-initiated log entries. */
async function systemActorId() {
  try {
    const u = await mongoose.model('User').findOne({ email: 'system@assetflow.demo' }).select('_id');
    return u ? u._id : null;
  } catch {
    return null;
  }
}

/**
 * Background jobs (App_Flow §7, TRD §4.5):
 * - overdueScan: Allocation.status=Active AND expectedReturnDate < now → isOverdue=true
 *   + Notification (OverdueReturn) to holder + Asset Managers.
 * - bookingStatusSync: Upcoming → Ongoing (start <= now) → Completed (end <= now).
 * Cadence: every 15 min (configurable via CRON_EXPRESSION), plus a catch-up run
 * on boot and on-read live checks on the dashboard as fallback.
 */
function startJobs() {
  const expression = process.env.CRON_EXPRESSION || '*/15 * * * *';

  const overdueScan = async () => {
    try {
      const Allocation = mongoose.model('Allocation');
      const now = new Date();
      const sysId = await systemActorId();

      const overdue = await Allocation.find({
        status: 'Active',
        expectedReturnDate: { $lt: now },
        isOverdue: false,
      })
        .populate('asset', 'assetTag name')
        .populate('allocatedTo.employee', 'name email');

      if (!overdue.length) return;

      const managers = await mongoose
        .model('User')
        .find({ role: { $in: ['assetManager', 'admin'] }, status: 'Active' })
        .select('_id');

      for (const allocation of overdue) {
        allocation.isOverdue = true;
        await allocation.save();

        const tag = allocation.asset ? allocation.asset.assetTag : 'asset';
        const holder = allocation.allocatedTo && allocation.allocatedTo.employee;

        if (holder) {
          notifyUser({
            user: holder._id || holder,
            type: 'OverdueReturn',
            message: `Overdue: ${tag} was expected back by ${allocation.expectedReturnDate.toLocaleDateString()}`,
            relatedEntity: { kind: 'Allocation', id: allocation._id },
          });
        }
        managers.forEach((m) =>
          notifyUser({
            user: m._id,
            type: 'OverdueReturn',
            message: `Overdue return: ${tag}${holder && holder.name ? ` (held by ${holder.name})` : ''}`,
            relatedEntity: { kind: 'Allocation', id: allocation._id },
          })
        );

        logActivity({
          actor: sysId,
          action: 'ALLOCATION_OVERDUE_FLAGGED',
          entity: { kind: 'Allocation', id: allocation._id },
          metadata: { assetTag: tag },
        });
      }

      console.log(`[cron] overdueScan: flagged ${overdue.length} allocation(s)`);
    } catch (err) {
      console.error('[cron] overdueScan failed:', err.message);
    }
  };

  const bookingStatusSync = async () => {
    try {
      const Booking = mongoose.model('Booking');
      const now = new Date();

      const toOngoing = await Booking.updateMany(
        { status: 'Upcoming', start: { $lte: now }, end: { $gt: now } },
        { $set: { status: 'Ongoing' } }
      );
      const toCompleted = await Booking.updateMany(
        { status: { $in: ['Upcoming', 'Ongoing'] }, end: { $lte: now } },
        { $set: { status: 'Completed' } }
      );

      if (toOngoing.modifiedCount || toCompleted.modifiedCount) {
        console.log(
          `[cron] bookingStatusSync: →Ongoing ${toOngoing.modifiedCount}, →Completed ${toCompleted.modifiedCount}`
        );
      }
    } catch (err) {
      console.error('[cron] bookingStatusSync failed:', err.message);
    }
  };

  // Catch-up run right after boot, then the cadence.
  setTimeout(() => {
    overdueScan();
    bookingStatusSync();
  }, 1500);

  cron.schedule(expression, () => {
    overdueScan();
    bookingStatusSync();
  });

  console.log(`[cron] jobs scheduled "${expression}" (overdue scan + booking sync)`);
}

module.exports = { startJobs };
