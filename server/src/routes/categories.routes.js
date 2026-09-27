const express = require('express');
const AssetCategory = require('../models/AssetCategory');
const { validate, z } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { ok, asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

const FIELD = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'number', 'date', 'boolean']).default('text'),
});

const SCHEMA = z.object({
  name: z.string().min(2),
  customFields: z.array(FIELD).default([]),
  status: z.enum(['Active', 'Inactive']).default('Active'),
});

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const categories = await AssetCategory.find().sort({ name: 1 });
    return ok(res, { items: categories });
  })
);

router.post(
  '/',
  authenticate,
  requireRole('admin'),
  validate(SCHEMA),
  asyncHandler(async (req, res) => {
    const category = await AssetCategory.create(req.body);
    return ok(res, { category }, 'Category created', 201);
  })
);

router.patch(
  '/:id',
  authenticate,
  requireRole('admin'),
  validate(SCHEMA.partial()),
  asyncHandler(async (req, res) => {
    const category = await AssetCategory.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!category) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } });
    }
    return ok(res, { category }, 'Category updated');
  })
);

router.delete(
  '/:id',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const Asset = require('../models/Asset');
    const inUse = await Asset.countDocuments({ category: req.params.id });
    if (inUse > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CATEGORY_IN_USE',
          message: `Cannot delete — ${inUse} asset(s) use this category. Deactivate instead.`,
        },
      });
    }
    await AssetCategory.findByIdAndDelete(req.params.id);
    return ok(res, { message: 'Category deleted' });
  })
);

module.exports = router;
