const { sql } = require("../config/db");

const searchCustomers = async (req, res) => {
  const tenantId = req.tenantId;
  const { keyword } = req.query;

  try {
    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    let whereConditions = ["TenantId = @tenantId"];

    if (keyword && keyword.trim() !== "") {
      request.input("keyword", sql.NVarChar, `%${keyword}%`);
      whereConditions.push(
        "(Phone LIKE @keyword OR FullName LIKE @keyword OR IdCard LIKE @keyword)",
      );
    }

    const whereClause = "WHERE " + whereConditions.join(" AND ");

    const query = `
      SELECT TOP 10 Id, FullName, Phone, IdCard, Email 
      FROM Customers 
      ${whereClause}
    `;

    const result = await request.query(query);
    res.json({ data: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi tìm kiếm khách hàng." });
  }
};

const createCustomerQuick = async (req, res) => {
  const tenantId = req.tenantId;
  const { fullName, phone, idCard, email, idImages } = req.body;

  const transaction = new sql.Transaction();
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);

    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("fullName", sql.NVarChar, fullName);
    request.input("phone", sql.VarChar, phone || "");
    request.input("idCard", sql.VarChar, idCard || "");
    request.input("email", sql.VarChar, email || "");

    if (idCard) {
      const check = await request.query(
        `SELECT Id FROM Customers WHERE IdCard = @idCard AND TenantId = @tenantId`,
      );
      if (check.recordset.length > 0)
        throw new Error("CCCD đã tồn tại trong hệ thống.");
    }

    const result = await request.query(`
      INSERT INTO Customers (TenantId, FullName, Phone, IdCard, Email)
      OUTPUT INSERTED.Id
      VALUES (@tenantId, @fullName, @phone, @idCard, @email)
    `);
    const customerId = result.recordset[0].Id;

    if (idImages && idImages.length > 0) {
      for (const img of idImages) {
        const imgReq = new sql.Request(transaction);
        imgReq.input("customerId", sql.UniqueIdentifier, customerId);
        imgReq.input("name", sql.NVarChar, img.name || "Ảnh giấy tờ");
        imgReq.input("url", sql.NVarChar, img.imageUrl || img);
        await imgReq.query(`
          INSERT INTO CustomerIdDocImages (CustomerId, Name, ImageUrl)
          VALUES (@customerId, @name, @url)
        `);
      }
    }

    await transaction.commit();
    res.status(201).json({
      message: "Thêm khách hàng thành công",
      customer: {
        Id: customerId,
        FullName: fullName,
        Phone: phone,
        IdCard: idCard,
      },
    });
  } catch (err) {
    await transaction.rollback();
    res
      .status(400)
      .json({ message: err.message || "Lỗi server khi thêm khách hàng" });
  }
};

const getCustomers = async (req, res) => {
  const tenantId = req.tenantId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || "";

  try {
    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    let whereConditions = ["TenantId = @tenantId"];

    if (search.trim() !== "") {
      request.input("search", sql.NVarChar, `%${search}%`);
      whereConditions.push(
        "(FullName LIKE @search OR Phone LIKE @search OR IdCard LIKE @search)",
      );
    }

    const whereClause = "WHERE " + whereConditions.join(" AND ");

    const countResult = await request.query(`
      SELECT COUNT(*) AS Total 
      FROM Customers 
      ${whereClause}
    `);
    const totalItems = countResult.recordset[0].Total;
    const totalPages = Math.ceil(totalItems / limit) || 1;

    request.input("offset", sql.Int, offset);
    request.input("limit", sql.Int, limit);

    const customersResult = await request.query(`
      SELECT Id, FullName, Phone, IdCard, Email
      FROM Customers
      ${whereClause}
      ORDER BY FullName ASC 
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      data: customersResult.recordset,
      pagination: { currentPage: page, totalPages: totalPages },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi lấy danh sách khách hàng." });
  }
};

const getCustomerById = async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId; 

  try {
    const request = new sql.Request();
    request.input("id", sql.UniqueIdentifier, id);
    request.input("tenantId", sql.UniqueIdentifier, tenantId); 

    const customerRes = await request.query(`
      SELECT Id, FullName, Phone, IdCard, Email 
      FROM Customers 
      WHERE Id = @id AND TenantId = @tenantId
    `);

    if (customerRes.recordset.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy khách hàng hoặc không có quyền truy cập.",
      });
    }

    const imagesRes = await request.query(
      `SELECT Id, Name, ImageUrl FROM CustomerIdDocImages WHERE CustomerId = @id`,
    );

    res.json({
      ...customerRes.recordset[0],
      Images: imagesRes.recordset,
    });
  } catch (err) {
    res.status(500).json({ message: "Lỗi lấy chi tiết khách hàng." });
  }
};

const updateCustomer = async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;
  const { fullName, phone, idCard, email, idImages } = req.body;

  const transaction = new sql.Transaction();
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);

    request.input("id", sql.UniqueIdentifier, id);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("fullName", sql.NVarChar, fullName);
    request.input("phone", sql.VarChar, phone || "");
    request.input("idCard", sql.VarChar, idCard || "");
    request.input("email", sql.VarChar, email || "");

    if (idCard) {
      const check = await request.query(
        `SELECT Id FROM Customers WHERE IdCard = @idCard AND TenantId = @tenantId AND Id != @id`,
      );
      if (check.recordset.length > 0)
        throw new Error("CCCD đã tồn tại cho một khách hàng khác.");
    }

    const updateResult = await request.query(`
      UPDATE Customers 
      SET FullName = @fullName, Phone = @phone, IdCard = @idCard, Email = @email
      WHERE Id = @id AND TenantId = @tenantId
    `);

    if (updateResult.rowsAffected[0] === 0) {
      throw new Error("Khách hàng không tồn tại hoặc bạn không có quyền sửa!");
    }

    await request.query(
      `DELETE FROM CustomerIdDocImages WHERE CustomerId = @id`,
    );
    if (idImages && idImages.length > 0) {
      for (const img of idImages) {
        const imgReq = new sql.Request(transaction);
        imgReq.input("customerId", sql.UniqueIdentifier, id);
        imgReq.input("name", sql.NVarChar, img.name || "Ảnh giấy tờ");
        imgReq.input("url", sql.NVarChar, img.imageUrl || img);
        await imgReq.query(
          `INSERT INTO CustomerIdDocImages (CustomerId, Name, ImageUrl) VALUES (@customerId, @name, @url)`,
        );
      }
    }

    await transaction.commit();
    res.status(200).json({ message: "Cập nhật thông tin thành công!" });
  } catch (err) {
    await transaction.rollback();
    res
      .status(400)
      .json({ message: err.message || "Lỗi khi cập nhật khách hàng." });
  }
};

const deleteCustomer = async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;

  const transaction = new sql.Transaction();
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    request.input("id", sql.UniqueIdentifier, id);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    const checkOwner = await request.query(
      `SELECT Id FROM Customers WHERE Id = @id AND TenantId = @tenantId`,
    );
    if (checkOwner.recordset.length === 0) {
      throw new Error(
        "Khách hàng không tồn tại hoặc bạn không có quyền thao tác!",
      );
    }

    const checkBooking = await request.query(
      `SELECT TOP 1 Id FROM Bookings WHERE CustomerId = @id`,
    );
    if (checkBooking.recordset.length > 0) {
      throw new Error(
        "Không thể xóa! Khách hàng này đã có giao dịch (Đơn đặt phòng) trong hệ thống.",
      );
    }

    await request.query(
      `DELETE FROM CustomerIdDocImages WHERE CustomerId = @id`,
    );
    await request.query(
      `DELETE FROM Customers WHERE Id = @id AND TenantId = @tenantId`,
    );

    await transaction.commit();
    res.status(200).json({ message: "Xóa khách hàng thành công!" });
  } catch (err) {
    await transaction.rollback();
    res.status(400).json({ message: err.message || "Lỗi khi xóa khách hàng." });
  }
};

module.exports = {
  searchCustomers,
  createCustomerQuick,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
};
