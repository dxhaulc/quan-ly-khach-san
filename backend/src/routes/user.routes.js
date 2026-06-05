const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { verifyToken, checkRole } = require('../middleware/auth');

const adminRoles = ['Quản trị viên (Admin)'];


router.get('/', verifyToken, checkRole(adminRoles), userController.getUsers);
router.post('/', verifyToken, checkRole(adminRoles), userController.createUser);
router.put('/:id', verifyToken, checkRole(adminRoles), userController.updateUser);
router.put('/:id/reset-password', verifyToken, checkRole(adminRoles), userController.resetPassword);
router.delete('/:id', verifyToken, checkRole(adminRoles), userController.deleteUser);

module.exports = router;