const express = require('express');
const router = express.Router();
const roomController = require('../controllers/room.controller');
const { verifyToken, checkRole } = require('../middleware/auth');

const managementRoles = ['Quản trị viên (Admin)', 'Quản lý chi nhánh (Manager)'];
const receptionRoles = ['Lễ tân (Receptionist)'];


router.get('/', verifyToken, checkRole([...managementRoles, ...receptionRoles]), roomController.getRooms);

router.post('/', verifyToken, checkRole(managementRoles), roomController.createRoom);

router.put('/:id', verifyToken, checkRole(managementRoles), roomController.updateRoom);

router.delete('/:id', verifyToken, checkRole(managementRoles), roomController.deleteRoom);

module.exports = router;