const express = require('express');
const router = express.Router();
const priceConfigController = require('../controllers/priceConfig.controller');
const { verifyToken, checkRole } = require('../middleware/auth');

const managementRoles = ['Quản trị viên (Admin)', 'Quản lý chi nhánh (Manager)'];


router.get('/', verifyToken, priceConfigController.getPriceConfigs);
router.put('/batch-update', verifyToken, checkRole(managementRoles), priceConfigController.updatePriceConfigs);

module.exports = router;