const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customer.controller');
const { verifyToken, checkRole } = require('../middleware/auth');

const receptionRoles = ['Quản trị viên (Admin)', 'Quản lý chi nhánh (Manager)', 'Lễ tân (Receptionist)'];
const adminRoles = ['Quản trị viên (Admin)', 'Quản lý chi nhánh (Manager)']; 

router.get('/search', verifyToken, checkRole(receptionRoles), customerController.searchCustomers);
router.post('/quick-add', verifyToken, checkRole(receptionRoles), customerController.createCustomerQuick);


router.get('/', verifyToken, checkRole(receptionRoles), customerController.getCustomers);

router.get('/:id', verifyToken, checkRole(receptionRoles), customerController.getCustomerById);

router.post('/', verifyToken, checkRole(receptionRoles), customerController.createCustomerQuick);

router.put('/:id', verifyToken, checkRole(receptionRoles), customerController.updateCustomer);

router.delete('/:id', verifyToken, checkRole(adminRoles), customerController.deleteCustomer);

module.exports = router;