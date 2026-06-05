const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/service.controller');
const { verifyToken, checkRole } = require('../middleware/auth')

const managementRoles = ['Quản trị viên (Admin)', 'Quản lý chi nhánh (Manager)'];
const receptionRoles = ['Lễ tân (Receptionist)']

router.get('/', verifyToken, checkRole([...managementRoles, ... receptionRoles]), serviceController.getServices);
router.post('/', verifyToken, checkRole(managementRoles), serviceController.createService);
router.put('/:id', verifyToken, checkRole(managementRoles), serviceController.updateService);
router.delete('/:id', verifyToken, checkRole(managementRoles), serviceController.deleteService);

module.exports = router;