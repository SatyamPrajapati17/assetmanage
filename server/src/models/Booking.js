const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema(
  {
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    onBehalfOfDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    purpose: { type: String, default: null },
    status: {
      type: String,
      enum: ['Upcoming', 'Ongoing', 'Completed', 'Cancelled'],
      default: 'Upcoming',
      index: true,
    },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelReason: { type: String, default: null },
    reminderSent: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'bookings' }
);

BookingSchema.index({ resource: 1, start: 1, end: 1 });
BookingSchema.index({ bookedBy: 1 });
BookingSchema.index({ status: 1, start: 1 });

module.exports = mongoose.model('Booking', BookingSchema);
