const { sql } = require('../config/db');

const getRooms = async (req, res) => {
    const tenantId = req.tenantId; 
    const branchId = req.headers['x-branch-id'];
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const search = req.query.search || '';
    const isActive = req.query.isActive || 'active'; 
    const roomTypeId = req.query.roomTypeId || 'all';

    if (!branchId) {
        return res.status(400).json({ message: 'Thiếu thông tin chi nhánh.' });
    }

    try {
        const request = new sql.Request();
        request.input('tenantId', sql.UniqueIdentifier, tenantId);
        request.input('branchId', sql.Int, branchId);

        let whereConditions = [
            'b.TenantId = @tenantId', 
            'r.BranchId = @branchId'
        ];

        if (isActive === 'active') {
            whereConditions.push('r.IsDelete = 0');
        } else if (isActive === 'inactive') {
            whereConditions.push('r.IsDelete = 1');
        }

        if (search.trim() !== '') {
            request.input('search', sql.NVarChar, `%${search}%`);
            whereConditions.push('(r.RoomNumber LIKE @search)');
        }

        if (roomTypeId !== 'all') {
            request.input('roomTypeId', sql.Int, roomTypeId);
            whereConditions.push('r.RoomTypeId = @roomTypeId');
        }

        const whereClause = 'WHERE ' + whereConditions.join(' AND ');

        const countResult = await request.query(`
            SELECT COUNT(*) as Total
            FROM Rooms r
            LEFT JOIN RoomTypes rt ON r.RoomTypeId = rt.Id
            LEFT JOIN Branches b ON r.BranchId = b.Id
            ${whereClause}
        `);
        const totalItems = countResult.recordset[0].Total;
        const totalPages = Math.ceil(totalItems / limit);

        request.input('offset', sql.Int, offset);
        request.input('limit', sql.Int, limit);
        
        const roomsResult = await request.query(`
            SELECT 
                r.Id, r.RoomNumber, r.Status, r.IsDelete, r.RoomTypeId, 
                rt.TypeName, b.Name AS BranchName
            FROM Rooms r
            LEFT JOIN RoomTypes rt ON r.RoomTypeId = rt.Id
            LEFT JOIN Branches b ON r.BranchId = b.Id
            ${whereClause}
            ORDER BY r.RoomNumber ASC 
            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY
        `);

        const rooms = roomsResult.recordset;

        if (rooms.length === 0) {
            return res.json({ data: [], pagination: { totalItems, totalPages, currentPage: page, limit } });
        }

        const roomIds = rooms.map(r => r.Id);
        const uniqueRoomTypeIds = [...new Set(rooms.map(r => r.RoomTypeId))];
        
        const detailReq = new sql.Request();
        
        const imagesResult = await detailReq.query(`
            SELECT RoomId, Id, ImageUrl, IsPrimary 
            FROM RoomImages 
            WHERE RoomId IN (${roomIds.join(',')})
        `);

        const pricesResult = await detailReq.query(`
            SELECT pc.RoomTypeId, ps.Name AS SlotName, pc.DayType, pc.Price, pc.FirstBlockHours, pc.ExtraHourPrice
            FROM RoomTypePriceConfig pc
            JOIN PriceSlots ps ON pc.PriceSlotID = ps.Id
            WHERE pc.RoomTypeId IN (${uniqueRoomTypeIds.join(',')})
        `);

        const formattedData = rooms.map(room => {
            return {
                ...room,
                Images: imagesResult.recordset.filter(img => img.RoomId === room.Id),
                PriceConfigs: pricesResult.recordset.filter(price => price.RoomTypeId === room.RoomTypeId)
            };
        });

        res.json({ 
            data: formattedData,
            pagination: { totalItems, totalPages, currentPage: page, limit }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server khi lấy danh sách phòng' });
    }
};

const createRoom = async (req, res) => {
    const branchId = req.headers['x-branch-id'];
    const { roomNumber, roomTypeId, status, images } = req.body;

    if (!branchId) return res.status(400).json({ message: 'Thiếu thông tin chi nhánh.' });

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();
        const request = new sql.Request(transaction);

        request.input('branchId', sql.Int, branchId);
        request.input('roomTypeId', sql.Int, roomTypeId);
        request.input('roomNumber', sql.VarChar, roomNumber);
        request.input('status', sql.VarChar, status || 'Available');

        const roomResult = await request.query(`
            INSERT INTO Rooms (BranchId, RoomTypeId, RoomNumber, Status, IsDelete)
            OUTPUT INSERTED.Id
            VALUES (@branchId, @roomTypeId, @roomNumber, @status, 0)
        `);

        const newRoomId = roomResult.recordset[0].Id;

        if (images && images.length > 0) {
            for (let i = 0; i < images.length; i++) {
                const imgReq = new sql.Request(transaction);
                imgReq.input("roomId", sql.Int, newRoomId);
                imgReq.input("imageUrl", sql.NVarChar, images[i]);
                imgReq.input("isPrimary", sql.Bit, i === 0 ? 1 : 0);

                await imgReq.query(`
                    INSERT INTO RoomImages (RoomId, ImageUrl, IsPrimary)
                    VALUES (@roomId, @imageUrl, @isPrimary)
                `);
            }
        }

        await transaction.commit();
        res.status(201).json({ message: 'Thêm phòng thành công!' });
    } catch (err) {
        console.error(err);
        await transaction.rollback();
        res.status(500).json({ message: 'Lỗi server khi thêm phòng' });
    }
};

const updateRoom = async (req, res) => {
    const { id } = req.params;
    const branchId = req.headers['x-branch-id'];
    const { roomNumber, roomTypeId, status, images, isDelete } = req.body;

    if (!branchId) return res.status(400).json({ message: 'Thiếu thông tin chi nhánh.' });

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();
        
        const request = new sql.Request(transaction);
        request.input('id', sql.Int, id);
        request.input('branchId', sql.Int, branchId);
        request.input('roomNumber', sql.VarChar, roomNumber);
        request.input('roomTypeId', sql.Int, roomTypeId);
        request.input('status', sql.VarChar, status);
        request.input('isDelete', sql.Bit, isDelete !== undefined ? isDelete : 0);

        await request.query(`
            UPDATE Rooms 
            SET RoomNumber = @roomNumber, 
                RoomTypeId = @roomTypeId, 
                Status = @status,
                IsDelete = @isDelete
            WHERE Id = @id AND BranchId = @branchId
        `);

        if (images !== undefined) {
            const deleteImgReq = new sql.Request(transaction);
            deleteImgReq.input("roomId", sql.Int, id);
            await deleteImgReq.query(`DELETE FROM RoomImages WHERE RoomId = @roomId`);

            if (images.length > 0) {
                for (let i = 0; i < images.length; i++) {
                    const imgReq = new sql.Request(transaction);
                    imgReq.input("roomId", sql.Int, id);
                    imgReq.input("imageUrl", sql.NVarChar, images[i]);
                    imgReq.input("isPrimary", sql.Bit, i === 0 ? 1 : 0);

                    await imgReq.query(`
                        INSERT INTO RoomImages (RoomId, ImageUrl, IsPrimary)
                        VALUES (@roomId, @imageUrl, @isPrimary)
                    `);
                }
            }
        }

        await transaction.commit();
        res.json({ message: 'Cập nhật phòng thành công!' });
    } catch (err) {
        console.error(err);
        await transaction.rollback();
        res.status(500).json({ message: 'Lỗi server khi cập nhật phòng' });
    }
};

const deleteRoom = async (req, res) => {
    const { id } = req.params;
    const branchId = req.headers['x-branch-id'];

    if (!branchId) return res.status(400).json({ message: 'Thiếu thông tin chi nhánh.' });

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('branchId', sql.Int, branchId);

        await request.query(`
            UPDATE Rooms 
            SET IsDelete = 1
            WHERE Id = @id AND BranchId = @branchId
        `);

        res.json({ message: 'Đã ngừng hoạt động phòng!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server khi xóa phòng' });
    }
};

module.exports = {
    getRooms,
    createRoom,
    updateRoom,
    deleteRoom
};