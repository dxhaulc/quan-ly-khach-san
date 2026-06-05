const { sql } = require('../config/db');

const getBranches = async (req, res) => {
    const tenantId = req.tenantId;
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    const search = req.query.search || '';
    const status = req.query.status || '';

    try {
        const request = new sql.Request();
        request.input('tenantId', sql.UniqueIdentifier, tenantId);

        let whereConditions = ['TenantId = @tenantId'];

        if (search.trim() !== '') {
            request.input('search', sql.NVarChar, `%${search}%`);
            whereConditions.push('(Name LIKE @search OR Phone LIKE @search OR Address LIKE @search)');
        }

        if (status === 'active') {
            whereConditions.push('IsActive = 1');
        } else if (status === 'inactive') {
            whereConditions.push('IsActive = 0');
        }

        const whereClause = 'WHERE ' + whereConditions.join(' AND ');

        const countResult = await request.query(`
            SELECT COUNT(*) as Total
            FROM Branches
            ${whereClause}
        `);
        const totalItems = countResult.recordset[0].Total;
        const totalPages = Math.ceil(totalItems / limit) || 1;

        request.input('offset', sql.Int, offset);
        request.input('limit', sql.Int, limit);

        const branchesResult = await request.query(`
            SELECT Id, Name, Address, Phone, IsActive
            FROM Branches
            ${whereClause}
            ORDER BY Id ASC 
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);

        res.json({ 
            data: branchesResult.recordset,
            pagination: { currentPage: page, totalPages: totalPages }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi khi lấy danh sách chi nhánh.' });
    }
};

const getAllBranchesDropdown = async (req, res) => {
    const tenantId = req.tenantId;
    try {
        const request = new sql.Request();
        request.input('tenantId', sql.UniqueIdentifier, tenantId);
        
        const result = await request.query(`
            SELECT Id, Name 
            FROM Branches 
            WHERE TenantId = @tenantId AND IsActive = 1
            ORDER BY Id ASC
        `);
        res.json({ data: result.recordset });
    } catch (err) {
        console.error("Lỗi lấy danh sách Branches:", err);
        res.status(500).json({ message: 'Lỗi khi lấy danh sách chi nhánh.' });
    }
};

const createBranch = async (req, res) => {
    const tenantId = req.tenantId;
    const { name, address, phone } = req.body;

    try {
        if (!name) return res.status(400).json({ message: 'Tên chi nhánh không được để trống.' });

        const request = new sql.Request();
        request.input('tenantId', sql.UniqueIdentifier, tenantId);
        request.input('name', sql.NVarChar, name);
        request.input('address', sql.NVarChar, address || '');
        request.input('phone', sql.VarChar, phone || '');

        const check = await request.query(`SELECT Id FROM Branches WHERE Name = @name AND TenantId = @tenantId`);
        if (check.recordset.length > 0) {
            return res.status(400).json({ message: 'Tên chi nhánh này đã tồn tại trong hệ thống của bạn!' });
        }

        await request.query(`
            INSERT INTO Branches (TenantId, Name, Address, Phone, IsActive) 
            VALUES (@tenantId, @name, @address, @phone, 1)
        `);
        
        res.status(201).json({ message: 'Thêm chi nhánh thành công!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi khi thêm chi nhánh.' });
    }
};

const updateBranch = async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const { name, address, phone, isActive } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('tenantId', sql.UniqueIdentifier, tenantId);
        request.input('name', sql.NVarChar, name);
        request.input('address', sql.NVarChar, address || '');
        request.input('phone', sql.VarChar, phone || '');
        request.input('isActive', sql.Bit, isActive ? 1 : 0);

        const check = await request.query(`SELECT Id FROM Branches WHERE Name = @name AND TenantId = @tenantId AND Id != @id`);
        if (check.recordset.length > 0) {
            return res.status(400).json({ message: 'Tên chi nhánh này đã tồn tại!' });
        }

        const result = await request.query(`
            UPDATE Branches 
            SET Name = @name, Address = @address, Phone = @phone, IsActive = @isActive
            WHERE Id = @id AND TenantId = @tenantId
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(403).json({ message: 'Chi nhánh không tồn tại hoặc bạn không có quyền sửa!' });
        }

        res.json({ message: 'Cập nhật chi nhánh thành công!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi khi cập nhật chi nhánh.' });
    }
};

const deleteBranch = async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId;
    
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('tenantId', sql.UniqueIdentifier, tenantId);

        const result = await request.query(`UPDATE Branches SET IsActive = 0 WHERE Id = @id AND TenantId = @tenantId`);
        
        if (result.rowsAffected[0] === 0) {
            return res.status(403).json({ message: 'Chi nhánh không tồn tại hoặc bạn không có quyền thao tác!' });
        }

        res.json({ message: 'Đã tạm ngưng hoạt động chi nhánh!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi khi tạm ngưng chi nhánh.' });
    }
};

module.exports = { getBranches, getAllBranchesDropdown, createBranch, updateBranch, deleteBranch };