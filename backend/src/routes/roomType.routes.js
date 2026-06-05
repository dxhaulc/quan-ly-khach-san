const express = require('express');
const router = express.Router();
const roomTypeController = require('../controllers/roomType.controller');
const { verifyToken, checkRole } = require('../middleware/auth');

const managementRoles = ['Quản trị viên (Admin)', 'Quản lý chi nhánh (Manager)'];

router.get('/', verifyToken, roomTypeController.getAllRoomTypes);

router.post('/', verifyToken, checkRole(managementRoles), roomTypeController.createRoomType);
router.put('/:id', verifyToken, checkRole(managementRoles), roomTypeController.updateRoomType);
router.delete('/:id', verifyToken, checkRole(managementRoles), roomTypeController.deleteRoomType);

module.exports = router;