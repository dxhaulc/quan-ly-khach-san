const { sql } = require('../config/db');

const getServices = async (req, res) => {
    const tenantId = req.tenantId;
    const branchId = req.headers['x-branch-id'];

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const search = req.query.search || '';
    const type = req.query.type || 'all';
    const categoryId = req.query.categoryId || 'all';
    const stockStatus = req.query.stockStatus || 'all';
    const status = req.query.status || 'active';

    if (!branchId) return res.status(400).json({ message: 'Thiếu thông tin chi nhánh.' });

    try {
        const request = new sql.Request();
        request.input('tenantId', sql.UniqueIdentifier, tenantId);
        request.input('branchId', sql.Int, branchId);

        let whereConditions = ['hs.TenantId = @tenantId'];

        if (status === 'active') whereConditions.push('hs.IsDelete = 0');
        else if (status === 'inactive') whereConditions.push('hs.IsDelete = 1');

        if (search.trim() !== '') {
            request.input('search', sql.NVarChar, `%${search}%`);
            whereConditions.push('hs.ServiceName LIKE @search');
        }

        if (categoryId !== 'all') {
            request.input('categoryId', sql.Int, categoryId);
            whereConditions.push('hs.CategoryId = @categoryId');
        }

        if (type === 'goods') whereConditions.push('hs.IsInventoryItem = 1');
        else if (type === 'service') whereConditions.push('hs.IsInventoryItem = 0');

        if (stockStatus === 'in_stock') {
            whereConditions.push('(hs.IsInventoryItem = 0 OR (hs.IsInventoryItem = 1 AND ISNULL(bi.Stock, 0) > 0))');
        } else if (stockStatus === 'out_of_stock') {
            whereConditions.push('(hs.IsInventoryItem = 1 AND ISNULL(bi.Stock, 0) <= 0)');
        } else if (stockStatus === 'below_min') {
            whereConditions.push('(hs.IsInventoryItem = 1 AND ISNULL(bi.Stock, 0) < ISNULL(bi.MinStock, 0))');
        }

        const whereClause = 'WHERE ' + whereConditions.join(' AND ');

        const countResult = await request.query(`
            SELECT COUNT(*) as Total
            FROM HotelServices hs
            LEFT JOIN ServiceCategories sc ON hs.CategoryId = sc.Id
            LEFT JOIN BranchInventory bi ON hs.Id = bi.ServiceID AND bi.BranchId = @branchId
            ${whereClause}
        `);
        const totalItems = countResult.recordset[0].Total;
        const totalPages = Math.ceil(totalItems / limit);

        request.input('offset', sql.Int, offset);
        request.input('limit', sql.Int, limit);

        const servicesResult = await request.query(`
            SELECT 
                hs.Id, hs.ServiceName, hs.Unit, hs.IsInventoryItem, hs.Price, hs.ImageUrl, hs.IsDelete,
                hs.CategoryId, sc.Name AS CategoryName,
                ISNULL(bi.Stock, 0) AS Stock, 
                ISNULL(bi.MinStock, 0) AS MinStock
            FROM HotelServices hs
            LEFT JOIN ServiceCategories sc ON hs.CategoryId = sc.Id
            LEFT JOIN BranchInventory bi ON hs.Id = bi.ServiceID AND bi.BranchId = @branchId
            ${whereClause}
            ORDER BY hs.Id DESC 
            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY
        `);

        res.json({ 
            data: servicesResult.recordset, 
            pagination: { totalItems, totalPages, currentPage: page, limit } 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server khi lấy danh sách' });
    }
};

const createService = async (req, res) => {
    const tenantId = req.tenantId;
    const branchId = req.headers['x-branch-id'];
    const { categoryId, serviceName, unit, isInventoryItem, price, imageUrl, stock, minStock } = req.body;

    if (!branchId) return res.status(400).json({ message: 'Thiếu thông tin chi nhánh.' });

    const transaction = new sql.Transaction();
    try {
        await transaction.begin();
        const request = new sql.Request(transaction);

        request.input('categoryId', sql.Int, categoryId);
        request.input('tenantId', sql.UniqueIdentifier, tenantId);
        request.input('serviceName', sql.NVarChar, serviceName);
        request.input('unit', sql.NVarChar, unit || '');
        request.input('isInventoryItem', sql.Bit, isInventoryItem ? 1 : 0);
        request.input('price', sql.Decimal(18, 2), price || 0);
        request.input('imageUrl', sql.NVarChar, imageUrl || '');

        const serviceResult = await request.query(`
            INSERT INTO HotelServices (CategoryId, TenantId, ServiceName, Unit, IsInventoryItem, Price, ImageUrl, IsDelete)
            OUTPUT INSERTED.Id
            VALUES (@categoryId, @tenantId, @serviceName, @unit, @isInventoryItem, @price, @imageUrl, 0)
        `);

        const newServiceId = serviceResult.recordset[0].Id;
         
        if (isInventoryItem) {
            const invReq = new sql.Request(transaction);
            invReq.input('branchId', sql.Int, branchId);
            invReq.input('serviceId', sql.Int, newServiceId);
            invReq.input('stock', sql.Int, stock || 0);
            invReq.input('minStock', sql.Int, minStock || 0);

            await invReq.query(`
                INSERT INTO BranchInventory (BranchId, ServiceID, Stock, MinStock)
                VALUES (@branchId, @serviceId, @stock, @minStock)
            `);
        }

        await transaction.commit();
        res.status(201).json({ message: 'Thêm mới thành công!' });
    } catch (err) {
        console.error(err);
        await transaction.rollback();
        res.status(500).json({ message: 'Lỗi server khi thêm mới.' });
    }
};

const updateService = async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const branchId = req.headers['x-branch-id'];
    const { categoryId, serviceName, unit, isInventoryItem, price, imageUrl, stock, minStock, isDelete } = req.body;

    if (!branchId) return res.status(400).json({ message: 'Thiếu thông tin chi nhánh.' });

    const transaction = new sql.Transaction();
    try {
        await transaction.begin();
        
        const request = new sql.Request(transaction);
        request.input('id', sql.Int, id);
        request.input('tenantId', sql.UniqueIdentifier, tenantId);
        request.input('categoryId', sql.Int, categoryId);
        request.input('serviceName', sql.NVarChar, serviceName);
        request.input('unit', sql.NVarChar, unit || '');
        request.input('isInventoryItem', sql.Bit, isInventoryItem ? 1 : 0);
        request.input('price', sql.Decimal(18, 2), price || 0);
        request.input('imageUrl', sql.NVarChar, imageUrl || '');
        request.input('isDelete', sql.Bit, isDelete !== undefined ? isDelete : 0);

        await request.query(`
            UPDATE HotelServices 
            SET CategoryId = @categoryId, ServiceName = @serviceName, Unit = @unit, 
                IsInventoryItem = @isInventoryItem, Price = @price, ImageUrl = @imageUrl, IsDelete = @isDelete
            WHERE Id = @id AND TenantId = @tenantId
        `);

        if (isInventoryItem) {
            const invReq = new sql.Request(transaction);
            invReq.input('branchId', sql.Int, branchId);
            invReq.input('serviceId', sql.Int, id);
            invReq.input('stock', sql.Int, stock || 0);
            invReq.input('minStock', sql.Int, minStock || 0);

            await invReq.query(`
                IF EXISTS (SELECT 1 FROM BranchInventory WHERE BranchId = @branchId AND ServiceID = @serviceId)
                    UPDATE BranchInventory SET Stock = @stock, MinStock = @minStock WHERE BranchId = @branchId AND ServiceID = @serviceId
                ELSE
                    INSERT INTO BranchInventory (BranchId, ServiceID, Stock, MinStock) VALUES (@branchId, @serviceId, @stock, @minStock)
            `);
        }

        await transaction.commit();
        res.json({ message: 'Cập nhật thành công!' });
    } catch (err) {
        console.error(err);
        await transaction.rollback();
        res.status(500).json({ message: 'Lỗi server khi cập nhật.' });
    }
};

const deleteService = async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('tenantId', sql.UniqueIdentifier, tenantId);

        await request.query(`
            UPDATE HotelServices 
            SET IsDelete = 1 
            WHERE Id = @id AND TenantId = @tenantId
        `);

        res.json({ message: 'Đã chuyển sang Ngừng kinh doanh!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server khi xóa.' });
    }
};

module.exports = {
    getServices,
    createService,
    updateService,
    deleteService
};