const express = require('express');
const User = require('../models/User');
const { validate, objectId, z } = require('../middleware/validate');
const { requireRole } = require('../middleware/requireRole');
const { ok, asyncHandler } = require('../middleware/errorHandler');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logActivity } = require('../utils/activity');

const router = express.Router();

/**
 * GET /employees — directory list with search/filter/pagination.
 * Role visibility per UI Flow: Admin/Asset Manager see all; Department Head
 * sees their department; Employee sees a light directory (name/department).
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, q, department, role, status } = req.query;
    const filter = {};
    if (department) filter.department = department;
    if (role) filter.role = role;
    if (status) filter.status = status;

    if (req.user.role === 'departmentHead') {
      filter.department = req.user.department;
    }

    if (q) {
      filter.$or = [{ name: { $regex: q, $options: 'i' } }, { email: { $regex: q, $options: 'i' } }];
    }

    const select = ['admin', 'assetManager', 'departmentHead'].includes(req.user.role)
      ? 'name email role status department'
      : 'name department'; // employees see a minimal directory

    const [items, total] = await Promise.all([
      User.find(filter).select(select).sort({ name: 1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .populate('department', 'name'),
      User.countDocuments(filter),
    ]);

    return ok(res, { items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) || 1 });
  })
);

/**
 * PATCH /employees/:id/role — THE single code path that can ever change a
 * user's role (admin-only, TRD §5). Also toggles Active/Inactive and can move
 * a user between departments.
 */
router.patch(
  '/:id/role',
  requireRole('admin'),
  validate(
    z.object({
      role: z.enum(['employee', 'departmentHead', 'assetManager', 'admin']).optional(),
      status: z.enum(['Active', 'Inactive']).optional(),
      department: objectId.optional().nullable(),
    })
  ),
  asyncHandler(async (req, res) => {
    const target = await User.findById(req.params.id);
    if (!target) throw new NotFoundError('Employee not found');

    const { role, status, department } = req.body;

    if (role) {
      if (String(target._id) === String(req.user.id)) {
        throw new ValidationError('You cannot change your own role');
      }
      // Guard: an admin cannot demote themselves implicitly by editing others —
      // but promotion/demotion of anyone else is allowed.
      target.role = role;
    }
    if (status) target.status = status;
    if (department !== undefined) target.department = department || null;

    await target.save();

    if (role) {
      logActivity({
        actor: req.user.id,
        action: 'ROLE_CHANGED',
        entity: { kind: 'User', id: target._id },
        metadata: { from: target.role, to: role, email: target.email },
      });
    }

    return ok(res, { user: target.toJSON() }, role ? `Role updated to ${role}` : 'Employee updated');
  })
);

/** GET /employees/:id — full profile (managers+). */
router.get(
  '/:id',
  requireRole(['admin', 'assetManager', 'departmentHead']),
  asyncHandler(async (req, res) => {
    const target = await User.findById(req.params.id).populate('department', 'name');
    if (!target) throw new NotFoundError('Employee not found');
    if (
      req.user.role === 'departmentHead' &&
      String(target.department?._id || target.department) !== String(req.user.department)
    ) {
      throw new NotFoundError('Employee not in your department');
    }
    return ok(res, { user: target.toJSON() });
  })
);

module.exports = router;
