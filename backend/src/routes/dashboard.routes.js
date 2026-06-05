const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { verifyToken, checkRole } = require('../middleware/auth');

const managerRoles = ['Quản trị viên (Admin)', 'Quản lý chi nhánh (Manager)'];


router.get('/', verifyToken, checkRole(managerRoles), dashboardController.getDashboardData);

module.exports = router;