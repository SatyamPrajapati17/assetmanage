const express = require('express');
const controller = require('../controllers/audit.controller');
const { validate, z } = require('../middleware/validate');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

const CREATE_SCHEMA = z.object({
  name: z.string().min(2),
  scope: z.object({
    departments: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).default([]),
    locations: z.array(z.string().min(1)).default([]),
  }),
  dateRange: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional()
    .nullable(),
  auditors: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).default([]),
});

const MARK_SCHEMA = z.object({
  result: z.enum(['Verified', 'Missing', 'Damaged']),
  note: z.string().optional().nullable(),
});

router.get('/', controller.list);
router.post('/', requireRole(['admin', 'assetManager']), validate(CREATE_SCHEMA), controller.create);
router.get('/:id', controller.getOne);
router.post('/:id/activate', requireRole(['admin', 'assetManager']), controller.activate);
router.patch('/:id/items/:itemId', validate(MARK_SCHEMA), controller.markItem);
router.get('/:id/discrepancy-report', controller.discrepancyReport);
router.post(
  '/:id/close',
  requireRole(['admin', 'assetManager']),
  validate(z.object({ force: z.boolean().optional().default(false) })),
  controller.close
);

module.exports = router;
