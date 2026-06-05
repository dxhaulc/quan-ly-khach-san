const { sql } = require("../config/db");

const getRoomMap = async (req, res) => {
  const tenantId = req.tenantId;
  const branchId = req.headers["x-branch-id"];

  if (!branchId)
    return res.status(400).json({ message: "Thiếu thông tin chi nhánh." });

  try {
    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("branchId", sql.Int, branchId);

    const result = await request.query(`
      SELECT 
        r.Id AS RoomId, 
        r.RoomNumber, 
        r.Status AS OccupancyStatus, 
        r.IsDirty,
        rt.TypeName,
        c.Phone AS GuestPhone,

        COALESCE(b.DepositAmount, UpcomingBooking.UpcomingDepositAmount) AS DepositAmount,
        COALESCE(bd.Note, UpcomingBooking.UpcomingNote) AS Note,
        COALESCE(bd.Id, UpcomingBooking.UpcomingBookingDetailId) AS BookingDetailId,
        COALESCE(bd.BookingId, UpcomingBooking.UpcomingBookingId) AS BookingId,
        COALESCE(c.FullName, UpcomingBooking.UpcomingGuestName) AS GuestName,

        COALESCE(bd.PriceType, UpcomingBooking.PriceType) AS PriceType,
        COALESCE(bd.DiscountValue, UpcomingBooking.DiscountValue) AS DiscountValue,
        COALESCE(bd.DiscountType, UpcomingBooking.DiscountType) AS DiscountType,
        
        bd.ActualCheckIn,
        bd.ExpectedCheckIn AS CurrentCheckIn, 
        bd.ExpectedCheckOut,
        
        UpcomingBooking.UpcomingBookingDetailId,
        UpcomingBooking.ExpectedCheckIn AS UpcomingCheckIn,
        UpcomingBooking.UpcomingCheckOut,   
        UpcomingBooking.UpcomingGuestName,
        UpcomingBooking.UpcomingBookingId,

        PriceHour.Price AS PriceHour,
        PriceDay.Price AS PriceDay,
        PriceNight.Price AS PriceNight,
        PriceHourWE.Price AS PriceHourWeekend,
        PriceDayWE.Price AS PriceDayWeekend,
        PriceNightWE.Price AS PriceNightWeekend

      FROM Rooms r
      INNER JOIN RoomTypes rt ON r.RoomTypeId = rt.Id
      
      LEFT JOIN BookingDetails bd ON r.Id = bd.RoomId AND bd.Status = 'InUse'
      LEFT JOIN Bookings b ON bd.BookingId = b.Id
      LEFT JOIN Customers c ON b.CustomerId = c.Id
      
      OUTER APPLY (
        SELECT TOP 1 
          bd_up.Id AS UpcomingBookingDetailId, 
          bd_up.ExpectedCheckIn, 
          bd_up.ExpectedCheckOut AS UpcomingCheckOut, 
          c_up.FullName AS UpcomingGuestName, 
          b_up.Id AS UpcomingBookingId,
          bd_up.PriceType,
          bd_up.DiscountValue,
          bd_up.DiscountType,
          bd_up.Note AS UpcomingNote,
          b_up.DepositAmount AS UpcomingDepositAmount
        FROM BookingDetails bd_up
        INNER JOIN Bookings b_up ON bd_up.BookingId = b_up.Id
        LEFT JOIN Customers c_up ON b_up.CustomerId = c_up.Id
        WHERE bd_up.RoomId = r.Id AND bd_up.Status = 'Reserved' 
        
        ORDER BY bd_up.ExpectedCheckIn ASC
      ) AS UpcomingBooking
      
      OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 1 AND DayType = 'weekday') AS PriceHour
      OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 2 AND DayType = 'weekday') AS PriceDay
      OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 3 AND DayType = 'weekday') AS PriceNight
      
      OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 1 AND DayType = 'weekend') AS PriceHourWE
      OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 2 AND DayType = 'weekend') AS PriceDayWE
      OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 3 AND DayType = 'weekend') AS PriceNightWE
      
      WHERE r.BranchId = @branchId
        AND r.BranchId IN (SELECT Id FROM Branches WHERE TenantId = @tenantId)
        AND r.IsDelete = 0 AND rt.IsDelete = 0
      ORDER BY r.RoomNumber ASC
    `);

    const now = new Date();
    let stats = {
      total: result.recordset.length,
      available: 0,
      incoming: 0,
      occupied: 0,
      checkoutSoon: 0,
      overdue: 0,
      dirty: 0,
    };

    const processedRooms = result.recordset.map((room) => {
      let displayStatus = room.OccupancyStatus;

      if (room.IsDirty) stats.dirty++;

      if (room.OccupancyStatus === "Available") {
        if (room.UpcomingCheckIn) {
          const diffMs = new Date(room.UpcomingCheckIn) - now;
          const diffHours = diffMs / (1000 * 60 * 60);
          if (diffHours >= -1 && diffHours <= 1) {
            displayStatus = "Incoming";
            stats.incoming++;
          } else {
            stats.available++;
          }
        } else {
          stats.available++;
        }
      } else if (room.OccupancyStatus === "Occupied") {
        stats.occupied++;
        if (room.ExpectedCheckOut) {
          const expectedOut = new Date(room.ExpectedCheckOut);
          const diffMs = expectedOut - now;
          const diffHours = diffMs / (1000 * 60 * 60);

          if (diffHours < 0) {
            displayStatus = "Overdue";
            stats.overdue++;
          } else if (diffHours <= 0.5) {
            displayStatus = "CheckoutSoon";
            stats.checkoutSoon++;
          }
        }
      }

      return { ...room, DisplayStatus: displayStatus };
    });

    const roomsByFloor = processedRooms.reduce((acc, room) => {
      const floorMatch = room.RoomNumber.match(/^\d/);
      const floor = floorMatch ? `Tầng ${floorMatch[0]}` : "Khác";
      if (!acc[floor]) acc[floor] = [];
      acc[floor].push(room);
      return acc;
    }, {});

    res.json({ stats, roomsByFloor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server khi lấy sơ đồ phòng" });
  }
};

const getTimeline = async (req, res) => {
  const tenantId = req.tenantId;
  const branchId = req.headers["x-branch-id"];
  const { startDate, endDate } = req.query;

  if (!branchId || !startDate || !endDate) {
    return res.status(400).json({ message: "Thiếu thông tin bắt buộc." });
  }

  try {
    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("branchId", sql.Int, branchId);
    request.input("startDate", sql.DateTime, startDate);
    request.input("endDate", sql.DateTime, endDate);

    const roomsResult = await request.query(`
      SELECT 
        r.Id AS RoomId, r.RoomNumber, rt.TypeName, r.Status AS RoomStatus, r.IsDirty,
        PriceHour.Price AS PriceHour, PriceDay.Price AS PriceDay, PriceNight.Price AS PriceNight,
        PriceHourWE.Price AS PriceHourWeekend, PriceDayWE.Price AS PriceDayWeekend, PriceNightWE.Price AS PriceNightWeekend
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
        AND r.IsDelete = 0 AND rt.IsDelete = 0
      ORDER BY r.RoomNumber ASC
    `);

    const bookingsResult = await request.query(`
      SELECT 
        bd.Id, bd.Id AS BookingDetailId, bd.BookingId, bd.RoomId, bd.PriceType, bd.DiscountValue, bd.DiscountType,
        bd.ExpectedCheckIn, bd.ExpectedCheckOut, bd.Status AS BookingStatus, b.DepositAmount, bd.Note, bd.ActualCheckIn,
        c.FullName AS GuestName
      FROM BookingDetails bd
      INNER JOIN Bookings b ON bd.BookingId = b.Id
      LEFT JOIN Customers c ON b.CustomerId = c.Id
      
      WHERE b.BranchId = @branchId 
        AND b.TenantId = @tenantId
        AND bd.Status != 'Cancelled' 
        AND (bd.ExpectedCheckIn <= @endDate AND bd.ExpectedCheckOut >= @startDate)
    `);

    const roomsByFloor = roomsResult.recordset.reduce((acc, room) => {
      const floorMatch = room.RoomNumber.match(/^\d/);
      const floor = floorMatch ? `Tầng ${floorMatch[0]}` : "Khác";
      if (!acc[floor]) acc[floor] = [];
      acc[floor].push(room);
      return acc;
    }, {});

    res.json({ roomsByFloor, bookings: bookingsResult.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server khi lấy Timeline" });
  }
};

const toggleRoomCleaningStatus = async (req, res) => {
  const { id } = req.params;
  const { isDirty } = req.body;
  const tenantId = req.tenantId;

  try {
    const request = new sql.Request();
    request.input("id", sql.Int, id);
    request.input("isDirty", sql.Bit, isDirty ? 1 : 0);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    const result = await request.query(`
      UPDATE Rooms 
      SET IsDirty = @isDirty 
      WHERE Id = @id 
        AND BranchId IN (SELECT Id FROM Branches WHERE TenantId = @tenantId)
    `);

    if (result.rowsAffected[0] === 0) {
      return res.status(403).json({
        message: "Phòng không tồn tại hoặc bạn không có quyền cập nhật!",
      });
    }

    res.json({ message: "Đã cập nhật trạng thái vệ sinh!" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

module.exports = { getRoomMap, toggleRoomCleaningStatus, getTimeline };
