const mongoose = require('mongoose');
const { ConflictError, NotFoundError, ValidationError } = require('../utils/errors');
const { runInTransaction, opts } = require('../utils/tx');
const { logActivity, notifyUser } = require('../utils/activity');

/**
 * Booking service — implements TRD §4.2 (no double-booking).
 * Overlap rule (Allen's interval algebra): two intervals overlap iff
 * existing.start < new.end AND existing.end > new.start. Back-to-back
 * (new.start === existing.end) is allowed.
 */

async function findOverlap({ resourceId, start, end, session, excludeBookingId }) {
  const Booking = mongoose.model('Booking');
  const filter = {
    resource: resourceId,
    status: { $in: ['Upcoming', 'Ongoing'] },
    start: { $lt: end },
    end: { $gt: start },
  };
  if (excludeBookingId) filter._id = { $ne: excludeBookingId };
  return Booking.findOne(filter).session(session);
}

function toConflictDetails(conflict) {
  return {
    conflict: {
      bookingId: String(conflict._id),
      start: conflict.start,
      end: conflict.end,
      status: conflict.status,
      purpose: conflict.purpose || null,
    },
  };
}

/** Create a booking with overlap validation inside a transaction. */
async function createBooking({ resource, bookedBy, onBehalfOfDepartment, start, end, purpose }) {
  if (!(start instanceof Date) || !(end instanceof Date)) {
    throw new ValidationError('start and end must be valid dates');
  }
  if (end <= start) throw new ValidationError('Booking end must be after start');

  return runInTransaction(async (session) => {
    const conflict = await findOverlap({ resourceId: resource._id, start, end, session });
    if (conflict) {
      throw new ConflictError(
        'BOOKING_OVERLAP',
        `Resource is already booked ${fmt(conflict.start)} → ${fmt(conflict.end)} (${conflict.status}). Pick a non-overlapping slot.`,
        toConflictDetails(conflict)
      );
    }
    const Booking = mongoose.model('Booking');
    const [booking] = await Booking.create(
      [{ resource: resource._id, bookedBy, onBehalfOfDepartment: onBehalfOfDepartment || null, start, end, purpose: purpose || null }],
      opts(session)
    );
    return booking;
  });
}

function fmt(d) {
  return new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** HTTP entry: POST /bookings */
async function create(req, res) {
  const { resourceId, start, end, purpose, onBehalfOfDepartment } = req.body;
  const Asset = mongoose.model('Asset');
  const resource = await Asset.findById(resourceId);
  if (!resource) throw new NotFoundError('Resource not found');
  if (!resource.isBookable) {
    throw new ValidationError(`Asset ${resource.assetTag} is not marked as bookable`);
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new ValidationError('start and end must be valid dates');
  }

  // Department-head "on behalf of" bookkeeping (FR-6; App_Flow §8).
  const behalf =
    req.user.role === 'departmentHead' && onBehalfOfDepartment
      ? onBehalfOfDepartment
      : req.user.role === 'departmentHead'
        ? req.user.department
        : null;

  const booking = await createBooking({
    resource,
    bookedBy: req.user.id,
    onBehalfOfDepartment: behalf,
    start: startDate,
    end: endDate,
    purpose,
  });

  notifyUser({
    user: req.user.id,
    type: 'BookingConfirmed',
    message: `Booking confirmed for ${resource.name}: ${fmt(booking.start)} → ${fmt(booking.end)}`,
    relatedEntity: { kind: 'Booking', id: booking._id },
  });
  logActivity({
    actor: req.user.id,
    action: 'BOOKING_CREATED',
    entity: { kind: 'Booking', id: booking._id },
    metadata: { resourceId: String(resource._id), resourceName: resource.name, start, end },
  });

  return res.status(201).json({ success: true, data: { booking }, message: 'Booking confirmed' });
}

/** HTTP entry: PATCH /bookings/:id (reschedule — re-runs overlap validation). */
async function reschedule(req, res) {
  const Booking = mongoose.model('Booking');
  const { start, end, purpose } = req.body;

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new NotFoundError('Booking not found');
  assertCanModify(req, booking);

  const newStart = start ? new Date(start) : booking.start;
  const newEnd = end ? new Date(end) : booking.end;
  if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) {
    throw new ValidationError('start/end must be valid dates');
  }
  if (newEnd <= newStart) throw new ValidationError('Booking end must be after start');

  const updated = await runInTransaction(async (session) => {
    const conflict = await findOverlap({
      resourceId: booking.resource,
      start: newStart,
      end: newEnd,
      session,
      excludeBookingId: booking._id,
    });
    if (conflict) {
      throw new ConflictError(
        'BOOKING_OVERLAP',
        `Reschedule blocked — resource is already booked ${fmt(conflict.start)} → ${fmt(conflict.end)}.`,
        toConflictDetails(conflict)
      );
    }
    booking.start = newStart;
    booking.end = newEnd;
    if (purpose !== undefined) booking.purpose = purpose;
    await booking.save(opts(session));
    return booking;
  });

  logActivity({
    actor: req.user.id,
    action: 'BOOKING_RESCHEDULED',
    entity: { kind: 'Booking', id: updated._id },
    metadata: { start: updated.start, end: updated.end },
  });

  return res.json({ success: true, data: { booking: updated }, message: 'Booking rescheduled' });
}

/** HTTP entry: POST /bookings/:id/cancel */
async function cancel(req, res) {
  const Booking = mongoose.model('Booking');
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new NotFoundError('Booking not found');
  assertCanModify(req, booking);
  if (booking.status === 'Cancelled') throw new ValidationError('Booking is already cancelled');
  if (booking.status === 'Completed') throw new ValidationError('Completed bookings cannot be cancelled');

  booking.status = 'Cancelled';
  booking.cancelledBy = req.user.id;
  booking.cancelReason = req.body.cancelReason || null;
  await booking.save();

  notifyUser({
    user: booking.bookedBy,
    type: 'BookingCancelled',
    message: `Your booking (${fmt(booking.start)} → ${fmt(booking.end)}) was cancelled`,
    relatedEntity: { kind: 'Booking', id: booking._id },
  });
  logActivity({
    actor: req.user.id,
    action: 'BOOKING_CANCELLED',
    entity: { kind: 'Booking', id: booking._id },
    metadata: { cancelReason: booking.cancelReason },
  });

  return res.json({ success: true, data: { booking }, message: 'Booking cancelled' });
}

function assertCanModify(req, booking) {
  const isOwner = String(booking.bookedBy) === String(req.user.id);
  const isManager = ['admin', 'assetManager'].includes(req.user.role);
  const isDeptHeadSameDept =
    req.user.role === 'departmentHead' &&
    booking.onBehalfOfDepartment &&
    String(booking.onBehalfOfDepartment) === String(req.user.department);
  if (!isOwner && !isManager && !isDeptHeadSameDept) {
    throw new ValidationError('You can only modify your own bookings (or your department\'s, if Department Head)');
  }
}

/** List bookings with optional filters. */
async function list(req, res) {
  const Booking = mongoose.model('Booking');
  const { page = 1, limit = 20 } = req.query;
  const filter = {};
  if (req.query.resource) filter.resource = req.query.resource;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.from || req.query.to) {
    filter.start = {};
    if (req.query.from) filter.start.$gte = new Date(req.query.from);
    if (req.query.to) filter.start.$lt = new Date(req.query.to);
  }
  if (['employee', 'departmentHead'].includes(req.user.role) && req.query.mine === 'true') {
    filter.bookedBy = req.user.id;
  }

  const [items, total] = await Promise.all([
    Booking.find(filter)
      .sort({ start: 1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .populate('resource', 'name assetTag isBookable')
      .populate('bookedBy', 'name email')
      .populate('onBehalfOfDepartment', 'name'),
    Booking.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    data: { items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) || 1 },
  });
}

module.exports = { createBooking, create, reschedule, cancel, list, findOverlap };
