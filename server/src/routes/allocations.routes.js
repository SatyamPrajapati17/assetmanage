const express = require('express');
const controller = require('../controllers/allocation.controller');
const allocationService = require('../services/allocationService');
const { validate, z } = require('../middleware/validate');

const router = express.Router();

router.get('/', controller.list);
router.get('/mine', controller.mine);
router.post(
  '/:id/return',
  validate(z.object({ returnConditionNotes: z.string().optional().nullable() })),
  allocationService.returnAllocation
);
router.get('/:id', async (req, res, next) => {
  // simple single-allocation fetch
  try {
    const Allocation = require('../models/Allocation');
    const allocation = await Allocation.findById(req.params.id)
      .populate('asset', 'name assetTag status location')
      .populate('allocatedTo.employee', 'name email')
      .populate('allocatedTo.department', 'name')
      .populate('allocatedBy', 'name');
    if (!allocation) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Allocation not found' } });
    }
    return res.json({ success: true, data: { allocation } });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
