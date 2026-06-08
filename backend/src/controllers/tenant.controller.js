const { sql } = require("../config/db");

const getTenant = async (req, res) => {
  const tenantId = req.tenantId;
  try {
    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);

    const result = await request.query(`
      SELECT Id, HotelName, SubDomain, ContactPhone, Status, VATTaxRate, CreatedAt
      FROM Tenants
      WHERE Id = @tenantId AND IsDeleted = 0
    `);

    if (result.recordset.length === 0)
      return res.status(404).json({ message: "Không tìm thấy thông tin hệ thống." });

    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi lấy thông tin hệ thống." });
  }
};

const updateTenant = async (req, res) => {
  const tenantId = req.tenantId;
  const { hotelName, contactPhone, vatTaxRate } = req.body;

  try {
    if (!hotelName || hotelName.trim() === "")
      return res.status(400).json({ message: "Tên khách sạn không được để trống." });

    if (vatTaxRate === undefined || isNaN(vatTaxRate) || vatTaxRate < 0 || vatTaxRate > 100)
      return res.status(400).json({ message: "Thuế VAT không hợp lệ (0 - 100)." });

    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("hotelName", sql.NVarChar, hotelName.trim());
    request.input("contactPhone", sql.VarChar, contactPhone || "");
    request.input("vatTaxRate", sql.Decimal(5, 2), parseFloat(vatTaxRate));

    const result = await request.query(`
      UPDATE Tenants
      SET HotelName = @hotelName, ContactPhone = @contactPhone, VATTaxRate = @vatTaxRate
      WHERE Id = @tenantId AND IsDeleted = 0
    `);

    if (result.rowsAffected[0] === 0)
      return res.status(404).json({ message: "Không tìm thấy thông tin hệ thống." });

    res.json({ message: "Cập nhật thông tin hệ thống thành công!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi cập nhật thông tin hệ thống." });
  }
};

module.exports = { getTenant, updateTenant };