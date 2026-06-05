const { sql } = require("../config/db");
const bcrypt = require("bcrypt");

const getMyProfile = async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.tenantId;

  try {
    const request = new sql.Request();
    request.input("id", sql.UniqueIdentifier, userId);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    const result = await request.query(`
      SELECT Id, Username, FullName, Email, Phone, IsAdmin 
      FROM Users 
      WHERE Id = @id AND TenantId = @tenantId
    `);

    if (result.recordset.length === 0) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy thông tin tài khoản." });
    }
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi lấy thông tin cá nhân." });
  }
};

const updateMyProfile = async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.tenantId;
  const { fullName, email, phone } = req.body;

  try {
    const request = new sql.Request();
    request.input("id", sql.UniqueIdentifier, userId);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("fullName", sql.NVarChar, fullName);
    request.input("email", sql.VarChar, email || "");
    request.input("phone", sql.VarChar, phone || "");

    const checkPhone = await request.query(
      `SELECT Id FROM Users WHERE Phone = @phone AND TenantId = @tenantId AND Id != @id`,
    );
    if (checkPhone.recordset.length > 0) {
      return res.status(400).json({ message: "Số điện thoại đã tồn tại trong hệ thống!" });
    }

    const result = await request.query(`
      UPDATE Users 
      SET FullName = @fullName, Email = @email, Phone = @phone 
      WHERE Id = @id AND TenantId = @tenantId
    `);

    if (result.rowsAffected[0] === 0) {
      return res
        .status(403)
        .json({ message: "Tài khoản không tồn tại hoặc lỗi xác thực." });
    }

    res.json({ message: "Cập nhật thông tin thành công!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi cập nhật thông tin cá nhân." });
  }
};

const changeMyPassword = async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.tenantId;
  const { oldPassword, newPassword } = req.body;

  try {
    if (!oldPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Vui lòng nhập đầy đủ mật khẩu cũ và mới." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Mật khẩu mới phải từ 6 ký tự." });
    }

    const request = new sql.Request();
    request.input("id", sql.UniqueIdentifier, userId);
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    const userRes = await request.query(`
      SELECT PasswordHash 
      FROM Users 
      WHERE Id = @id AND TenantId = @tenantId
    `);

    if (userRes.recordset.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản." });
    }

    const user = userRes.recordset[0];

    const isMatch = await bcrypt.compare(oldPassword, user.PasswordHash);
    if (!isMatch) {
      return res.status(400).json({ message: "Mật khẩu cũ không chính xác!" });
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    request.input("newHash", sql.VarChar, newPasswordHash);

    await request.query(`
      UPDATE Users 
      SET PasswordHash = @newHash 
      WHERE Id = @id AND TenantId = @tenantId
    `);

    res.json({ message: "Đổi mật khẩu thành công!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi đổi mật khẩu." });
  }
};

module.exports = { getMyProfile, updateMyProfile, changeMyPassword };
