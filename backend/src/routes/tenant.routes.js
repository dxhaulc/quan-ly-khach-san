const express = require("express");
const router = express.Router();
const tenantController = require("../controllers/tenant.controller");
const { verifyToken, checkRole } = require("../middleware/auth");

const adminRoles = ["Quản trị viên (Admin)"];

router.get("/", verifyToken, checkRole(adminRoles), tenantController.getTenant);
router.put("/", verifyToken, checkRole(adminRoles), tenantController.updateTenant);

module.exports = router;