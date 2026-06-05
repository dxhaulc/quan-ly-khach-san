const { sql } = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const login = async (req, res) => {
  const { subdomain, username, password, loginType } = req.body; 

  try {
    const tenantReq = new sql.Request();
    tenantReq.input("subdomain", sql.VarChar, subdomain);
    const tenantResult = await tenantReq.query(`
      SELECT Id, HotelName, Status 
      FROM Tenants 
      WHERE SubDomain = @subdomain AND Status = 'Active' AND IsDeleted = 0
    `);

    if (tenantResult.recordset.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy khách sạn hoặc khách sạn đã bị khóa!" });
    }
    const tenant = tenantResult.recordset[0];

    const userReq = new sql.Request();
    userReq.input("identifier", sql.VarChar, username);
    userReq.input("tenantId", sql.UniqueIdentifier, tenant.Id);
    
    const userResult = await userReq.query(`
      SELECT Id, Username, PasswordHash, FullName, IsAdmin 
      FROM Users 
      WHERE (Username = @identifier OR Phone = @identifier) 
        AND TenantId = @tenantId AND IsDelete = 0
    `);

    if (userResult.recordset.length === 0) {
      return res.status(401).json({ message: "Tài khoản hoặc số điện thoại không tồn tại trong hệ thống này hoặc đã bị khóa!" });
    }
    const user = userResult.recordset[0];

    const isMatch = await bcrypt.compare(password, user.PasswordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Sai mật khẩu!" });
    }

    let branchRoles = [];
    let accessibleBranches = [];

    const branchReq = new sql.Request();
    branchReq.input("tenantId", sql.UniqueIdentifier, tenant.Id);
    branchReq.input("userId", sql.UniqueIdentifier, user.Id);

    if (user.IsAdmin) {
      const allBranchesResult = await branchReq.query(`
        SELECT Id AS BranchId, Name AS BranchName 
        FROM Branches 
        WHERE TenantId = @tenantId AND IsActive = 1
      `);
      accessibleBranches = allBranchesResult.recordset;
    } else {
      const roleResult = await branchReq.query(`
        SELECT ubr.BranchId, b.Name as BranchName, r.RoleName
        FROM UserBranchRoles ubr
        JOIN Roles r ON ubr.RoleId = r.Id
        JOIN Branches b ON ubr.BranchId = b.Id
        WHERE ubr.UserId = @userId AND b.IsActive = 1
      `);
      branchRoles = roleResult.recordset;

      const uniqueBranches = new Map();
      branchRoles.forEach((br) => {
        if (!uniqueBranches.has(br.BranchId)) {
          uniqueBranches.set(br.BranchId, { BranchId: br.BranchId, BranchName: br.BranchName });
        }
      });
      accessibleBranches = Array.from(uniqueBranches.values());
    }

    const isManager = user.IsAdmin || branchRoles.some((br) => br.RoleName.includes("Manager"));
    const isReceptionist = branchRoles.some((br) => br.RoleName.includes("Receptionist"));

    if (loginType === "MANAGER" && !isManager) {
      return res.status(403).json({ message: "Bạn không có quyền đăng nhập vào Cổng Quản lý!" });
    }

    if (loginType === "RECEPTIONIST" && !isReceptionist && !isManager) {
      return res.status(403).json({ message: "Bạn không có quyền đăng nhập vào Cổng Lễ tân!" });
    }

    const tokenPayload = {
      id: user.Id, tenantId: tenant.Id, fullName: user.FullName,
      isAdmin: user.IsAdmin, branchRoles: branchRoles,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: "24h" });

    res.json({
      message: "Đăng nhập thành công",
      token: token,
      user: {
        hotelName: tenant.HotelName,
        fullName: user.FullName,
        isAdmin: user.IsAdmin,
        accessibleBranches: accessibleBranches,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server!" });
  }
};

const registerTenant = async (req, res) => {
  const { hotelName, subdomain, fullName, phone, username, password } = req.body;

  const transaction = new sql.Transaction();
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);

    request.input("subdomain", sql.VarChar, subdomain);
    const checkSubdomain = await request.query(`SELECT Id FROM Tenants WHERE SubDomain = @subdomain`);
    if (checkSubdomain.recordset.length > 0) {
      throw new Error("Mã khách sạn (Subdomain) này đã được sử dụng. Vui lòng chọn mã khác!");
    }

    request.input("hotelName", sql.NVarChar, hotelName);
    request.input("phone", sql.VarChar, phone);
    const tenantResult = await request.query(`
      INSERT INTO Tenants (HotelName, SubDomain, ContactPhone, Status, IsDeleted)
      OUTPUT INSERTED.Id
      VALUES (@hotelName, @subdomain, @phone, 'Active', 0)
    `);
    const newTenantId = tenantResult.recordset[0].Id;

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const userReq = new sql.Request(transaction);
    userReq.input("tenantId", sql.UniqueIdentifier, newTenantId);
    userReq.input("username", sql.VarChar, username);
    userReq.input("passwordHash", sql.VarChar, passwordHash);
    userReq.input("fullName", sql.NVarChar, fullName);
    userReq.input("phone", sql.VarChar, phone);
    userReq.input("email", sql.VarChar, ""); 
    userReq.input("isAdmin", sql.Bit, 1); 

    await userReq.query(`
      INSERT INTO Users (TenantId, Username, PasswordHash, FullName, Email, Phone, IsAdmin, IsDelete)
      VALUES (@tenantId, @username, @passwordHash, @fullName, @email, @phone, @isAdmin, 0)
    `);

    const branchReq = new sql.Request(transaction);
    branchReq.input("tId", sql.UniqueIdentifier, newTenantId);
    branchReq.input("bName", sql.NVarChar, "Chi nhánh Trung tâm");
    await branchReq.query(`INSERT INTO Branches (TenantId, Name, IsActive) VALUES (@tId, @bName, 1)`);

    await transaction.commit();
    res.status(201).json({ message: "Khởi tạo hệ thống thành công! Bạn có thể đăng nhập ngay." });
                    
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(400).json({ message: err.message || "Lỗi khi khởi tạo hệ thống." });
  }
};

module.exports = { login, registerTenant };