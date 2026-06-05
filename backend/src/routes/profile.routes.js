const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const { verifyToken } = require('../middleware/auth');

router.get('/', verifyToken, profileController.getMyProfile);
router.put('/', verifyToken, profileController.updateMyProfile);
router.put('/change-password', verifyToken, profileController.changeMyPassword);

module.exports = router;