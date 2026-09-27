const express = require('express');
const controller = require('../controllers/transfer.controller');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

router.post('/', controller.create);
router.get('/', controller.list);
router.post('/:id/approve', requireRole(['admin', 'assetManager', 'departmentHead']), controller.approve);
router.post('/:id/reject', requireRole(['admin', 'assetManager', 'departmentHead']), controller.reject);

module.exports = router;
