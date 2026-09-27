const express = require('express');
const ActivityLog = require('../models/ActivityLog');
const { validate, z } = require('../middleware/validate');
const { ok, asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * GET /activity-logs — Admin/Asset Manager: full log. Department Head: own
 * department's actors. Employee: own entries only (UI Flow nav matrix).
 */
router.get(
  '/',
  validate(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(30),
      actor: z.string().optional(),
      entityKind: z.string().optional(),
      entityId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      action: z.string().optional(),
    }),
    'query'
  ),
  asyncHandler(async (req, res) => {
    const { page, limit, actor, entityKind, entityId, from, to, action } = req.query;
    const filter = {};

    if (['admin', 'assetManager'].includes(req.user.role)) {
      if (actor) filter.actor = actor;
    } else if (req.user.role === 'departmentHead') {
      // dept scope: own entries + entries of department members
      const User = require('../models/User');
      const members = await User.find({ department: req.user.department }).select('_id');
      filter.actor = { $in: members.map((m) => m._id) };
      if (actor) filter.actor = actor; // refined within scope
    } else {
      filter.actor = req.user.id;
    }

    if (entityKind) filter['entity.kind'] = entityKind;
    if (entityId) filter['entity.id'] = entityId;
    if (action) filter.action = { $regex: action, $options: 'i' };
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) filter.timestamp.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const [items, total] = await Promise.all([
      ActivityLog.find(filter)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('actor', 'name email role'),
      ActivityLog.countDocuments(filter),
    ]);

    return ok(res, { items, total, page, pages: Math.ceil(total / limit) || 1 });
  })
);

module.exports = router;
