const express = require('express');
const { summary } = require('../controllers/dashboard.controller');

const router = express.Router();

router.get('/summary', summary);

module.exports = router;
