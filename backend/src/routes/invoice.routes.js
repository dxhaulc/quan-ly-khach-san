const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoice.controller');
const { verifyToken, checkRole } = require('../middleware/auth');

const receptionRoles = ['Quản trị viên (Admin)', 'Quản lý chi nhánh (Manager)', 'Lễ tân (Receptionist)'];


router.get('/', verifyToken, checkRole(receptionRoles), invoiceController.getInvoices);
router.get('/:invoiceId', verifyToken, checkRole(receptionRoles), invoiceController.getInvoiceDetail);
router.patch("/:invoiceId/confirm-payment", verifyToken, checkRole(receptionRoles), invoiceController.confirmPayment);

module.exports = router;