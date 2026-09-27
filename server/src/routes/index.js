const express = require('express');
const { authenticate } = require('../middleware/auth');
const wrapRouter = require('../utils/wrapRouter');

const router = express.Router();

router.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));

// Express 4 safety net: async handler rejections must reach errorHandler,
// not crash the process (bookings 409 path crashed the server live).
router.use('/auth', wrapRouter(require('./auth.routes')));
router.use('/employees', authenticate, wrapRouter(require('./employees.routes')));
router.use('/departments', wrapRouter(require('./departments.routes')));
router.use('/categories', wrapRouter(require('./categories.routes')));
router.use('/assets', wrapRouter(require('./assets.routes')));
router.use('/allocations', authenticate, wrapRouter(require('./allocations.routes')));
router.use('/transfer-requests', authenticate, wrapRouter(require('./transferRequests.routes')));
router.use('/bookings', authenticate, wrapRouter(require('./bookings.routes')));
router.use('/maintenance', authenticate, wrapRouter(require('./maintenance.routes')));
router.use('/audits', authenticate, wrapRouter(require('./audits.routes')));
router.use('/notifications', authenticate, wrapRouter(require('./notifications.routes')));
router.use('/activity-logs', authenticate, wrapRouter(require('./activityLogs.routes')));
router.use('/dashboard', authenticate, wrapRouter(require('./dashboard.routes')));
router.use('/reports', authenticate, wrapRouter(require('./reports.routes')));
router.use('/uploads', authenticate, wrapRouter(require('./uploads.routes')));

module.exports = router;
