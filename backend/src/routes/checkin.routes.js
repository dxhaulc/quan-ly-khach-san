const express = require("express");
const router = express.Router();
const checkInController = require("../controllers/checkin.controller");
const { verifyToken, checkRole } = require("../middleware/auth");

const receptionRoles = ["Quản trị viên (Admin)", "Quản lý chi nhánh (Manager)", "Lễ tân (Receptionist)"];

router.post("/", verifyToken, checkRole(receptionRoles), checkInController.addGuestToBookingDetail);

router.get("/booking-detail/:bookingDetailId", verifyToken, checkRole(receptionRoles), checkInController.getGuestsByBookingDetail);

router.get("/customer/:customerId", verifyToken, checkRole(receptionRoles), checkInController.getBookingDetailsByCustomer);

router.delete("/:bookingDetailId/:customerId", verifyToken, checkRole(receptionRoles), checkInController.removeGuestFromBookingDetail);

module.exports = router;