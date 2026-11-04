const express = require('express');
const controller = require('../controllers/historyController');

const router = express.Router();

router.get('/', controller.list);
router.delete('/', controller.clear);

module.exports = router;
