const { sql } = require("../config/db");

const addGuestToBookingDetail = async (req, res) => {
  const { bookingDetailId, customerId } = req.body;

  try {
    const request = new sql.Request();
    request.input("bookingDetailId", sql.UniqueIdentifier, bookingDetailId);
    request.input("customerId", sql.UniqueIdentifier, customerId);

    const checkDetail = await request.query(`
      SELECT Id FROM BookingDetails WHERE Id = @bookingDetailId
    `);
    if (checkDetail.recordset.length === 0)
      return res.status(404).json({ message: "Không tìm thấy chi tiết đặt phòng." });

    const checkCustomer = await request.query(`
      SELECT Id FROM Customers WHERE Id = @customerId
    `);
    if (checkCustomer.recordset.length === 0)
      return res.status(404).json({ message: "Không tìm thấy khách hàng." });

    const checkDuplicate = await request.query(`
      SELECT 1 FROM CheckIns WHERE BookingDetailId = @bookingDetailId AND CustomerId = @customerId
    `);
    if (checkDuplicate.recordset.length > 0)
      return res.status(400).json({ message: "Khách hàng đã được thêm vào phòng này." });

    await request.query(`
      INSERT INTO CheckIns (BookingDetailId, CustomerId)
      VALUES (@bookingDetailId, @customerId)
    `);

    res.status(201).json({ message: "Thêm khách vào phòng thành công." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi thêm khách vào phòng." });
  }
};

const getGuestsByBookingDetail = async (req, res) => {
  const { bookingDetailId } = req.params;

  try {
    const request = new sql.Request();
    request.input("bookingDetailId", sql.UniqueIdentifier, bookingDetailId);

    const result = await request.query(`
      SELECT c.Id, c.FullName, c.Phone, c.IdCard, c.Email
      FROM CheckIns ci
      INNER JOIN Customers c ON ci.CustomerId = c.Id
      WHERE ci.BookingDetailId = @bookingDetailId
    `);

    res.json({ data: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi lấy danh sách khách trong phòng." });
  }
};

const removeGuestFromBookingDetail = async (req, res) => {
  const { bookingDetailId, customerId } = req.params;

  try {
    const request = new sql.Request();
    request.input("bookingDetailId", sql.UniqueIdentifier, bookingDetailId);
    request.input("customerId", sql.UniqueIdentifier, customerId);

    const result = await request.query(`
      DELETE FROM CheckIns
      WHERE BookingDetailId = @bookingDetailId AND CustomerId = @customerId
    `);

    if (result.rowsAffected[0] === 0)
      return res.status(404).json({ message: "Không tìm thấy bản ghi để xóa." });

    res.json({ message: "Xóa khách khỏi phòng thành công." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi xóa khách khỏi phòng." });
  }
};

const getBookingDetailsByCustomer = async (req, res) => {
  const { customerId } = req.params;

  try {
    const request = new sql.Request();
    request.input("customerId", sql.UniqueIdentifier, customerId);

    const result = await request.query(`
      SELECT 
        bd.Id AS BookingDetailId,
        bd.RoomId,
        r.RoomNumber,
        bd.ExpectedCheckIn,
        bd.ExpectedCheckOut,
        bd.ActualCheckIn,
        bd.ActualCheckOut,
        bd.Status
      FROM CheckIns ci
      INNER JOIN BookingDetails bd ON ci.BookingDetailId = bd.Id
      INNER JOIN Rooms r ON bd.RoomId = r.Id
      WHERE ci.CustomerId = @customerId
      ORDER BY bd.ExpectedCheckIn DESC
    `);

    res.json({ data: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi lấy lịch sử phòng của khách." });
  }
};

module.exports = {
  addGuestToBookingDetail,
  getGuestsByBookingDetail,
  removeGuestFromBookingDetail,
  getBookingDetailsByCustomer,
};