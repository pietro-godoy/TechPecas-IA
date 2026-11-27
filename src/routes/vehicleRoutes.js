const express = require('express');
const controller = require('../controllers/vehicleController');

const router = express.Router();
const {requireUser}=require('../middleware/authMiddleware');
router.use(requireUser);

router.get('/', controller.list);
router.post('/', controller.create);
router.delete('/:id', controller.remove);

module.exports = router;
