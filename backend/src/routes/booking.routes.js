const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');
const { verifyToken, checkRole } = require('../middleware/auth');


const receptionRoles = ['Quản trị viên (Admin)', 'Quản lý chi nhánh (Manager)', 'Lễ tân (Receptionist)'];


router.get('/available-rooms', verifyToken, checkRole(receptionRoles), bookingController.getAvailableRooms);

router.post('/', verifyToken, checkRole(receptionRoles), bookingController.createBooking);
router.put('/:bookingId', verifyToken, checkRole(receptionRoles), bookingController.cancelBooking);

router.get('/services', verifyToken, checkRole(receptionRoles), bookingController.getHotelServices);
router.get('/details/:bookingDetailId/services', verifyToken, checkRole(receptionRoles), bookingController.getOrderedServices);
router.delete('/details/:bookingDetailId', verifyToken, checkRole(receptionRoles), bookingController.cancelRoomFromBooking);


router.put('/details/:bookingDetailId', verifyToken, checkRole(receptionRoles), bookingController.updateBookingDetail);
router.post('/details/:bookingDetailId/checkout', verifyToken, checkRole(receptionRoles), bookingController.checkoutBookingDetail);
router.post('/details/:bookingDetailId/checkout-now', verifyToken, checkRole(receptionRoles), bookingController.checkoutAndPayNow);

router.put('/details/:bookingDetailId/checkin', verifyToken, checkRole(receptionRoles), bookingController.checkinBookingDetail);
router.post('/:bookingId/rooms', verifyToken, checkRole(receptionRoles), bookingController.addRoomsToExistingBooking);
 
module.exports = router;

