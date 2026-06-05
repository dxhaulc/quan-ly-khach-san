const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branch.controller');
const { verifyToken, checkRole } = require('../middleware/auth');

const adminRoles = ['Quản trị viên (Admin)'];

router.get('/all', verifyToken, checkRole(adminRoles), branchController.getAllBranchesDropdown);

router.get('/', verifyToken, checkRole(adminRoles), branchController.getBranches);
router.post('/', verifyToken, checkRole(adminRoles), branchController.createBranch);
router.put('/:id', verifyToken, checkRole(adminRoles), branchController.updateBranch);
router.delete('/:id', verifyToken, checkRole(adminRoles), branchController.deleteBranch);

module.exports = router;