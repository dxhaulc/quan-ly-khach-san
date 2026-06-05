const express = require('express');
const router = express.Router();
const receptionController = require('../controllers/reception.controller');
const { verifyToken, checkRole } = require('../middleware/auth');


const receptionRoles = ['Quản trị viên (Admin)', 'Quản lý chi nhánh (Manager)', 'Lễ tân (Receptionist)'];


router.get('/room-map', verifyToken, checkRole(receptionRoles), receptionController.getRoomMap);
router.get('/timeline', verifyToken, checkRole(receptionRoles), receptionController.getTimeline);
router.put('/rooms/:id/status', verifyToken, checkRole(receptionRoles), receptionController.toggleRoomCleaningStatus);

module.exports = router;