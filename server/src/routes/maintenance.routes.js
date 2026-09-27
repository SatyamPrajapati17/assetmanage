const express = require('express');
const controller = require('../controllers/maintenance.controller');
const { validate, z } = require('../middleware/validate');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

const CREATE_SCHEMA = z.object({
  assetId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  issueDescription: z.string().min(5),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
  photo: z.string().optional().nullable(),
});

router.get('/', controller.list);
router.post('/', validate(CREATE_SCHEMA), controller.create);
router.get('/:id', controller.getOne);

router.post('/:id/approve', requireRole(['admin', 'assetManager']), controller.approve);
router.post(
  '/:id/reject',
  requireRole(['admin', 'assetManager']),
  validate(z.object({ rejectionReason: z.string().optional().nullable() })),
  controller.reject
);
router.post(
  '/:id/assign',
  requireRole(['admin', 'assetManager']),
  validate(z.object({ technicianId: z.string().optional(), technicianName: z.string().optional() })),
  controller.assignTechnician
);
router.post(
  '/:id/advance',
  validate(z.object({ resolutionNotes: z.string().optional().nullable() })),
  controller.advance
);

module.exports = router;
