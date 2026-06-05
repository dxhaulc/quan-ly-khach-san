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

    const hasRole = req.user.branchRoles.some((br) =>
      allowedRoles.includes(br.RoleName),
    );

    if (!hasRole) {
      return res.status(403).json({ message: "Bạn không có quyền!" });
    }

    next();
  };
};

module.exports = { verifyToken, checkRole };
