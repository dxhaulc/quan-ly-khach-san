const { sql } = require("../config/db");
const bcrypt = require("bcrypt");

const getUsers = async (req, res) => {
  const tenantId = req.tenantId;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  const search = req.query.search || "";
  const status = req.query.status || "active";

  try {
    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    let whereConditions = ["u.TenantId = @tenantId"];

    if (search.trim() !== "") {
      request.input("search", sql.NVarChar, `%${search}%`);
      whereConditions.push(
        "(u.FullName LIKE @search OR u.Username LIKE @search OR u.Email LIKE @search OR u.Phone LIKE @search)",
      );
    }

    if (status === "active") {
      whereConditions.push("u.IsDelete = 0");
    } else if (status === "inactive") {
      whereConditions.push("u.IsDelete = 1");
    }

    const whereClause = "WHERE " + whereConditions.join(" AND ");

    const countResult = await request.query(`
      SELECT COUNT(*) as Total
      FROM Users u
      ${whereClause}
    `);
    const totalItems = countResult.recordset[0].Total;
    const totalPages = Math.ceil(totalItems / limit) || 1;

    request.input("offset", sql.Int, offset);
    request.input("limit", sql.Int, limit);

    const usersResult = await request.query(`
      WITH UserRoles AS (
        SELECT 
          u.Id, u.Username, u.FullName, u.Email, u.Phone, u.IsAdmin, u.IsDelete,
          STUFF((SELECT ',' + CAST(BranchId AS VARCHAR) + '-' + CAST(RoleId AS VARCHAR) 
                  FROM UserBranchRoles WHERE UserId = u.Id FOR XML PATH('')), 1, 1, '') AS AssignmentData,
          STUFF((SELECT ', ' + r.RoleName FROM UserBranchRoles ubr INNER JOIN Roles r ON ubr.RoleId = r.Id WHERE ubr.UserId = u.Id FOR XML PATH('')), 1, 2, '') AS Roles,
          STUFF((SELECT ', ' + b.Name FROM UserBranchRoles ubr INNER JOIN Branches b ON ubr.BranchId = b.Id WHERE ubr.UserId = u.Id FOR XML PATH('')), 1, 2, '') AS Branches
        FROM Users u
        ${whereClause}
      )
      SELECT * 
      FROM UserRoles 
      ORDER BY FullName ASC 
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      data: usersResult.recordset,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi lấy danh sách tài khoản." });
  }
};

const createUser = async (req, res) => {
  const tenantId = req.tenantId;
  const { username, password, fullName, email, phone, isAdmin, assignments } =
    req.body;

  const transaction = new sql.Transaction();
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("username", sql.VarChar, username);
    request.input("phone", sql.VarChar, phone || "");

    const checkUser = await request.query(
      `SELECT Id FROM Users WHERE Username = @username AND TenantId = @tenantId`,
    );
    if (checkUser.recordset.length > 0)
      throw new Error("Tên đăng nhập đã tồn tại trong hệ thống!");

    const checkPhone = await request.query(
      `SELECT Id FROM Users WHERE Phone = @phone AND TenantId = @tenantId`,
    );
    if (checkPhone.recordset.length > 0) {
      throw new Error("Số điện thoại tồn tại trong hệ thống!");
    }

    const salt = await require("bcrypt").genSalt(10);
    const passwordHash = await require("bcrypt").hash(password, salt);

    request.input("passwordHash", sql.VarChar, passwordHash);
    request.input("fullName", sql.NVarChar, fullName || "");
    request.input("email", sql.VarChar, email || "");
    request.input("phone", sql.VarChar, phone || "");
    request.input("isAdmin", sql.Bit, isAdmin ? 1 : 0);

    const insertUser = await request.query(`
      INSERT INTO Users (TenantId, Username, PasswordHash, FullName, Email, Phone, IsAdmin, IsDelete)
      OUTPUT INSERTED.Id
      VALUES (@tenantId, @username, @passwordHash, @fullName, @email, @phone, @isAdmin, 0)
    `);

    const newUserId = insertUser.recordset[0].Id;

    if (!isAdmin && assignments && assignments.length > 0) {
      for (const assign of assignments) {
        if (assign.branchId && assign.roleId) {
          const roleReq = new sql.Request(transaction);
          roleReq.input("userId", sql.UniqueIdentifier, newUserId);
          roleReq.input("branchId", sql.Int, assign.branchId);
          roleReq.input("roleId", sql.Int, assign.roleId);
          await roleReq.query(
            `INSERT INTO UserBranchRoles (UserId, BranchId, RoleId) VALUES (@userId, @branchId, @roleId)`,
          );
        }
      }
    }

    await transaction.commit();
    res.status(201).json({ message: "Tạo tài khoản thành công!" });
  } catch (err) {
    await transaction.rollback();
    res.status(400).json({ message: err.message || "Lỗi khi tạo tài khoản." });
  }
};

const updateUser = async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;
  const { fullName, email, phone, isAdmin, assignments, isDelete } = req.body;

  const transaction = new sql.Transaction();
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    request.input("id", sql.UniqueIdentifier, id);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("fullName", sql.NVarChar, fullName);
    request.input("email", sql.VarChar, email || "");
    request.input("phone", sql.VarChar, phone || "");
    request.input("isAdmin", sql.Bit, isAdmin ? 1 : 0);
    request.input("isDelete", sql.Bit, isDelete ? 1 : 0);

    const updateResult = await request.query(`
      UPDATE Users 
      SET FullName = @fullName, Email = @email, Phone = @phone, IsAdmin = @isAdmin, IsDelete = @isDelete
      WHERE Id = @id AND TenantId = @tenantId
    `);

    if (updateResult.rowsAffected[0] === 0) {
      throw new Error(
        "Không tìm thấy tài khoản hoặc bạn không có quyền sửa tài khoản này!",
      );
    }

    await request.query(`DELETE FROM UserBranchRoles WHERE UserId = @id`);

    if (!isAdmin && assignments && assignments.length > 0) {
      for (const assign of assignments) {
        if (assign.branchId && assign.roleId) {
          const roleReq = new sql.Request(transaction);
          roleReq.input("userId", sql.UniqueIdentifier, id);
          roleReq.input("branchId", sql.Int, assign.branchId);
          roleReq.input("roleId", sql.Int, assign.roleId);
          await roleReq.query(
            `INSERT INTO UserBranchRoles (UserId, BranchId, RoleId) VALUES (@userId, @branchId, @roleId)`,
          );
        }
      }
    }

    await transaction.commit();
    res.json({ message: "Cập nhật tài khoản thành công!" });
  } catch (err) {
    await transaction.rollback();
    res
      .status(400)
      .json({ message: err.message || "Lỗi khi cập nhật tài khoản." });
  }
};

const resetPassword = async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;
  const { newPassword } = req.body;

  try {
    if (!newPassword || newPassword.length < 6)
      return res
        .status(400)
        .json({ message: "Mật khẩu mới phải có ít nhất 6 ký tự." });

    const salt = await require("bcrypt").genSalt(10);
    const passwordHash = await require("bcrypt").hash(newPassword, salt);

    const request = new sql.Request();
    request.input("id", sql.UniqueIdentifier, id);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("passwordHash", sql.VarChar, passwordHash);

    const result = await request.query(`
      UPDATE Users 
      SET PasswordHash = @passwordHash 
      WHERE Id = @id AND TenantId = @tenantId
    `);

    if (result.rowsAffected[0] === 0) {
      return res
        .status(403)
        .json({ message: "Tài khoản không thuộc quyền quản lý của bạn!" });
    }

    res.json({ message: "Cấp lại mật khẩu thành công!" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi khi cấp lại mật khẩu." });
  }
};

const deleteUser = async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;
  try {
    const request = new sql.Request();
    request.input("id", sql.UniqueIdentifier, id);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    const result = await request.query(`
      UPDATE Users 
      SET IsDelete = 1 
      WHERE Id = @id AND TenantId = @tenantId
    `);

    if (result.rowsAffected[0] === 0) {
      return res
        .status(403)
        .json({ message: "Tài khoản không thuộc quyền quản lý của bạn!" });
    }

    res.json({ message: "Đã vô hiệu hóa tài khoản!" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi khi vô hiệu hóa tài khoản." });
  }
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
  resetPassword,
  deleteUser,
};
