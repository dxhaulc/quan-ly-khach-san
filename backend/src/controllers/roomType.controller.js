const { sql } = require("../config/db");

const getAllRoomTypes = async (req, res) => {
  const tenantId = req.tenantId;
  const branchId = req.headers["x-branch-id"];

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  const search = req.query.search || "";
  const status = req.query.status || "active";

  if (!branchId) {
    return res.status(400).json({ message: "Thiếu thông tin chi nhánh." });
  }

  try {
    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("branchId", sql.Int, branchId);

    let whereConditions = ["TenantId = @tenantId", "BranchId = @branchId"];

    if (status === "active") {
      whereConditions.push("IsDelete = 0");
    } else if (status === "inactive") {
      whereConditions.push("IsDelete = 1");
    }

    if (search.trim() !== "") {
      request.input("search", sql.NVarChar, `%${search}%`);
      whereConditions.push(
        "(TypeName LIKE @search OR CAST(Id AS VARCHAR) LIKE @search)",
      );
    }

    const whereClause = "WHERE " + whereConditions.join(" AND ");

    const countResult = await request.query(`
      SELECT COUNT(*) as Total
      FROM RoomTypes 
      ${whereClause}
    `);
    const totalItems = countResult.recordset[0].Total;
    const totalPages = Math.ceil(totalItems / limit);

    request.input("offset", sql.Int, offset);
    request.input("limit", sql.Int, limit);

    const roomTypesResult = await request.query(`
      SELECT Id, TypeName, LimitAdult, LimitChildren, ExtraPersonPrice, LateCheckOutFeePerHour ,IsDelete
      FROM RoomTypes 
      ${whereClause}
      ORDER BY Id ASC 
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);

    const roomTypes = roomTypesResult.recordset;

    if (roomTypes.length === 0) {
      return res.json({
        data: [],
        pagination: { totalItems, totalPages, currentPage: page, limit },
      });
    }

    const roomTypeIds = roomTypes.map((rt) => rt.Id);

    const detailReq = new sql.Request();

    const imagesResult = await detailReq.query(`
      SELECT RoomTypeId, Id, ImageUrl, IsPrimary 
      FROM RoomTypeImages 
      WHERE RoomTypeId IN (${roomTypeIds.join(",")})
    `);

    const pricesResult = await detailReq.query(`
      SELECT pc.RoomTypeId, ps.Name AS SlotName, ps.IsOvernight, pc.DayType, pc.Price, pc.FirstBlockHours, pc.ExtraHourPrice
      FROM RoomTypePriceConfig pc
      JOIN PriceSlots ps ON pc.PriceSlotID = ps.Id
      WHERE pc.RoomTypeId IN (${roomTypeIds.join(",")})
    `);

    const formattedData = roomTypes.map((rt) => {
      return {
        ...rt,
        Images: imagesResult.recordset.filter(
          (img) => img.RoomTypeId === rt.Id,
        ),
        PriceConfigs: pricesResult.recordset.filter(
          (price) => price.RoomTypeId === rt.Id,
        ),
      };
    });

    res.json({
      data: formattedData,
      pagination: { totalItems, totalPages, currentPage: page, limit },
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Lỗi server khi lấy danh sách hạng phòng" });
  }
};

const createRoomType = async (req, res) => {
  const tenantId = req.tenantId;
  const branchId = req.headers["x-branch-id"];

  const {
    typeName,
    stdAdult,
    stdChild,
    maxAdult,
    maxChild,
    earlyCheckInFee,
    lateCheckOutFee,
    priceHour,
    priceDay,
    priceNight,
    priceHalfDay,
    images,
  } = req.body;

  if (!branchId)
    return res.status(400).json({ message: "Thiếu thông tin chi nhánh." });

  const transaction = new sql.Transaction();

  try {
    await transaction.begin();
    const request = new sql.Request(transaction);

    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("branchId", sql.Int, branchId);
    request.input("typeName", sql.NVarChar, typeName);
    request.input("limitAdult", sql.Int, maxAdult || 2);
    request.input("limitChildren", sql.Int, maxChild || 1);
    request.input("extraPersonPrice", sql.Decimal(18, 2), 0);
    request.input(
      "lateCheckOutFeePerHour",
      sql.Decimal(18, 2),
      lateCheckOutFee || 0,
    );

    const roomTypeResult = await request.query(`
      INSERT INTO RoomTypes (
        TenantId, BranchId, TypeName, 
        LimitAdult, LimitChildren, 
        ExtraPersonPrice, LateCheckOutFeePerHour, IsDelete
      )
      OUTPUT INSERTED.Id
      VALUES (
        @tenantId, @branchId, @typeName, 
        @limitAdult, @limitChildren, 
        @extraPersonPrice, @lateCheckOutFeePerHour, 0
      )
    `);

    const newRoomTypeId = roomTypeResult.recordset[0].Id;

    const priceConfigs = [
      { slotId: 1, price: priceHour, firstBlock: 2 },
      { slotId: 2, price: priceDay, firstBlock: 0 },
      { slotId: 3, price: priceNight, firstBlock: 0 },
      { slotId: 4, price: priceHalfDay, firstBlock: 0 },
    ];

    for (const config of priceConfigs) {
      if (config.price > 0) {
        const priceReq = new sql.Request(transaction);
        priceReq.input("roomTypeId", sql.Int, newRoomTypeId);
        priceReq.input("priceSlotId", sql.Int, config.slotId);
        priceReq.input("price", sql.Decimal(18, 2), config.price);
        priceReq.input("firstBlock", sql.Int, config.firstBlock);

        await priceReq.query(`
          INSERT INTO RoomTypePriceConfig (RoomTypeId, PriceSlotID, DayType, Price, FirstBlockHours)
          VALUES (@roomTypeId, @priceSlotId, 'weekday', @price, @firstBlock)
        `);
      }
    }

    if (images && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        const imgReq = new sql.Request(transaction);
        imgReq.input("roomTypeId", sql.Int, newRoomTypeId);
        imgReq.input("imageUrl", sql.VarChar, images[i]);
        imgReq.input("isPrimary", sql.Bit, i === 0 ? 1 : 0);

        await imgReq.query(`
          INSERT INTO RoomTypeImages (RoomTypeId, ImageUrl, IsPrimary)
          VALUES (@roomTypeId, @imageUrl, @isPrimary)
        `);
      }
    }

    await transaction.commit();
    res.status(201).json({ message: "Thêm hạng phòng thành công!" });
  } catch (err) {
    console.error("Transaction Error:", err);
    await transaction.rollback();
    res
      .status(500)
      .json({ message: "Lỗi server khi thêm hạng phòng. Đã hoàn tác." });
  }
};

const updateRoomType = async (req, res) => {
  const { id } = req.params; 
  const tenantId = req.tenantId;
  const branchId = req.headers["x-branch-id"];

  const {
    typeName,
    maxAdult,
    maxChild,
    lateCheckOutFee,
    priceHour,
    priceDay,
    priceNight,
    priceHalfDay,
    images,
    isDelete,
  } = req.body;

  if (!branchId)
    return res.status(400).json({ message: "Thiếu thông tin chi nhánh." });

  const transaction = new sql.Transaction();

  try {
    await transaction.begin();

    const updateReq = new sql.Request(transaction);
    updateReq.input("id", sql.Int, id);
    updateReq.input("tenantId", sql.UniqueIdentifier, tenantId);
    updateReq.input("branchId", sql.Int, branchId);
    updateReq.input("typeName", sql.NVarChar, typeName);
    updateReq.input("limitAdult", sql.Int, maxAdult || 2);
    updateReq.input("limitChildren", sql.Int, maxChild || 1);
    updateReq.input("extraPersonPrice", sql.Decimal(18, 2), 0);
    updateReq.input("lateCheckOutFeePerHour", sql.Decimal(18, 2), lateCheckOutFee || 0);
    updateReq.input("isDelete", sql.Bit, isDelete !== undefined ? isDelete : 0);

    await updateReq.query(`
      UPDATE RoomTypes
      SET TypeName = @typeName, 
        LimitAdult = @limitAdult, 
        LimitChildren = @limitChildren, 
        ExtraPersonPrice = @extraPersonPrice, 
        LateCheckOutFeePerHour = @lateCheckOutFeePerHour,
        IsDelete = @isDelete
      WHERE Id = @id AND TenantId = @tenantId AND BranchId = @branchId
    `);

    const priceConfigs = [
      { slotId: 1, price: priceHour, firstBlock: 2 },
      { slotId: 2, price: priceDay, firstBlock: 0 },
      { slotId: 3, price: priceNight, firstBlock: 0 },
      { slotId: 4, price: priceHalfDay, firstBlock: 0 },
    ];

    for (const config of priceConfigs) {
      const priceReq = new sql.Request(transaction);
      priceReq.input("roomTypeId", sql.Int, id);
      priceReq.input("priceSlotId", sql.Int, config.slotId);
      priceReq.input("price", sql.Decimal(18, 2), config.price || 0);
      priceReq.input("firstBlock", sql.Int, config.firstBlock);

      await priceReq.query(`
        IF EXISTS (
          SELECT 1 FROM RoomTypePriceConfig 
          WHERE RoomTypeId = @roomTypeId AND PriceSlotID = @priceSlotId AND DayType = 'weekday'
        )
        BEGIN
          UPDATE RoomTypePriceConfig
          SET Price = @price, 
            FirstBlockHours = @firstBlock
          WHERE RoomTypeId = @roomTypeId AND PriceSlotID = @priceSlotId AND DayType = 'weekday'
        END
        ELSE
        BEGIN
          IF @price > 0
          BEGIN
            INSERT INTO RoomTypePriceConfig (RoomTypeId, PriceSlotID, DayType, Price, FirstBlockHours)
            VALUES (@roomTypeId, @priceSlotId, 'weekday', @price, @firstBlock)
          END
        END
      `);
    }

    const deleteImgReq = new sql.Request(transaction);
    deleteImgReq.input("roomTypeId", sql.Int, id);
    await deleteImgReq.query(
      `DELETE FROM RoomTypeImages WHERE RoomTypeId = @roomTypeId`,
    );

    if (images && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        const insertImgReq = new sql.Request(transaction);
        insertImgReq.input("roomTypeId", sql.Int, id);
        insertImgReq.input("imageUrl", sql.VarChar, images[i]);
        insertImgReq.input("isPrimary", sql.Bit, i === 0 ? 1 : 0);

        await insertImgReq.query(`
          INSERT INTO RoomTypeImages (RoomTypeId, ImageUrl, IsPrimary)
          VALUES (@roomTypeId, @imageUrl, @isPrimary)
        `);
      }
    }

    await transaction.commit();
    res.json({ message: "Cập nhật hạng phòng thành công!" });

  } catch (err) {
    console.error("Update Transaction Error:", err);
    await transaction.rollback();
    res.status(500).json({ message: "Lỗi server khi cập nhật hạng phòng" });
  }
};

const deleteRoomType = async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;
  const branchId = req.headers["x-branch-id"];

  if (!branchId)
    return res.status(400).json({ message: "Thiếu thông tin chi nhánh." });

  try {
    const request = new sql.Request();
    request.input("id", sql.Int, id);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("branchId", sql.Int, branchId);

    await request.query(`
      UPDATE RoomTypes
      SET IsDelete = 1
      WHERE Id = @id AND TenantId = @tenantId AND BranchId = @branchId
    `);

    res.json({ message: "Đã xóa hạng phòng!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server khi xóa hạng phòng" });
  }
};

module.exports = {
  getAllRoomTypes,
  createRoomType,
  updateRoomType,
  deleteRoomType,
};
