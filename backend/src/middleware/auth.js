const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Vui lòng đăng nhập!" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err)
      return res
        .status(403)
        .json({ message: "Token không hợp lệ hoặc đã hết hạn!" });

    req.user = decoded;

    req.tenantId = decoded.tenantId;

    next();
  });
};

const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (req.user.isAdmin) return next();

    const currentBranchId = req.headers["x-branch-id"];

    if (!currentBranchId) {
      return res.status(400).json({ message: "Thiếu thông tin chi nhánh đang thao tác!" });
    }

    const hasRoleInCurrentBranch = req.user.branchRoles.some(
      (br) => 
        String(br.BranchId).toLowerCase() === String(currentBranchId).toLowerCase() && 
        allowedRoles.includes(br.RoleName)
    );

    if (!hasRoleInCurrentBranch) {
      return res.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này tại chi nhánh hiện tại!" });
    }

    next();
  };
};

module.exports = { verifyToken, checkRole };
