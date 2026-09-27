const express = require('express');
const Notification = require('../models/Notification');
const { ok, asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/** GET /notifications — current user's notifications, unread first. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { limit = 30 } = req.query;
    const [items, unread] = await Promise.all([
      Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(Number(limit)),
      Notification.countDocuments({ user: req.user.id, read: false }),
    ]);
    return ok(res, { items, unread });
  })
);

/** GET /notifications/unread-count */
router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const unread = await Notification.countDocuments({ user: req.user.id, read: false });
    return ok(res, { unread });
  })
);

/** POST /notifications/:id/read */
router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await Notification.updateOne({ _id: req.params.id, user: req.user.id }, { $set: { read: true } });
    return ok(res, { message: 'Marked as read' });
  })
);

/** POST /notifications/read-all */
router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await Notification.updateMany({ user: req.user.id, read: false }, { $set: { read: true } });
    return ok(res, { message: 'All notifications marked as read' });
  })
);

module.exports = router;
