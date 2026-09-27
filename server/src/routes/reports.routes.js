const express = require('express');
const controller = require('../controllers/reports.controller');

const router = express.Router();

// Employees get limited access (their data is naturally org-wide aggregates,
// refined client-side); Department Head gets dept-scoped views; Admin/Asset
// Manager get full reports (UI Flow nav matrix).
router.get('/utilization', controller.utilization);
router.get('/maintenance-frequency', controller.maintenanceFrequency);
router.get('/nearing-retirement', controller.nearingRetirement);
router.get('/department-summary', controller.departmentSummary);
router.get('/booking-heatmap', controller.bookingHeatmap);

module.exports = router;
