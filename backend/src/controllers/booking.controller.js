const { sql } = require("../config/db");

const getAvailableRooms = async (req, res) => {
  const tenantId = req.tenantId;
  const branchId = req.headers["x-branch-id"];
  const { checkIn, checkOut } = req.query;

  if (!branchId || !checkIn || !checkOut) {
    return res
      .status(400)
      .json({ message: "Thiếu thông tin thời gian kiểm tra." });
  }

  try {
    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("branchId", sql.Int, branchId);
    request.input("checkIn", sql.DateTime, checkIn);
    request.input("checkOut", sql.DateTime, checkOut);

    const result = await request.query(`
      SELECT 
          r.Id AS RoomId, 
          r.RoomNumber, 
          rt.Id AS RoomTypeId, 
          rt.TypeName,
          
          PriceHour.Price AS PriceHour,
          PriceDay.Price AS PriceDay,
          PriceNight.Price AS PriceNight,
          
          PriceHourWE.Price AS PriceHourWeekend,
          PriceDayWE.Price AS PriceDayWeekend,
          PriceNightWE.Price AS PriceNightWeekend

      FROM Rooms r
      INNER JOIN RoomTypes rt ON r.RoomTypeId = rt.Id
      
      OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 1 AND DayType = 'weekday') AS PriceHour
      OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 2 AND DayType = 'weekday') AS PriceDay
      OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 3 AND DayType = 'weekday') AS PriceNight
      
      OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 1 AND DayType = 'weekend') AS PriceHourWE
      OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 2 AND DayType = 'weekend') AS PriceDayWE
      OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 3 AND DayType = 'weekend') AS PriceNightWE

      WHERE r.BranchId = @branchId 
        AND r.BranchId IN (SELECT Id FROM Branches WHERE TenantId = @tenantId) 
        AND r.IsDelete = 0 
        AND rt.IsDelete = 0
        AND r.Id NOT IN (
            SELECT bd.RoomId 
            FROM BookingDetails bd
            INNER JOIN Bookings b ON bd.BookingId = b.Id
            WHERE b.BranchId = @branchId
              AND bd.Status NOT IN ('Cancelled', 'Completed') 
              AND DATEADD(minute, -30, bd.ExpectedCheckIn) < @checkOut
              AND DATEADD(minute, 30, bd.ExpectedCheckOut) > @checkIn
        )
      ORDER BY r.RoomNumber
    `);

    const roomsByType = result.recordset.reduce((acc, room) => {
      if (!acc[room.TypeName]) {
        acc[room.TypeName] = { typeId: room.RoomTypeId, rooms: [] };
      }
      acc[room.TypeName].rooms.push(room);
      return acc;
    }, {});

    res.json({ data: roomsByType });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi lấy danh sách phòng trống." });
  }
};

const createBooking = async (req, res) => {
  const tenantId = req.tenantId;
  const branchId = req.headers["x-branch-id"];
  const userId = req.userId || (req.user && req.user.id) || null;

  const { customerId, rooms, depositAmount, status, note } = req.body;

  if (!branchId || !rooms || rooms.length === 0) {
    return res.status(400).json({ message: "Dữ liệu không hợp lệ." });
  }

  const transaction = new sql.Transaction();

  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("branchId", sql.Int, branchId);

    for (const room of rooms) {
      const checkReq = new sql.Request(transaction);
      checkReq.input("roomId", sql.Int, room.roomId);
      checkReq.input("checkIn", sql.DateTime, room.checkIn);
      checkReq.input("checkOut", sql.DateTime, room.checkOut);

      const overlap = await checkReq.query(`
        SELECT TOP 1 bd.Id 
        FROM BookingDetails bd
        INNER JOIN Bookings b ON bd.BookingId = b.Id
        WHERE bd.RoomId = @roomId 
          AND bd.Status NOT IN ('Cancelled', 'Completed')
          AND DATEADD(minute, -30, bd.ExpectedCheckIn) < @checkOut
          AND DATEADD(minute, 30, bd.ExpectedCheckOut) > @checkIn
      `);

      if (overlap.recordset.length > 0) {
        throw new Error(
          `Phòng bị trùng lịch với một đơn khác vừa được tạo. Vui lòng tải lại trang!`,
        );
      }
    }

    const bookingStatus = status === "InUse" ? "CheckedIn" : "Pending";
    request.input("customerId", sql.UniqueIdentifier, customerId || null);
    request.input("bookingStatus", sql.VarChar, bookingStatus);
    request.input("depositAmount", sql.Decimal(18, 2), depositAmount || 0);
    request.input("note", sql.NVarChar, note || "");


    const newBooking = await request.query(`
      INSERT INTO Bookings (TenantId, BranchId, CustomerId, Status, DepositAmount, CreateAt, Note)
      OUTPUT INSERTED.Id
      VALUES (@tenantId, @branchId, @customerId, @bookingStatus, @depositAmount, GETUTCDATE(), @note)
    `);
    const bookingId = newBooking.recordset[0].Id;

    for (const room of rooms) {
      const roomReq = new sql.Request(transaction);
      roomReq.input("bookingId", sql.UniqueIdentifier, bookingId);
      roomReq.input("roomId", sql.Int, room.roomId);
      roomReq.input("inTime", sql.DateTime, room.checkIn);
      roomReq.input("outTime", sql.DateTime, room.checkOut);
      roomReq.input(
        "actualIn",
        sql.DateTime,
        status === "InUse" ? new Date() : null,
      );
      roomReq.input("note", sql.NVarChar, note || "");
      roomReq.input("status", sql.VarChar, status);
      roomReq.input("price", sql.Decimal(18, 2), room.price);
      roomReq.input("adult", sql.Int, room.adult || 2);
      roomReq.input("child", sql.Int, room.child || 0);
      roomReq.input("priceType", sql.VarChar(20), room.priceType || "day");
      roomReq.input(
        "discountValue",
        sql.Decimal(18, 2),
        room.discountValue || 0,
      );
      roomReq.input(
        "discountType",
        sql.VarChar(10),
        room.discountType || "VND",
      );

      await roomReq.query(`
        INSERT INTO BookingDetails (
            BookingId, RoomId, ExpectedCheckIn, ExpectedCheckOut, ActualCheckIn, 
            Note, Status, RoomPrice, AdultCount, ChildrenCount,
            PriceType, DiscountValue, DiscountType
        )
        VALUES (
            @bookingId, @roomId, @inTime, @outTime, @actualIn, 
            @note, @status, @price, @adult, @child,
            @priceType, @discountValue, @discountType
        )
      `);

      if (status === "InUse") {
        await roomReq.query(
          `UPDATE Rooms SET Status = 'Occupied' WHERE Id = @roomId`,
        );
      }
    }

    await transaction.commit();
    res
      .status(200)
      .json({ message: "Tạo đơn thành công!", bookingId: bookingId });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res
      .status(400)
      .json({ message: error.message || "Lỗi hệ thống khi tạo đơn." });
  }
};

const cancelBooking = async (req, res) => {
  const { bookingId } = req.params;
  const tenantId = req.tenantId;

  const transaction = new sql.Transaction();
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    request.input("bookingId", sql.UniqueIdentifier, bookingId);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    await request.query(`
      UPDATE Bookings SET Status = 'Cancelled'
      WHERE Id = @bookingId
    `);

    await request.query(`
      DELETE FROM CheckIns
      WHERE BookingDetailId IN (
        SELECT Id FROM BookingDetails WHERE BookingId = @bookingId
      )
    `);

    await request.query(`
      DELETE FROM ServiceOrders
      WHERE BookingDetailId IN (
        SELECT Id FROM BookingDetails WHERE BookingId = @bookingId
      )
    `);

    await request.query(`
      DELETE FROM BookingDetails WHERE BookingId = @bookingId
    `);

    await transaction.commit();
    res.status(200).json({ message: "Đã hủy đơn thành công!" });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ message: error.message || "Lỗi hệ thống khi hủy đơn." });
  }
};

const getHotelServices = async (req, res) => {
  const tenantId = req.tenantId;
  try {
    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    const result = await request.query(`
      SELECT 
          s.Id, s.ServiceName, s.Unit, s.Price, s.ImageUrl,
          c.Id AS CategoryId, c.Name AS CategoryName
      FROM HotelServices s
      LEFT JOIN ServiceCategories c ON s.CategoryId = c.Id
      WHERE s.TenantId = @tenantId AND s.IsDelete = 0
      ORDER BY c.Name, s.ServiceName
    `);

    res.json({ data: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi lấy danh sách dịch vụ." });
  }
};

const getOrderedServices = async (req, res) => {
  const { bookingDetailId } = req.params;
  const tenantId = req.tenantId;
  try {
    const request = new sql.Request();
    request.input("bookingDetailId", sql.UniqueIdentifier, bookingDetailId);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    const result = await request.query(`
      SELECT so.Id AS OrderId, so.Quantity, so.PriceAtTime, s.Id AS ServiceId, s.ServiceName, s.Unit
      FROM ServiceOrders so
      INNER JOIN HotelServices s ON so.ServiceId = s.Id
      INNER JOIN BookingDetails bd ON so.BookingDetailId = bd.Id
      INNER JOIN Bookings b ON bd.BookingId = b.Id
      WHERE so.BookingDetailId = @bookingDetailId AND b.TenantId = @tenantId
    `);

    res.json({ data: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi lấy chi tiết dịch vụ đã gọi." });
  }
};

const cancelRoomFromBooking = async (req, res) => {
  const { bookingDetailId } = req.params;
  const tenantId = req.tenantId;

  const transaction = new sql.Transaction();
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    request.input("bookingDetailId", sql.UniqueIdentifier, bookingDetailId);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    const detailInfo = await request.query(`
      SELECT bd.RoomId 
      FROM BookingDetails bd
      INNER JOIN Bookings b ON bd.BookingId = b.Id
      WHERE bd.Id = @bookingDetailId AND b.TenantId = @tenantId
    `);

    if (detailInfo.recordset.length === 0) {
      throw new Error("Không tìm thấy chi tiết phòng hoặc bạn không có quyền thao tác!");
    }
    const roomId = detailInfo.recordset[0].RoomId;

    await request.query(`
      DELETE FROM CheckIns WHERE BookingDetailId = @bookingDetailId
    `);

    await request.query(`
      DELETE FROM ServiceOrders WHERE BookingDetailId = @bookingDetailId
    `);

    await request.query(`
      DELETE FROM BookingDetails WHERE Id = @bookingDetailId
    `);

    const roomReq = new sql.Request(transaction);
    roomReq.input("roomId", sql.Int, roomId);
    await roomReq.query(`
      UPDATE Rooms SET Status = 'Available' WHERE Id = @roomId
    `);

    await transaction.commit();
    res.status(200).json({ message: "Đã xóa phòng khỏi đơn thành công!" });
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(400).json({ message: err.message || "Lỗi khi hủy phòng." });
  }
};

const updateBookingDetail = async (req, res) => {
  const { bookingDetailId } = req.params;
  const tenantId = req.tenantId;
  const {
    checkOut,
    roomPrice,
    services,
    priceType,
    discountValue,
    discountType,
  } = req.body;

  const transaction = new sql.Transaction();
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    request.input("bookingDetailId", sql.UniqueIdentifier, bookingDetailId);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("checkOut", sql.DateTime, checkOut);
    request.input("roomPrice", sql.Decimal(18, 2), roomPrice);
    request.input("priceType", sql.VarChar(20), priceType || "day");
    request.input("discountValue", sql.Decimal(18, 2), discountValue || 0);
    request.input("discountType", sql.VarChar(10), discountType || "VND");

    const checkOwner = await request.query(`
      SELECT bd.Id, bd.RoomId, bd.ExpectedCheckIn 
      FROM BookingDetails bd
      INNER JOIN Bookings b ON bd.BookingId = b.Id
      WHERE bd.Id = @bookingDetailId AND b.TenantId = @tenantId
    `);
    if (checkOwner.recordset.length === 0)
      throw new Error("Không có quyền thao tác!");

    const currentBooking = checkOwner.recordset[0];

    request.input("roomId", sql.Int, currentBooking.RoomId);
    request.input("checkIn", sql.DateTime, currentBooking.ExpectedCheckIn);

    const overlap = await request.query(`
      SELECT TOP 1 bd.Id 
      FROM BookingDetails bd
      INNER JOIN Bookings b ON bd.BookingId = b.Id
      WHERE bd.RoomId = @roomId 
        AND bd.Id != @bookingDetailId
        AND bd.Status NOT IN ('Cancelled', 'Completed')
        AND DATEADD(minute, -30, bd.ExpectedCheckIn) < @checkOut
        AND DATEADD(minute, 30, bd.ExpectedCheckOut) > @checkIn
    `);

    if (overlap.recordset.length > 0) {
      throw new Error(
        "Việc gia hạn/đổi giờ bị trùng lịch với một đơn đặt phòng khác sắp tới!",
      );
    }

    await request.query(`
      UPDATE BookingDetails 
      SET ExpectedCheckOut = @checkOut, 
          RoomPrice = @roomPrice,
          PriceType = @priceType,
          DiscountValue = @discountValue,
          DiscountType = @discountType
      WHERE Id = @bookingDetailId
    `);

    if (services && services.length > 0) {
      const currentServiceIds = services
        .map((s) => Number(s.ServiceId))
        .join(",");

      const deleteReq = new sql.Request(transaction);
      deleteReq.input("bookingDetailId", sql.UniqueIdentifier, bookingDetailId);
      await deleteReq.query(`
        DELETE FROM ServiceOrders 
        WHERE BookingDetailId = @bookingDetailId 
        AND ServiceId NOT IN (${currentServiceIds})
      `);

      for (const svc of services) {
        const svcReq = new sql.Request(transaction);
        svcReq.input("bookingDetailId", sql.UniqueIdentifier, bookingDetailId);
        svcReq.input("serviceId", sql.Int, svc.ServiceId);
        svcReq.input("quantity", sql.Int, svc.Quantity);
        svcReq.input("price", sql.Decimal(18, 2), svc.Price);

        const updateResult = await svcReq.query(`
          UPDATE ServiceOrders 
          SET Quantity = @quantity, 
            PriceAtTime = @price 
          WHERE BookingDetailId = @bookingDetailId 
            AND ServiceId = @serviceId
        `);

        if (updateResult.rowsAffected[0] === 0) {
          await svcReq.query(`
            INSERT INTO ServiceOrders (BookingDetailId, ServiceId, Quantity, PriceAtTime)
            VALUES (@bookingDetailId, @serviceId, @quantity, @price)
          `);
        }
      }
    } else {
      const deleteAllReq = new sql.Request(transaction);
      deleteAllReq.input(
        "bookingDetailId",
        sql.UniqueIdentifier,
        bookingDetailId,
      );
      await deleteAllReq.query(`
        DELETE FROM ServiceOrders WHERE BookingDetailId = @bookingDetailId
      `);
    }

    await transaction.commit();
    res.status(200).json({ message: "Đã lưu cập nhật thành công!" });
  } catch (error) {
    await transaction.rollback();
    console.error(error.message);
    res
      .status(500)
      .json({ message: error.message || "Lỗi hệ thống khi cập nhật." });
  }
};

const checkoutBookingDetail = async (req, res) => {
  const { bookingDetailId } = req.params;
  const {
    paymentMethod,
    roomAmount,
    serviceAmount,
    totalAmount,
    discountValue,
    discountType,
  } = req.body;
  const tenantId = req.tenantId;
  const branchId = req.headers["x-branch-id"];
  const userId = req.userId || (req.user && req.user.id) || null;

  const transaction = new sql.Transaction();
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    request.input("bookingDetailId", sql.UniqueIdentifier, bookingDetailId);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    const detailInfo = await request.query(`
      SELECT bd.RoomId, bd.BookingId, b.DepositAmount 
      FROM BookingDetails bd
      INNER JOIN Bookings b ON bd.BookingId = b.Id
      WHERE bd.Id = @bookingDetailId AND b.TenantId = @tenantId
    `);

    if (detailInfo.recordset.length === 0)
      throw new Error("Không tìm thấy đơn hoặc không có quyền thao tác!");

    const roomId = detailInfo.recordset[0].RoomId;
    const bookingId = detailInfo.recordset[0].BookingId;
    const depositAmount = detailInfo.recordset[0].DepositAmount || 0;

    request.input("roomAmount", sql.Decimal(18, 2), roomAmount);
    request.input("discountVal", sql.Decimal(18, 2), discountValue || 0);
    request.input("discountTyp", sql.VarChar(10), discountType || "VND");

    await request.query(`
      UPDATE BookingDetails 
      SET Status = 'Completed', 
          ActualCheckOut = GETUTCDATE(),
          RoomPrice = @roomAmount,
          DiscountValue = @discountVal,
          DiscountType = @discountTyp
      WHERE Id = @bookingDetailId
    `);

      const stockReq = new sql.Request(transaction);
    stockReq.input("bookingDetailId", sql.UniqueIdentifier, bookingDetailId);
    stockReq.input("branchId", sql.Int, branchId);

    await stockReq.query(`
      UPDATE bi
      SET bi.Stock = bi.Stock - so.Quantity
      FROM BranchInventory bi
      INNER JOIN HotelServices hs ON bi.ServiceID = hs.Id
      INNER JOIN ServiceOrders so ON so.ServiceId = hs.Id
      WHERE so.BookingDetailId = @bookingDetailId
        AND hs.IsInventoryItem = 1
        AND bi.BranchId = @branchId
        AND bi.Stock >= so.Quantity 
    `);

    const roomReq = new sql.Request(transaction);
    roomReq.input("roomId", sql.Int, roomId);
    await roomReq.query(`
      UPDATE Rooms SET Status = 'Available', IsDirty = 1 WHERE Id = @roomId
    `);

    const checkRemainingReq = new sql.Request(transaction);
    checkRemainingReq.input("bookingId", sql.UniqueIdentifier, bookingId);

    const remainingRooms = await checkRemainingReq.query(`
      SELECT COUNT(Id) AS RemainingCount 
      FROM BookingDetails 
      WHERE BookingId = @bookingId AND Status NOT IN ('Completed', 'Cancelled')
    `);

    const hasRemainingRooms = remainingRooms.recordset[0].RemainingCount > 0;

    if (hasRemainingRooms) {
      await transaction.commit();
      return res.status(200).json({
        message:
          "Đã trả phòng thành công. Vui lòng trả các phòng còn lại để xuất hóa đơn!",
        isFullyCompleted: false,
      });
    }

    const sumRoomRes = await checkRemainingReq.query(`
      SELECT SUM(RoomPrice) AS TotalRoomAmount 
      FROM BookingDetails 
      WHERE BookingId = @bookingId AND Status = 'Completed'
    `);
    const totalRoomAll = sumRoomRes.recordset[0].TotalRoomAmount || 0;

    const sumServiceRes = await checkRemainingReq.query(`
      SELECT SUM(so.PriceAtTime * so.Quantity) AS TotalServiceAmount
      FROM ServiceOrders so
      INNER JOIN BookingDetails bd ON so.BookingDetailId = bd.Id
      WHERE bd.BookingId = @bookingId AND bd.Status = 'Completed'
    `);
    const totalServiceAll = sumServiceRes.recordset[0].TotalServiceAmount || 0;

    const grandTotal = Math.max(
      totalRoomAll + totalServiceAll - depositAmount,
      0,
    );

    const tenantReq = new sql.Request(transaction);
    tenantReq.input("tenantId", sql.UniqueIdentifier, tenantId);
    const tenantRes = await tenantReq.query(`
      SELECT VATTaxRate FROM Tenants WHERE Id = @tenantId
    `);
    const vatRate = tenantRes.recordset[0]?.VATTaxRate || 0;
    const vatAmount = (totalRoomAll + totalServiceAll) * vatRate / 100;

    const invoiceReq = new sql.Request(transaction);
    invoiceReq.input("tenantId", sql.UniqueIdentifier, tenantId);
    invoiceReq.input("bookingId", sql.UniqueIdentifier, bookingId);
    invoiceReq.input("userId", sql.UniqueIdentifier, userId);
    invoiceReq.input("totalRoom", sql.Decimal(18, 2), totalRoomAll);
    invoiceReq.input("totalService", sql.Decimal(18, 2), totalServiceAll);
    invoiceReq.input("grandTotal", sql.Decimal(18, 2), grandTotal);
    invoiceReq.input("paymentMethod", sql.NVarChar, paymentMethod || "Tiền mặt");
    invoiceReq.input("vatRate", sql.Decimal(5, 2), vatRate);
    invoiceReq.input("vatAmount", sql.Decimal(18, 2), vatAmount);

    const invoiceInsert = await invoiceReq.query(`
      INSERT INTO Invoices 
        (TenantId, BookingId, UserId, RoomAmount, ServiceAmount, 
        TotalAmount, PaymentMethod, PaymentDate, VATTaxRate, VATTaxAmount)
      OUTPUT INSERTED.Id
      VALUES 
        (@tenantId, @bookingId, @userId, @totalRoom, @totalService,
        @grandTotal, @paymentMethod, GETUTCDATE(), @vatRate, @vatAmount)
    `);
    const invoiceId = invoiceInsert.recordset[0].Id;

    await checkRemainingReq.query(`
      UPDATE Bookings SET Status = 'PendingPayment' WHERE Id = @bookingId
    `);

    await transaction.commit();

    res.status(200).json({
      message: "Đã trả tất cả phòng. Vui lòng xác nhận thanh toán để hoàn tất!",
      isFullyCompleted: true,
      invoiceId,
    });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ message: error.message || "Lỗi khi thanh toán." });
  }
};

const checkinBookingDetail = async (req, res) => {
  const { bookingDetailId } = req.params;

  if (
    !bookingDetailId ||
    bookingDetailId === "undefined" ||
    bookingDetailId === "null"
  ) {
    return res
      .status(400)
      .json({ message: "Mã chi tiết đơn hàng không hợp lệ!" });
  }

  const tenantId = req.tenantId;

  const transaction = new sql.Transaction();
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    request.input("id", sql.UniqueIdentifier, bookingDetailId);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    const detail = await request.query(`
      SELECT bd.RoomId, bd.BookingId 
      FROM BookingDetails bd
      INNER JOIN Bookings b ON bd.BookingId = b.Id
      WHERE bd.Id = @id AND b.TenantId = @tenantId
    `);
    if (detail.recordset.length === 0)
      throw new Error("Không tìm thấy phòng hoặc không có quyền thao tác!");

    const { RoomId, BookingId } = detail.recordset[0];

    await request.query(
      `UPDATE BookingDetails SET Status = 'InUse', ActualCheckIn = GETUTCDATE() WHERE Id = @id`,
    );

    const roomReq = new sql.Request(transaction);
    roomReq.input("roomId", sql.Int, RoomId);
    await roomReq.query(
      `UPDATE Rooms SET Status = 'Occupied' WHERE Id = @roomId`,
    );

    const bookReq = new sql.Request(transaction);
    bookReq.input("bookingId", sql.UniqueIdentifier, BookingId);
    await bookReq.query(
      `UPDATE Bookings SET Status = 'CheckedIn' WHERE Id = @bookingId`,
    );

    await transaction.commit();
    res.status(200).json({ message: "Nhận phòng thành công!" });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ message: error.message || "Lỗi khi nhận phòng" });
  }
};

const addRoomsToExistingBooking = async (req, res) => {
  const { bookingId } = req.params;
  const tenantId = req.tenantId;
  const { rooms, status } = req.body;

  const transaction = new sql.Transaction();
  try {
    await transaction.begin();
    const verifyReq = new sql.Request(transaction);
    verifyReq.input("bookingId", sql.UniqueIdentifier, bookingId);
    verifyReq.input("tenantId", sql.UniqueIdentifier, tenantId);

    const checkBooking = await verifyReq.query(
      `SELECT Id FROM Bookings WHERE Id = @bookingId AND TenantId = @tenantId`,
    );
    if (checkBooking.recordset.length === 0)
      throw new Error("Đơn không tồn tại!");

    for (const room of rooms) {
      const req = new sql.Request(transaction);
      req.input("bookingId", sql.UniqueIdentifier, bookingId);
      req.input("roomId", sql.Int, room.roomId);
      req.input("inTime", sql.DateTime, room.checkIn);
      req.input("outTime", sql.DateTime, room.checkOut);
      req.input(
        "actualIn",
        sql.DateTime,
        status === "InUse" ? new Date() : null,
      );
      req.input("status", sql.VarChar, status);
      req.input("price", sql.Decimal(18, 2), room.price);
      req.input("priceType", sql.VarChar(20), room.priceType || "day");
      req.input("discountValue", sql.Decimal(18, 2), room.discountValue || 0);
      req.input("discountType", sql.VarChar(10), room.discountType || "VND");

      await req.query(`
        INSERT INTO BookingDetails (
          BookingId, RoomId, ExpectedCheckIn, ExpectedCheckOut, ActualCheckIn, 
          Status, RoomPrice, AdultCount, ChildrenCount,
          PriceType, DiscountValue, DiscountType
        )
        VALUES (
          @bookingId, @roomId, @inTime, @outTime, @actualIn, 
          @status, @price, 2, 0,
          @priceType, @discountValue, @discountType
        )
      `);

      if (status === "InUse") {
        const roomReq = new sql.Request(transaction);
        roomReq.input("rId", sql.Int, room.roomId);
        await roomReq.query(
          `UPDATE Rooms SET Status = 'Occupied' WHERE Id = @rId`,
        );
      }
    }
    await transaction.commit();
    res.status(200).json({ message: "Thêm phòng vào đơn thành công!" });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ message: error.message || "Lỗi khi thêm phòng" });
  }
};

const checkoutAndPayNow = async (req, res) => {
  const { bookingDetailId } = req.params;
  const { paymentMethod, roomAmount, discountValue, discountType } = req.body;
  const tenantId = req.tenantId;
  const branchId = req.headers["x-branch-id"];  
  const userId = req.userId || (req.user && req.user.id) || null;

  const transaction = new sql.Transaction();
  try {
    await transaction.begin();

    const infoReq = new sql.Request(transaction);
    infoReq.input("bookingDetailId", sql.UniqueIdentifier, bookingDetailId);
    infoReq.input("tenantId", sql.UniqueIdentifier, tenantId);

    const detailInfo = await infoReq.query(`
      SELECT bd.RoomId, bd.BookingId,
             b.DepositAmount, b.Note, b.CustomerId,
             
             (SELECT COUNT(Id) FROM BookingDetails
              WHERE BookingId = b.Id
                AND Status NOT IN ('Completed','Cancelled')) AS ActiveRoomCount
      FROM BookingDetails bd
      INNER JOIN Bookings b ON bd.BookingId = b.Id
      WHERE bd.Id = @bookingDetailId AND b.TenantId = @tenantId
    `);

    if (detailInfo.recordset.length === 0)
      throw new Error("Không tìm thấy đơn hoặc không có quyền thao tác!");

    const {
      RoomId, BookingId, DepositAmount,
      Note, CustomerId, 
      ActiveRoomCount,
    } = detailInfo.recordset[0];
    const depositAmount = DepositAmount || 0;

    if (ActiveRoomCount <= 1) {
      throw new Error(
        "SINGLE_ROOM: Chỉ còn 1 phòng, vui lòng dùng chức năng trả phòng thường."
      );
    }

    const updateDetailReq = new sql.Request(transaction);
    updateDetailReq.input("bookingDetailId", sql.UniqueIdentifier, bookingDetailId);
    updateDetailReq.input("roomAmount", sql.Decimal(18, 2), roomAmount);
    updateDetailReq.input("discountVal", sql.Decimal(18, 2), discountValue || 0);
    updateDetailReq.input("discountTyp", sql.VarChar(10), discountType || "VND");

    await updateDetailReq.query(`
      UPDATE BookingDetails
      SET Status       = 'Completed',
          ActualCheckOut = GETUTCDATE(),
          RoomPrice    = @roomAmount,
          DiscountValue = @discountVal,
          DiscountType = @discountTyp
      WHERE Id = @bookingDetailId
    `);

    const stockReq = new sql.Request(transaction);
    stockReq.input("bookingDetailId", sql.UniqueIdentifier, bookingDetailId);
    stockReq.input("branchId", sql.Int, branchId);

    await stockReq.query(`
      UPDATE bi
      SET bi.Stock = bi.Stock - so.Quantity
      FROM BranchInventory bi
      INNER JOIN HotelServices hs ON bi.ServiceID = hs.Id
      INNER JOIN ServiceOrders so ON so.ServiceId = hs.Id
      WHERE so.BookingDetailId = @bookingDetailId
        AND hs.IsInventoryItem = 1
        AND bi.BranchId = @branchId
        AND bi.Stock >= so.Quantity  -- tránh trừ âm
    `);

    const newBookingReq = new sql.Request(transaction);
    newBookingReq.input("originalBookingId", sql.UniqueIdentifier, BookingId);
    newBookingReq.input("tenantId", sql.UniqueIdentifier, tenantId);
    newBookingReq.input("branchId", sql.Int, branchId);

    const newBookingResult = await newBookingReq.query(`
      INSERT INTO Bookings
        (TenantId, BranchId, CustomerId, Status, DepositAmount, Note, CreateAt)
      OUTPUT INSERTED.Id
      SELECT
        TenantId, BranchId, CustomerId,
        'PendingPayment',
        0,   
        CONCAT(ISNULL(Note,''), N' [Tách từ đơn ', LEFT(CAST(@originalBookingId AS NVARCHAR(36)), 8), N']'),
        GETUTCDATE()
      FROM Bookings
      WHERE Id = @originalBookingId
    `);
    const newBookingId = newBookingResult.recordset[0].Id;

    
    const moveReq = new sql.Request(transaction);
    moveReq.input("bookingDetailId", sql.UniqueIdentifier, bookingDetailId);
    moveReq.input("newBookingId", sql.UniqueIdentifier, newBookingId);

    await moveReq.query(`
      UPDATE BookingDetails
      SET BookingId = @newBookingId
      WHERE Id = @bookingDetailId
    `);

    const calcReq = new sql.Request(transaction);
    calcReq.input("newBookingId", sql.UniqueIdentifier, newBookingId);

    const sumRoomRes = await calcReq.query(`
      SELECT SUM(RoomPrice) AS TotalRoom
      FROM BookingDetails
      WHERE BookingId = @newBookingId AND Status = 'Completed'
    `);
    const totalRoom = sumRoomRes.recordset[0].TotalRoom || 0;

    const sumServiceRes = await calcReq.query(`
      SELECT SUM(so.PriceAtTime * so.Quantity) AS TotalService
      FROM ServiceOrders so
      INNER JOIN BookingDetails bd ON so.BookingDetailId = bd.Id
      WHERE bd.BookingId = @newBookingId AND bd.Status = 'Completed'
    `);
    const totalService = sumServiceRes.recordset[0].TotalService || 0;

    const grandTotalBeforeDeposit = totalRoom + totalService;

    const depositUsed      = Math.min(depositAmount, grandTotalBeforeDeposit);
    const grandTotal       = Math.max(grandTotalBeforeDeposit - depositUsed, 0);
    const remainingDeposit = depositAmount - depositUsed;

    const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const splitNote =
    `[${now}] Tách đơn sang ${newBookingId.substring(0, 8)}` +  
    ` | Trừ cọc: ${depositUsed.toLocaleString("vi-VN")}đ` +
    ` | Cọc còn lại: ${remainingDeposit.toLocaleString("vi-VN")}đ`;

    const updateOrigReq = new sql.Request(transaction);
    updateOrigReq.input("bookingId", sql.UniqueIdentifier, BookingId);
    updateOrigReq.input("remainingDeposit", sql.Decimal(18, 2), remainingDeposit);
    updateOrigReq.input("splitNote", sql.NVarChar(sql.MAX), splitNote);

    await updateOrigReq.query(`
      UPDATE Bookings
      SET DepositAmount = @remainingDeposit,
      Note = CONCAT(ISNULL(Note,''), CHAR(10), @splitNote)
      WHERE Id = @bookingId
    `);

    await updateOrigReq.query(`
      UPDATE Invoices
      SET Note = CONCAT(ISNULL(Note,''), CHAR(10), @splitNote)
      WHERE BookingId = @bookingId
    `);

    const updateNewReq = new sql.Request(transaction);
    updateNewReq.input("newBookingId", sql.UniqueIdentifier, newBookingId);
    updateNewReq.input("depositUsed", sql.Decimal(18, 2), depositUsed);
    updateNewReq.input(
      "newNote", sql.NVarChar(sql.MAX),
      `[${now}] Cọc nhận từ đơn gốc ${BookingId.substring(0, 8)}: ${depositUsed.toLocaleString("vi-VN")}đ`  
    );

    await updateNewReq.query(`
      UPDATE Bookings
      SET DepositAmount = @depositUsed,
          Note = CONCAT(ISNULL(Note,''), CHAR(10), @newNote)
      WHERE Id = @newBookingId
    `);


    const roomReq = new sql.Request(transaction);
    roomReq.input("roomId", sql.Int, RoomId);
    await roomReq.query(`
      UPDATE Rooms SET Status = 'Available', IsDirty = 1 WHERE Id = @roomId
    `);


    const tenantReq = new sql.Request(transaction);
    tenantReq.input("tenantId", sql.UniqueIdentifier, tenantId);
    const tenantRes = await tenantReq.query(`
      SELECT VATTaxRate FROM Tenants WHERE Id = @tenantId
    `);
    const vatRate = tenantRes.recordset[0]?.VATTaxRate || 0;
    const vatAmount = (totalRoom + totalService) * vatRate / 100;

    const invoiceReq = new sql.Request(transaction);
    invoiceReq.input("tenantId",      sql.UniqueIdentifier, tenantId);
    invoiceReq.input("newBookingId",  sql.UniqueIdentifier, newBookingId);
    invoiceReq.input("userId",        sql.UniqueIdentifier, userId);
    invoiceReq.input("totalRoom",     sql.Decimal(18, 2), totalRoom);
    invoiceReq.input("totalService",  sql.Decimal(18, 2), totalService);
    invoiceReq.input("grandTotal",    sql.Decimal(18, 2), grandTotal);
    invoiceReq.input("paymentMethod", sql.NVarChar, paymentMethod || "Tiền mặt");
    invoiceReq.input("invoiceNote",   sql.NVarChar(sql.MAX), `...`);
    invoiceReq.input("vatRate",       sql.Decimal(5, 2), vatRate);
    invoiceReq.input("vatAmount",     sql.Decimal(18, 2), vatAmount);

    const invoiceInsert = await invoiceReq.query(`
      INSERT INTO Invoices
        (TenantId, BookingId, UserId, RoomAmount, ServiceAmount,
        TotalAmount, PaymentMethod, PaymentDate, Note, VATTaxRate, VATTaxAmount)
      OUTPUT INSERTED.Id
      VALUES
        (@tenantId, @newBookingId, @userId, @totalRoom, @totalService,
        @grandTotal, @paymentMethod, GETUTCDATE(), @invoiceNote, @vatRate, @vatAmount)
    `);
    const invoiceId = invoiceInsert.recordset[0].Id;

    await transaction.commit();

    res.status(200).json({
      message: "Đã tách đơn và thanh toán thành công!",
      invoiceId,
      newBookingId,
      depositUsed,
      remainingDeposit,
      success: true
    });
  } catch (error) {
    await transaction.rollback();
    console.error(error);

    if (error.message?.startsWith("SINGLE_ROOM:")) {
      return res.status(409).json({ code: "SINGLE_ROOM", message: error.message });
    }
    res.status(500).json({ message: error.message || "Lỗi khi tách đơn thanh toán." });
  }
};

module.exports = {
  getAvailableRooms,
  createBooking,
  cancelBooking,
  getHotelServices,
  getOrderedServices,
  cancelRoomFromBooking,
  updateBookingDetail,
  checkoutBookingDetail,
  checkinBookingDetail,
  addRoomsToExistingBooking,
  checkoutAndPayNow
};
