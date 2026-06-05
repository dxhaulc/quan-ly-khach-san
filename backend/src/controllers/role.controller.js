const { sql } = require("../config/db");

const getRoles = async (req, res) => {
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
      whereConditions.push("RoleName LIKE @search");
    }

    const whereClause = "WHERE " + whereConditions.join(" AND ");

    const countResult = await request.query(`
      SELECT COUNT(*) as Total
      FROM Roles
      ${whereClause}
    `);
    const totalItems = countResult.recordset[0].Total;
    const totalPages = Math.ceil(totalItems / limit) || 1;

    request.input("offset", sql.Int, offset);
    request.input("limit", sql.Int, limit);

    const rolesResult = await request.query(`
      SELECT Id, RoleName
      FROM Roles
      ${whereClause}
      ORDER BY Id ASC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      data: rolesResult.recordset,
      pagination: { currentPage: page, totalPages: totalPages },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi lấy danh sách vai trò." });
  }
};

const getAllRolesDropdown = async (req, res) => {
  const tenantId = req.tenantId;
  try {
    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    const result = await request.query(`
      SELECT Id, RoleName 
      FROM Roles 
      WHERE TenantId = @tenantId
      ORDER BY Id ASC
    `);
    res.json({ data: result.recordset });
  } catch (err) {
    console.error("Lỗi lấy danh sách Roles Dropdown:", err);
    res.status(500).json({ message: "Lỗi khi lấy danh sách quyền hạn." });
  }
};

const createRole = async (req, res) => {
  const tenantId = req.tenantId;
  const { roleName } = req.body;

  try {
    if (!roleName)
      return res
        .status(400)
        .json({ message: "Tên vai trò không được để trống." });

    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("roleName", sql.NVarChar, roleName);

    const check = await request.query(
      `SELECT Id FROM Roles WHERE RoleName = @roleName AND TenantId = @tenantId`,
    );
    if (check.recordset.length > 0)
      return res.status(400).json({ message: "Tên vai trò này đã tồn tại." });

    await request.query(`
      INSERT INTO Roles (TenantId, RoleName) 
      VALUES (@tenantId, @roleName)
    `);

    res.status(201).json({ message: "Thêm vai trò thành công!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi thêm vai trò." });
  }
};

const updateRole = async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;
  const { roleName } = req.body;

  try {
    const request = new sql.Request();
    request.input("id", sql.Int, id);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("roleName", sql.NVarChar, roleName);

    const check = await request.query(
      `SELECT Id FROM Roles WHERE RoleName = @roleName AND TenantId = @tenantId AND Id != @id`,
    );
    if (check.recordset.length > 0)
      return res.status(400).json({ message: "Tên vai trò này đã tồn tại." });

    const result = await request.query(
      `UPDATE Roles SET RoleName = @roleName WHERE Id = @id AND TenantId = @tenantId`,
    );

    if (result.rowsAffected[0] === 0) {
      return res.status(403).json({
        message: "Vai trò không tồn tại hoặc bạn không có quyền sửa!",
      });
    }

    res.json({ message: "Cập nhật vai trò thành công!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi cập nhật vai trò." });
  }
};

const deleteRole = async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;

  try {
    const request = new sql.Request();
    request.input("id", sql.Int, id);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    const checkOwner = await request.query(`
      SELECT Id FROM Roles WHERE Id = @id AND TenantId = @tenantId
    `);
    if (checkOwner.recordset.length === 0) {
      return res.status(403).json({
        message: "Không tìm thấy vai trò hoặc bạn không có quyền xóa!",
      });
    }

    const checkUsage = await request.query(`
      SELECT TOP 1 UserId FROM UserBranchRoles WHERE RoleId = @id
    `);
    if (checkUsage.recordset.length > 0) {
      return res.status(400).json({
        message:
          "Không thể xóa! Vai trò này đang được gán cho nhân viên đang hoạt động.",
      });
    }

    await request.query(`
      DELETE rp FROM RolePermissions rp
      INNER JOIN Roles r ON rp.RoleId = r.Id
      WHERE rp.RoleId = @id AND r.TenantId = @tenantId
    `);

    const result = await request.query(
      `DELETE FROM Roles WHERE Id = @id AND TenantId = @tenantId`,
    );

    if (result.rowsAffected[0] === 0) {
      return res.status(403).json({
        message: "Vai trò không tồn tại hoặc bạn không có quyền xóa!",
      });
    }

    res.json({ message: "Xóa vai trò thành công!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi xóa vai trò." });
  }
};

module.exports = {
  getRoles,
  getAllRolesDropdown,
  createRole,
  updateRole,
  deleteRole,
};
