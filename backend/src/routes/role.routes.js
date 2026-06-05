const express = require('express');
const router = express.Router();
const roleController = require('../controllers/role.controller');
const { verifyToken, checkRole } = require('../middleware/auth');

const adminRoles = ['Quản trị viên (Admin)'];

router.get('/all', verifyToken, checkRole(adminRoles), roleController.getAllRolesDropdown);

router.get('/', verifyToken, checkRole(adminRoles), roleController.getRoles);
router.post('/', verifyToken, checkRole(adminRoles), roleController.createRole);
router.put('/:id', verifyToken, checkRole(adminRoles), roleController.updateRole);
router.delete('/:id', verifyToken, checkRole(adminRoles), roleController.deleteRole);

module.exports = router;