const { sql } = require('../config/db');

const getPriceConfigs = async (req, res) => {
  const tenantId = req.tenantId;
  const branchId = req.headers['x-branch-id'];

  if (!branchId) return res.status(400).json({ message: 'Thiếu thông tin chi nhánh.' });

  try {
    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("branchId", sql.Int, branchId);

    const result = await request.query(`
      SELECT 
        r.Id AS RoomTypeId, r.TypeName,
        p.PriceSlotID, p.DayType, p.Price, p.ExtraHourPrice, p.FirstBlockHours
      FROM RoomTypes r
      LEFT JOIN RoomTypePriceConfig p ON r.Id = p.RoomTypeId
      WHERE r.TenantId = @tenantId AND r.BranchId = @branchId AND r.IsDelete = 0
    `);

    const roomMap = {};

    result.recordset.forEach(row => {
      const { RoomTypeId, TypeName, PriceSlotID, DayType, Price, ExtraHourPrice, FirstBlockHours } = row;

      if (!roomMap[RoomTypeId]) {
        roomMap[RoomTypeId] = {
          roomTypeId: RoomTypeId,
          roomTypeName: TypeName,
          prices: {
            hourly: { 
              default: { firstBlockPrice: 0, extraHourPrice: 0, firstBlockHours: 2 }, 
              weekend: { firstBlockPrice: 0, extraHourPrice: 0, firstBlockHours: 2 } 
            },
            daily: { default: 0, weekend: 0 },
            overnight: { default: 0, weekend: 0 },
            halfDay: { default: 0, weekend: 0 }
          }
        };
      }

      if (PriceSlotID) {
        const targetDay = DayType === 'weekend' ? 'weekend' : 'default';
        const roomPrices = roomMap[RoomTypeId].prices;

        switch (PriceSlotID) {
          case 1:
            roomPrices.hourly[targetDay].firstBlockPrice = Price || 0;
            roomPrices.hourly[targetDay].extraHourPrice = ExtraHourPrice || 0;
            roomPrices.hourly[targetDay].firstBlockHours = FirstBlockHours || 2;
            break;
          case 2:
            roomPrices.daily[targetDay] = Price || 0;
            break;
          case 3:
            roomPrices.overnight[targetDay] = Price || 0;
            break;
          case 4:
            roomPrices.halfDay[targetDay] = Price || 0;
            break;
        }
      }
    });

    const finalData = Object.values(roomMap);
    res.json({ data: finalData });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server khi lấy bảng giá" });
  }
};

const updatePriceConfigs = async (req, res) => {
  const tenantId = req.tenantId;
  const branchId = req.headers['x-branch-id'];
  const priceDataList = req.body; 

  if (!branchId) return res.status(400).json({ message: 'Thiếu thông tin chi nhánh.' });

  const transaction = new sql.Transaction();

  try {
    await transaction.begin();

    for (const roomType of priceDataList) {
      const roomTypeId = roomType.roomTypeId;

      const upsertPrice = async (slotId, dayType, price, extraHourPrice = 0, firstBlockHours = 0) => {
        const priceReq = new sql.Request(transaction);
        priceReq.input("roomTypeId", sql.Int, roomTypeId); 
        priceReq.input("slotId", sql.Int, slotId);
        priceReq.input("dayType", sql.VarChar, dayType);
        priceReq.input("price", sql.Decimal(18, 2), price || 0);
        priceReq.input("extraHourPrice", sql.Decimal(18, 2), extraHourPrice || 0);
        priceReq.input("firstBlockHours", sql.Int, firstBlockHours || 0);

        await priceReq.query(`
          IF EXISTS (
            SELECT 1 FROM RoomTypePriceConfig 
            WHERE RoomTypeId = @roomTypeId AND PriceSlotID = @slotId AND DayType = @dayType
          )
          BEGIN
            UPDATE RoomTypePriceConfig 
            SET Price = @price, 
              ExtraHourPrice = @extraHourPrice, 
              FirstBlockHours = @firstBlockHours
            WHERE RoomTypeId = @roomTypeId AND PriceSlotID = @slotId AND DayType = @dayType
          END
          ELSE
          BEGIN
            IF @price > 0 OR @extraHourPrice > 0
            BEGIN
              INSERT INTO RoomTypePriceConfig (RoomTypeId, PriceSlotID, DayType, Price, FirstBlockHours, ExtraHourPrice)
              VALUES (@roomTypeId, @slotId, @dayType, @price, @firstBlockHours, @extraHourPrice)
            END
          END
        `);
      };

      const p = roomType.prices;
      
      await upsertPrice(1, 'weekday', p.hourly.default.firstBlockPrice, p.hourly.default.extraHourPrice, p.hourly.default.firstBlockHours);
      await upsertPrice(2, 'weekday', p.daily.default, 0, 0);
      await upsertPrice(3, 'weekday', p.overnight.default, 0, 0);
      await upsertPrice(4, 'weekday', p.halfDay.default, 0, 0);

      await upsertPrice(1, 'weekend', p.hourly.weekend.firstBlockPrice, p.hourly.weekend.extraHourPrice, p.hourly.weekend.firstBlockHours);
      await upsertPrice(2, 'weekend', p.daily.weekend, 0, 0);
      await upsertPrice(3, 'weekend', p.overnight.weekend, 0, 0);
      await upsertPrice(4, 'weekend', p.halfDay.weekend, 0, 0);
    }

    await transaction.commit();
    res.json({ message: "Lưu bảng giá thành công!" });

  } catch (err) {
    console.error("Upsert Price Configs Error:", err);
    await transaction.rollback();
    res.status(500).json({ message: "Lỗi server khi lưu bảng giá" });
  }
};


module.exports = { 
  getPriceConfigs, 
  updatePriceConfigs 
};