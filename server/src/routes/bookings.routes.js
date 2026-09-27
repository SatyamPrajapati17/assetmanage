const express = require('express');
const bookingService = require('../services/bookingService');
const { validate, z } = require('../middleware/validate');

const router = express.Router();

const BOOKING_SCHEMA = z.object({
  resourceId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid resource id'),
  start: z.string().min(4),
  end: z.string().min(4),
  purpose: z.string().optional().nullable(),
  onBehalfOfDepartment: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable(),
});

const RESCHEDULE_SCHEMA = z.object({
  start: z.string().min(4).optional(),
  end: z.string().min(4).optional(),
  purpose: z.string().optional().nullable(),
});

const CANCEL_SCHEMA = z.object({ cancelReason: z.string().optional().nullable() });

router.get('/', bookingService.list);
router.post('/', validate(BOOKING_SCHEMA), bookingService.create);
router.patch('/:id', validate(RESCHEDULE_SCHEMA), bookingService.reschedule);
router.post('/:id/cancel', validate(CANCEL_SCHEMA), bookingService.cancel);

module.exports = router;
