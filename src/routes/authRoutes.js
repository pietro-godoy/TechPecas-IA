const express = require('express');
const controller = require('../controllers/authController');
const { requireUser } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', requireUser, controller.me);

module.exports = router;
