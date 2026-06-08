const { sql } = require("../config/db");

const getInvoices = async (req, res) => {
  const tenantId = req.tenantId;
  const branchId = req.headers["x-branch-id"];
  const {
    startDate,
    endDate,
    search,
    roomId,
    status,
    page = 1,
    limit = 10,
  } = req.query;

  if (!branchId) {
    return res.status(400).json({ message: "Thiếu thông tin chi nhánh." });
  }

  try {
    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("branchId", sql.Int, branchId);

    let whereConditions = ["i.TenantId = @tenantId", "b.BranchId = @branchId"];

    if (startDate && endDate) {
      const dStart = new Date(startDate);
      const dEnd = new Date(endDate);

      if (
        !isNaN(dStart) && dStart.getFullYear() <= 9999 &&
        !isNaN(dEnd) && dEnd.getFullYear() <= 9999
      ) {
        request.input("startDate", sql.DateTime, startDate + " 00:00:00");
        request.input("endDate", sql.DateTime, endDate + " 23:59:59");
        whereConditions.push("i.PaymentDate BETWEEN @startDate AND @endDate");
      }
    }

    if (search) {
      request.input("search", sql.NVarChar, `%${search}%`);
      whereConditions.push(
        "(c.FullName LIKE @search OR c.Phone LIKE @search OR u.FullName LIKE @search OR CAST(i.Id AS NVARCHAR(36)) LIKE @search OR CAST(i.BookingId AS NVARCHAR(36)) LIKE @search)",
      );
    }

    if (roomId && roomId !== "all") {
      request.input("roomId", sql.Int, roomId);
      whereConditions.push(
        "EXISTS (SELECT 1 FROM BookingDetails bd WHERE bd.BookingId = i.BookingId AND bd.RoomId = @roomId)",
      );
    }

    if (status && status !== "all") {
      request.input("status", sql.VarChar, status);
      whereConditions.push("LOWER(b.Status) = LOWER(@status)");
    }

    const whereClause = "WHERE " + whereConditions.join(" AND ");

    const countResult = await request.query(`
      SELECT COUNT(*) AS Total
      FROM Invoices i
      INNER JOIN Bookings b ON i.BookingId = b.Id
      LEFT JOIN Customers c ON b.CustomerId = c.Id
      LEFT JOIN Users u ON i.UserId = u.Id
      ${whereClause}
    `);
    const totalItems = countResult.recordset[0].Total;
    const totalPages = Math.ceil(totalItems / limit) || 1;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    request.input("offset", sql.Int, offset);
    request.input("limit", sql.Int, limit);

    const invoicesResult = await request.query(`
      SELECT 
          i.Id AS InvoiceId, i.RoomAmount, i.ServiceAmount, i.TotalAmount, i.TotalDiscount,
          i.PaymentMethod, i.PaymentDate, i.Note, b.Status, i.BookingId,
          c.FullName AS CustomerName, c.Phone AS CustomerPhone,
          u.FullName AS StaffName
      FROM Invoices i
      INNER JOIN Bookings b ON i.BookingId = b.Id
      LEFT JOIN Customers c ON b.CustomerId = c.Id
      LEFT JOIN Users u ON i.UserId = u.Id
      ${whereClause}
      ORDER BY i.PaymentDate DESC 
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      data: invoicesResult.recordset,
      pagination: { currentPage: parseInt(page), totalPages: totalPages },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi lấy danh sách hóa đơn." });
  }
};

const getInvoiceDetail = async (req, res) => {
  const { invoiceId } = req.params;
  const tenantId = req.tenantId;
  const branchId = req.headers["x-branch-id"];

  try {
    const request = new sql.Request();
    request.input("invoiceId", sql.UniqueIdentifier, invoiceId);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("branchId", sql.Int, branchId);

    const invoiceRes = await request.query(`
      SELECT i.*, c.FullName AS CustomerName, u.FullName AS StaffName, c.Phone AS CustomerPhone, b.DepositAmount, b.Note AS BookingNote, b.Status
      FROM Invoices i
      INNER JOIN Bookings b ON i.BookingId = b.Id
      LEFT JOIN Customers c ON b.CustomerId = c.Id
      LEFT JOIN Users u ON i.UserId = u.Id
      WHERE i.Id = @invoiceId AND i.TenantId = @tenantId AND b.BranchId = @branchId
    `);

    if (invoiceRes.recordset.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy hóa đơn hoặc bạn không có quyền truy cập.",
      });
    }

    const invoiceInfo = invoiceRes.recordset[0];
    const bookingId = invoiceInfo.BookingId;

    const roomsReq = new sql.Request();
    roomsReq.input("bookingId", sql.UniqueIdentifier, bookingId);

    const roomsRes = await roomsReq.query(`
      SELECT bd.Id AS BookingDetailId, r.RoomNumber, rt.TypeName, bd.ActualCheckIn, bd.ActualCheckOut, bd.RoomPrice, bd.DiscountValue, bd.DiscountType
      FROM BookingDetails bd
      INNER JOIN Rooms r ON bd.RoomId = r.Id
      INNER JOIN RoomTypes rt ON r.RoomTypeId = rt.Id
      WHERE bd.BookingId = @bookingId
    `);

    const servicesRes = await roomsReq.query(`
      SELECT so.Quantity, so.PriceAtTime, s.ServiceName, s.Unit, r.RoomNumber
      FROM ServiceOrders so
      INNER JOIN BookingDetails bd ON so.BookingDetailId = bd.Id
      INNER JOIN Rooms r ON bd.RoomId = r.Id
      INNER JOIN HotelServices s ON so.ServiceId = s.Id
      WHERE bd.BookingId = @bookingId
    `);

    const guestsRes = await roomsReq.query(`
      SELECT 
        bd.Id AS BookingDetailId,
        r.RoomNumber,
        c.FullName,
        c.IdCard
      FROM CheckIns ci
      INNER JOIN BookingDetails bd ON ci.BookingDetailId = bd.Id
      INNER JOIN Rooms r ON bd.RoomId = r.Id
      INNER JOIN Customers c ON ci.CustomerId = c.Id
      WHERE bd.BookingId = @bookingId
    `);

    res.json({
      invoice: invoiceInfo,
      rooms: roomsRes.recordset,
      services: servicesRes.recordset,
      guests: guestsRes.recordset,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi lấy chi tiết hóa đơn." });
  }
};

const confirmPayment = async (req, res) => {
  const { invoiceId } = req.params;
  const { paymentMethod } = req.body;
  const tenantId = req.tenantId;

  if (!paymentMethod) {
    return res
      .status(400)
      .json({ message: "Vui lòng chọn phương thức thanh toán." });
  }

  try {
    const request = new sql.Request();
    request.input("invoiceId", sql.UniqueIdentifier, invoiceId);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("paymentMethod", sql.NVarChar, paymentMethod);

    const invoiceRes = await request.query(`
      SELECT i.Id, i.BookingId
      FROM Invoices i
      INNER JOIN Bookings b ON i.BookingId = b.Id
      WHERE i.Id = @invoiceId AND i.TenantId = @tenantId
    `);

    if (invoiceRes.recordset.length === 0) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy hóa đơn hoặc không có quyền." });
    }

    const bookingId = invoiceRes.recordset[0].BookingId;
    request.input("bookingId", sql.UniqueIdentifier, bookingId);

    await request.query(`
      UPDATE Invoices
      SET PaymentMethod = @paymentMethod,
        PaymentDate   = GETUTCDATE()
      WHERE Id = @invoiceId
    `);

    await request.query(`
      UPDATE Bookings SET Status = 'Completed' WHERE Id = @bookingId
    `);

    res.status(200).json({ message: "Xác nhận thanh toán thành công!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi xác nhận thanh toán." });
  }
};

module.exports = { getInvoices, getInvoiceDetail, confirmPayment };
