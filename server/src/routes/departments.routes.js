const express = require('express');
const Department = require('../models/Department');
const User = require('../models/User');
const { validate, objectId, z } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { ok, asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

const SCHEMA = z.object({
  name: z.string().min(2),
  head: objectId.optional().nullable(),
  parentDepartment: objectId.optional().nullable(),
  status: z.enum(['Active', 'Inactive']).default('Active'),
});

// Public read (needed on the signup screen for the department dropdown).
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const departments = await Department.find().sort({ name: 1 }).populate('head', 'name');
    return ok(res, { items: departments });
  })
);

router.post(
  '/',
  authenticate,
  requireRole('admin'),
  validate(SCHEMA),
  asyncHandler(async (req, res) => {
    const { name, head, parentDepartment, status } = req.body;
    if (head) {
      const headUser = await User.findById(head);
      if (!headUser) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Head user not found' } });
      }
    }
    const dept = await Department.create({ name, head: head || null, parentDepartment: parentDepartment || null, status });
    return ok(res, { department: dept }, 'Department created', 201);
  })
);

router.patch(
  '/:id',
  authenticate,
  requireRole('admin'),
  validate(SCHEMA.partial()),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const update = { ...req.body };
    if (update.parentDepartment && String(update.parentDepartment) === String(id)) {
      update.parentDepartment = null; // a department cannot be its own parent
    }
    ['head', 'parentDepartment'].forEach((k) => {
      if (update[k] === undefined) return;
      if (update[k] === '' || update[k] === null) update[k] = null;
    });
    const dept = await Department.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!dept) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Department not found' } });
    }
    return ok(res, { department: dept }, 'Department updated');
  })
);

router.delete(
  '/:id',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const User = require('../models/User');
    const Asset = require('../models/Asset');
    const deptId = req.params.id;
    const [users, assets, children] = await Promise.all([
      User.countDocuments({ department: deptId }),
      Asset.countDocuments({ department: deptId }),
      Department.countDocuments({ parentDepartment: deptId }),
    ]);
    if (users > 0 || assets > 0 || children > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DEPARTMENT_IN_USE',
          message: `Cannot delete — ${users} user(s), ${assets} asset(s), ${children} sub-department(s) reference it. Deactivate instead.`,
        },
      });
    }
    await Department.findByIdAndDelete(deptId);
    return ok(res, { message: 'Department deleted' });
  })
);

module.exports = router;
