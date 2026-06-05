const { sql } = require("../config/db");

const getCategories = async (req, res) => {
  const tenantId = req.tenantId;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  const search = req.query.search || "";

  try {
    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    let whereConditions = ["TenantId = @tenantId", "IsDelete = 0"];

    if (search.trim() !== "") {
      request.input("search", sql.NVarChar, `%${search}%`);
      whereConditions.push("(Name LIKE @search)");
    }

    const whereClause = "WHERE " + whereConditions.join(" AND ");

    const countResult = await request.query(`
      SELECT COUNT(*) as Total
      FROM ServiceCategories
      ${whereClause}
    `);
    const totalItems = countResult.recordset[0].Total;
    const totalPages = Math.ceil(totalItems / limit);

    request.input("offset", sql.Int, offset);
    request.input("limit", sql.Int, limit);

    const result = await request.query(`
      SELECT Id, Name, Description, IsDelete
      FROM ServiceCategories
      ${whereClause}
      ORDER BY Name ASC
      OFFSET @offset ROWS 
      FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      data: result.recordset,
      pagination: { totalItems, totalPages, currentPage: page, limit },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server khi lấy danh sách nhóm hàng" });
  }
};

const createCategory = async (req, res) => {
  const tenantId = req.tenantId;
  const { name, description } = req.body;

  if (!name)
    return res
      .status(400)
      .json({ message: "Tên nhóm hàng không được để trống" });

  try {
    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("name", sql.NVarChar, name);
    request.input("description", sql.NVarChar, description || "");

    await request.query(`
      INSERT INTO ServiceCategories (TenantId, Name, Description, IsDelete)
      VALUES (@tenantId, @name, @description, 0)
    `);

    res.status(201).json({ message: "Thêm nhóm hàng thành công!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server khi thêm nhóm hàng" });
  }
};

const updateCategory = async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;
  const { name, description } = req.body;

  try {
    const request = new sql.Request();
    request.input("id", sql.Int, id);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("name", sql.NVarChar, name);
    request.input("description", sql.NVarChar, description || "");

    await request.query(`
      UPDATE ServiceCategories 
      SET Name = @name, Description = @description
      WHERE Id = @id AND TenantId = @tenantId
    `);

    res.json({ message: "Cập nhật nhóm hàng thành công!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server khi cập nhật nhóm hàng" });
  }
};

const deleteCategory = async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;

  try {
    const request = new sql.Request();
    request.input("id", sql.Int, id);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    const checkReq = await request.query(`
      SELECT COUNT(*) as Count FROM HotelServices 
      WHERE CategoryId = @id AND TenantId = @tenantId AND IsDelete = 0
    `);

    if (checkReq.recordset[0].Count > 0) {
      return res
        .status(400)
        .json({
          message:
            "Không thể xóa nhóm này vì đang có Hàng hóa/Dịch vụ sử dụng!",
        });
    }

    await request.query(`
      UPDATE ServiceCategories 
      SET IsDelete = 1
      WHERE Id = @id AND TenantId = @tenantId
    `);

    res.json({ message: "Đã xóa nhóm hàng!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server khi xóa nhóm hàng" });
  }
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
