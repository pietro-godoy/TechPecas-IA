const express = require('express');
const controller = require('../controllers/authController');
const { requireUser } = require('../middleware/authMiddleware');

const router = express.Router();
const {rateLimit}=require('../middleware/security');
const loginLimit=rateLimit({limit:10,windowMs:15*60*1000});

router.post('/register', loginLimit, controller.register);
router.post('/login', loginLimit, controller.login);
router.post('/logout', controller.logout);
router.get('/me', requireUser, controller.me);

module.exports = router;
