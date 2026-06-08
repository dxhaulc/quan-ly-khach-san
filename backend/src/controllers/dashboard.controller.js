const { sql } = require("../config/db");

const pad = (n) => String(n).padStart(2, "0");

const process7DaysChart = (sqlRecords) => {
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateLabel = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
    const sqlDateMatch = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const record = sqlRecords.find(
      (r) => new Date(r.PaymentDate).toISOString().split("T")[0] === sqlDateMatch
    );
    last7Days.push({ date: dateLabel, revenue: record ? record.DailyRevenue : 0 });
  }
  return last7Days;
};

const processMonthChart = (sqlRecords, year, month) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthData = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const record = sqlRecords.find((r) => r.PaymentDay === day);
    monthData.push({ date: `Ngày ${day}`, revenue: record ? record.DailyRevenue : 0 });
  }
  return monthData;
};

const getDashboardData = async (req, res) => {
  const tenantId = req.tenantId;
  const branchId = req.headers["x-branch-id"];

  if (!branchId) return res.status(400).json({ message: "Thiếu thông tin chi nhánh." });

  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = lastMonthDate.getMonth() + 1;
  const lastMonthYear = lastMonthDate.getFullYear();

  try {
    const request = new sql.Request();
    request.input("tenantId", sql.UniqueIdentifier, tenantId);
    request.input("branchId", sql.Int, branchId);
    request.input("thisMonth", sql.Int, thisMonth);
    request.input("thisYear", sql.Int, thisYear);
    request.input("lastMonth", sql.Int, lastMonth);
    request.input("lastMonthYear", sql.Int, lastMonthYear);

    const [summaryRes, chart7DaysRes, chartMonthRes, chartLastMonthRes] = await Promise.all([
      request.query(`
        SELECT 
          ISNULL(SUM(CASE WHEN CAST(i.PaymentDate AS DATE) = CAST(GETDATE() AS DATE) THEN i.TotalAmount + ISNULL(b.DepositAmount, 0) ELSE 0 END), 0) AS TodayRevenue,
          ISNULL(SUM(CASE WHEN MONTH(i.PaymentDate) = @thisMonth AND YEAR(i.PaymentDate) = @thisYear THEN i.TotalAmount + ISNULL(b.DepositAmount, 0) ELSE 0 END), 0) AS MonthRevenue
        FROM Invoices i
        INNER JOIN Bookings b ON i.BookingId = b.Id
        WHERE i.TenantId = @tenantId AND b.BranchId = @branchId
      `),
      request.query(`
        SELECT CAST(i.PaymentDate AS DATE) AS PaymentDate, SUM(i.TotalAmount + ISNULL(b.DepositAmount, 0)) AS DailyRevenue
        FROM Invoices i
        INNER JOIN Bookings b ON i.BookingId = b.Id
        WHERE i.TenantId = @tenantId AND b.BranchId = @branchId
          AND CAST(i.PaymentDate AS DATE) >= CAST(GETDATE() - 6 AS DATE)
        GROUP BY CAST(i.PaymentDate AS DATE)
      `),
      request.query(`
        SELECT DAY(i.PaymentDate) AS PaymentDay, SUM(i.TotalAmount + ISNULL(b.DepositAmount, 0)) AS DailyRevenue
        FROM Invoices i
        INNER JOIN Bookings b ON i.BookingId = b.Id
        WHERE i.TenantId = @tenantId AND b.BranchId = @branchId
          AND MONTH(i.PaymentDate) = @thisMonth AND YEAR(i.PaymentDate) = @thisYear
        GROUP BY DAY(i.PaymentDate)
      `),
      request.query(`
        SELECT DAY(i.PaymentDate) AS PaymentDay, SUM(i.TotalAmount + ISNULL(b.DepositAmount, 0)) AS DailyRevenue
        FROM Invoices i
        INNER JOIN Bookings b ON i.BookingId = b.Id
        WHERE i.TenantId = @tenantId AND b.BranchId = @branchId
          AND MONTH(i.PaymentDate) = @lastMonth AND YEAR(i.PaymentDate) = @lastMonthYear
        GROUP BY DAY(i.PaymentDate)
      `),
    ]);

    res.json({
      todayRevenue: summaryRes.recordset[0].TodayRevenue,
      monthRevenue: summaryRes.recordset[0].MonthRevenue,
      chart7Days: process7DaysChart(chart7DaysRes.recordset),
      chartMonth: processMonthChart(chartMonthRes.recordset, thisYear, thisMonth),
      chartLastMonth: processMonthChart(chartLastMonthRes.recordset, lastMonthYear, lastMonth),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi hệ thống khi lấy dữ liệu báo cáo." });
  }
};

module.exports = { getDashboardData };