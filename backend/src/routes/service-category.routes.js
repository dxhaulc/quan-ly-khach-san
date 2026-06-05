const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/service-category.controller');
const { verifyToken, checkRole } = require('../middleware/auth');

const managementRoles = ['Quản trị viên (Admin)', 'Quản lý chi nhánh (Manager)'];
const receptionRoles = ['Lễ tân (Receptionist)']

router.get('/', verifyToken, checkRole([...managementRoles, ...receptionRoles]), categoryController.getCategories);
router.post('/', verifyToken, checkRole(managementRoles), categoryController.createCategory);
router.put('/:id', verifyToken, checkRole(managementRoles), categoryController.updateCategory);
router.delete('/:id', verifyToken, checkRole(managementRoles), categoryController.deleteCategory);

module.exports = router;