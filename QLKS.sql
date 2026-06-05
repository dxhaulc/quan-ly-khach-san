create database QLyKhachSan
use QLyKhachSan
-- 26, Bảng khách sạn
create table Tenants (
    Id uniqueidentifier primary key default newid(),
    HotelName nvarchar(100) not null,   
    SubDomain varchar(50) unique,        
    ContactPhone varchar(20),
    Status varchar(20) default 'Active',
    CreatedAt datetime default GETDATE(),
	VATTaxRate decimal(5, 2) NOT NULL DEFAULT 5,
	IsDeleted bit NOT NULL DEFAULT 0
);
select * from Tenants

-- 1, Bảng chi nhánh
create table Branches (
	Id int primary key identity(1,1),
	TenantId uniqueidentifier foreign key references Tenants(Id),
	Name nvarchar(100) not null,
	Address nvarchar(255),
	Phone varchar(20),
	IsActive bit default 1,
);

-- 2, Bảng quyền
create table UserPermissions (
	Id int primary key identity(1, 1),
	Code varchar(50) unique not null,
	Description nvarchar(255),
);

-- 3, Bảng vai trò
create table Roles (
	Id int primary key identity(1, 1),
	TenantId uniqueidentifier foreign key references Tenants(Id),
	RoleName nvarchar(50) not null,
);

-- 4, Bảng người dùng
create table Users(
	Id uniqueidentifier primary key default newid(),
	TenantId uniqueidentifier foreign key references Tenants(Id),
	Username varchar(50) not null,
	PasswordHash varchar(255) not null,
	FullName nvarchar(100),
	IsAdmin bit default 0,
	Email varchar(100),
	AvatarImageUrl nvarchar(max),
	Phone varchar(20),
	IsDelete bit default 0,

	constraint UQ_Users_Tenant_Username unique (TenantId, Username)
);

ALTER TABLE Users
ADD CONSTRAINT UQ_Users_Tenant_Phone 
UNIQUE (TenantId, Phone);


-- 5, Phân quyền chung cho các role 
create table RolePermissions(
	 RoleId int foreign key references Roles(Id),
	 PermissionId int foreign key references UserPermissions(Id)
	 primary key (RoleId, PermissionId)
);

-- 6, Phân quyền riêng cho user Users-Branches-Roles
create table UserBranchRoles (
	UserId uniqueidentifier foreign key references Users(Id),
	BranchId int foreign key references Branches(Id),
	RoleId int foreign key references Roles(Id),
	primary key (UserId, BranchId, RoleId),
);

-- 7, Hạng phòng 
create table RoomTypes (
	Id int primary key identity(1,1),
	TenantId uniqueidentifier foreign key references Tenants(Id),
	BranchId INT FOREIGN KEY REFERENCES Branches(Id),
	TypeName nvarchar(50) not null,
	LimitAdult int,
	LimitChildren int,
	ExtraPersonPrice decimal(18, 2),
	LateCheckOutFeePerHour decimal(18, 2),
	IsDelete bit default 0,
);


-- 8, Bảng quy định thời gian theo Ngày, Qua đêm, Buổi, vd Qua đêm là 22h - 12h	
create table PriceSlots(
	Id int primary key identity(1,1),
	TenantId uniqueidentifier foreign key references Tenants(Id),
	Name nvarchar(50),
	StartTime time,
	EndTime time,
	IsOvernight bit default 0,
	Description nvarchar(255), 
 );

 -- 25, Giá theo bảng quy định thời gian có/kh cuối tuần 
 CREATE TABLE RoomTypePriceConfig (
    Id INT PRIMARY KEY IDENTITY(1,1),
    RoomTypeId int foreign key references RoomTypes(Id),
    PriceSlotID int foreign key references PriceSlots(Id),
	DayType varchar(20) default 'weekday', -- 'weekend', 'holiday' 
    Price DECIMAL(18, 2),
	FirstBlockHours int null,
	ExtraHourPrice decimal(18, 2) null
);

select * from RoomTypePriceConfig

-- 9, Ảnh của loại phòng
create table RoomTypeImages (
	Id int primary key identity(1,1),
	RoomTypeId int foreign key references RoomTypes(Id),
	ImageUrl nvarchar(max) not null,
	IsPrimary bit default 0,
);

select * from RoomTypeImages

-- 10, Danh sách phòng 
create table Rooms (
	Id int primary key identity(1,1),
	BranchId int foreign key references Branches(Id),
	RoomTypeId int foreign key references RoomTypes(Id),
	RoomNumber varchar(10) not null,
	Status varchar(20) default 'Available',
	IsDelete bit default 0,
	IsDirty bit NOT NULL DEFAULT 0,
);

-- 11, Ảnh của phòng
create table RoomImages (
	Id int primary key identity(1,1),
	RoomId int foreign key references Rooms(Id),
	ImageUrl nvarchar(max) not null,
	IsPrimary bit default 0,
);


-- 12, Khách hàng
create table Customers (
	Id uniqueidentifier primary key default newid(),
	TenantId uniqueidentifier foreign key references Tenants(Id),
	FullName Nvarchar(100),
	IdCard varchar(20) ,
	Phone varchar(20),
	Email varchar(100),
	constraint UQ_Customers_Tenant_IdCard unique (TenantId, IdCard)
);

select * from Customers


-- 13, Lưu ảnh liên quan đến giấy tờ xác thực danh tình như CCCD hay hộ chiếu...
create table CustomerIdDocImages(
	Id uniqueidentifier primary key default newid(),
	CustomerId uniqueidentifier foreign key references Customers(Id),
	Name nvarchar(100),
	ImageUrl nvarchar(max),
);

select* from CustomerIdDocImages

-- 14, Đơn đặt phòng
create table Bookings(
	Id uniqueidentifier primary key default newid(),
	TenantId uniqueidentifier foreign key references Tenants(Id),
	BranchId int foreign key references Branches(Id),
	CustomerId uniqueidentifier foreign key references Customers(Id),
	Status varchar(20),
	CreateAt datetime default getdate(),
	DepositAmount decimal(18, 2) default 0,
	Note nvarchar(max)
);
select * from Bookings


-- 15, Chi tiết từng phòng trong đơn đặt
create table BookingDetails (
	Id uniqueidentifier primary key default newid(),
	BookingId uniqueidentifier foreign key references Bookings(Id),
	RoomId int foreign key references Rooms(Id) ,
	ExpectedCheckIn datetime,
	ExpectedCheckOut datetime,
	ActualCheckIn datetime,
	ActualCheckOut datetime,
	PriceType varchar(20) DEFAULT 'day',
	Note nvarchar(max),
	Status varchar(20),
	RoomPrice decimal(18,2),
	AdultCount int,
	ChildrenCount int,
	DiscountValue decimal(18,2) DEFAULT 0,
    DiscountType varchar(10) DEFAULT 'VND',
);


-- 16, Danh mục dịch vụ 
create table ServiceCategories (
	Id int primary key identity(1,1), 
	TenantId uniqueidentifier foreign key references Tenants(Id),
	Name nvarchar(100) not null,
	Description nvarchar(255),
	IsDelete bit default 0,
);

-- 17, Dịch vụ
create table HotelServices (
	Id int primary key identity(1,1),
	CategoryId int foreign key references ServiceCategories(Id),
	TenantId uniqueidentifier foreign key references Tenants(Id),
	ServiceName nvarchar(100),
	Unit nvarchar(50),
	IsInventoryItem bit default 0,
	Price decimal(18, 2),
	IsDelete bit default 0,
	ImageUrl nvarchar(max),
);

select * from HotelServices

-- 18, Tồn kho ở các chi nhánh
create table BranchInventory (
	BranchId int foreign key references Branches(Id),
	ServiceID int foreign key references HotelServices(Id),
	primary key (BranchID, ServiceID),
	Stock int default 0,
	MinStock int,
);

-- 19, Dịch vụ sử dụng
create table ServiceOrders (
	Id uniqueidentifier primary key default newid(),
	BookingDetailId uniqueidentifier foreign key references BookingDetails(Id),
	ServiceId int foreign key references HotelServices(Id),
	Quantity int default 1,
	PriceAtTime decimal(18, 2) 
)

-- 20, Nhà cung cấp
create table Suppliers (
	Id int primary key identity(1,1),
	TenantId uniqueidentifier foreign key references Tenants(Id),
	Name nvarchar(100),
	Phone varchar(20),
	Address nvarchar(max),
	Email varchar(100),
	IsDelete bit default 0,
);

-- 21, Phiếu nhập kho
create table InventoryReceipts (
	Id int primary key identity(1,1),
	TenantId uniqueidentifier foreign key references Tenants(Id),
	BranchId int foreign key references Branches(Id),
	SupplierId int foreign key references Suppliers(Id),
	UserId uniqueidentifier foreign key references Users(Id),
	TotalAmount decimal(18, 2),
	Status varchar(20),
	Note nvarchar(max)
);

-- 22, Chi tiết nhập hàng	
create table InventoryReceiptDetails (
	Id int primary key identity(1,1),
	InventoryReceiptId int foreign key references InventoryReceipts(Id),
	HotelServiceID int foreign key references HotelServices(Id),
	Quantity int,
	UnitPrice decimal(18,2),
);

-- 23, Hóa đơn 
create table Invoices (
	Id uniqueidentifier primary key default newid(),
	TenantId uniqueidentifier foreign key references Tenants(Id),
	BookingId uniqueidentifier foreign key references Bookings(Id),
	UserId uniqueidentifier foreign key references Users(Id),
	RoomAmount decimal(18,2),
	ServiceAmount decimal(18,2),
	VATTaxRate decimal(5, 2),
	VATTaxAmount decimal(18, 2) NOT NULL DEFAULT 0,
	TotalDiscount decimal(18,2) DEFAULT 0,
	TotalAmount decimal(18,2),
	PaymentMethod nvarchar(50),
	PaymentDate datetime default getdate(),
	Note nvarchar(max), 
);

select * from Invoices




-- 24, Bảng ghi log khi nhân viên hay quản lý thay đổi các thông tin như giá, phòng ,...
create table ActivityLogs(
	Id int primary key identity(1,1),
	TenantId uniqueidentifier foreign key references Tenants(Id),
	UserID uniqueidentifier foreign key references Users(Id),
	BranchID int foreign key references Branches(Id),
	Action nvarchar(100),
	Description nvarchar(max),
	CreateAt datetime default getdate(),
);

-- 27, Bảng Check-in xem khách nào ở chi tiết phòng nào ?
CREATE TABLE CheckIns (
    BookingDetailId uniqueidentifier NOT NULL FOREIGN KEY REFERENCES BookingDetails(Id),
    CustomerId uniqueidentifier NOT NULL FOREIGN KEY REFERENCES Customers(Id),

    PRIMARY KEY (BookingDetailId, CustomerId)
);


INSERT INTO CheckIns (BookingDetailId, CustomerId)
SELECT bd.Id, b.CustomerId
FROM Bookings b
INNER JOIN BookingDetails bd ON bd.BookingId = b.Id
WHERE b.CustomerId IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM CheckIns ci
    WHERE ci.BookingDetailId = bd.Id AND ci.CustomerId = b.CustomerId
  );

select * from CheckIns

USE QLyKhachSan;
GO

DECLARE @TenantId UNIQUEIDENTIFIER = 'A0000000-0000-0000-0000-000000000001';


-- 26. Bảng khách sạn
INSERT INTO Tenants (Id, HotelName, SubDomain, ContactPhone, Status) VALUES
(@TenantId, N'Thanh Bình', 'thanh-binh', '0901232456', 'Active')

-- 1. Bảng chi nhánh 
INSERT INTO Branches (TenantId, Name, Address, Phone, IsActive) VALUES 
(@TenantId, N'Chi nhánh trung tâm', N'123 Lê Thanh Nghị, Hà Nội', '0901234567', 1),
(@TenantId, N'Chi nhánh B', N'123 Trần Đại Nghĩa, Hà Nội', '0987654321', 1);

-- 2. Bảng quyền
INSERT INTO UserPermissions (Code, Description) VALUES 
('MANAGE_ROOMS', N'Quản lý phòng và hạng phòng'),
('CREATE_BOOKING', N'Tạo đơn đặt phòng'),
('MANAGE_INVENTORY', N'Quản lý kho và dịch vụ'),
('VIEW_REPORTS', N'Xem báo cáo doanh thu');

-- 3. Bảng vai trò 
INSERT INTO Roles (TenantId, RoleName) VALUES 
(@TenantId, N'Quản trị viên (Admin)'),
(@TenantId, N'Quản lý chi nhánh (Manager)'),
(@TenantId, N'Lễ tân (Receptionist)');

-- 4. Bảng người dùng 
DECLARE @AdminId UNIQUEIDENTIFIER = 'A0000000-0000-0000-0000-000000000001';
DECLARE @ManagerId UNIQUEIDENTIFIER = 'A0000000-0000-0000-0000-000000000002';
DECLARE @ReceptionistId UNIQUEIDENTIFIER = 'A0000000-0000-0000-0000-000000000003';

INSERT INTO Users (Id, TenantId, Username, PasswordHash, FullName, IsAdmin, Email, AvatarImageUrl, Phone ,IsDelete) VALUES 
(@AdminId, @TenantId, 'admin', '$2b$10$OG4XG5b8u3fyguGuh0oRdeiRmcERAVoDVUqcFnPZwJ1wdQE3UqX02', N'Nguyễn Văn A', 1, 'admin@hotel.com', NULL, '' ,0),
(@ManagerId, @TenantId, 'manager1', '$2b$10$OG4XG5b8u3fyguGuh0oRdeiRmcERAVoDVUqcFnPZwJ1wdQE3UqX02', N'Lê văn B', 0, 'manager@hotel.com', NULL, '' ,0),
(@ReceptionistId, @TenantId, 'letan1', '$2b$10$OG4XG5b8u3fyguGuh0oRdeiRmcERAVoDVUqcFnPZwJ1wdQE3UqX02', N'Trần Thị C', 0, 'letan1@hotel.com', NULL, '' ,0);

UPDATE Users 
SET PasswordHash = '$2b$10$OG4XG5b8u3fyguGuh0oRdeiRmcERAVoDVUqcFnPZwJ1wdQE3UqX02';

-- 5. Phân quyền riêng cho các role
INSERT INTO RolePermissions (RoleId, PermissionId) VALUES 
(1, 1), (1, 2), (1, 3), (1, 4),
(2, 1), (2, 2), (2, 3), (2, 4),
(3, 2); 

-- 6. Phân quyền chung theo role
INSERT INTO UserBranchRoles (UserId, BranchId, RoleId) VALUES 
(@ReceptionistId, 1, 3),
(@ManagerId, 1, 2),
(@ManagerId, 2, 2);


-- 7. Hạng phòng 
INSERT INTO RoomTypes (TenantId, BranchId, TypeName, LimitAdult, LimitChildren, ExtraPersonPrice, LateCheckOutFeePerHour, IsDelete) VALUES 
(@TenantId, 1, N'Standard', 2, 1, 20000, 40000, 0),
(@TenantId, 1, N'Deluxe', 2, 1, 25000, 45000, 0),
(@TenantId, 1, N'Superior', 2, 1, 30000, 50000, 0),
(@TenantId, 1, N'VIP', 2, 2, 40000, 60000, 0);

-- 8. Bảng quy định thời gian 
INSERT INTO PriceSlots (TenantId, Name, StartTime, EndTime, IsOvernight, Description) VALUES 
(@TenantId, N'Giờ', null, null, 0, N'Tính tiền theo giờ'),
(@TenantId, N'Cả ngày', '14:00', '12:00', 1, N'Check-in 2h chiều, Check-out 12h trưa hôm sau'),
(@TenantId, N'Qua đêm', '22:00', '12:00', 1, N'Check-in 22h tối, Check-out 12h trưa hôm sau'),
(@TenantId, N'Buổi', '12:00', '21:00', 0, N'Check-in 12h chiều, Check-out 21h tối');

select * from PriceSlots

-- 25. Giá cấu hình theo quy định thời gian
INSERT INTO RoomTypePriceConfig (RoomTypeId, PriceSlotID, DayType, Price, FirstBlockHours, ExtraHourPrice) VALUES 
(1, 1, 'weekday', 80000, 2, 40000),
(1, 2, 'weekday', 400000, null, null), 
(1, 3, 'weekday', 200000, null, null),
(1, 4, 'weekday', 300000, null, null), 
(1, 1, 'weekend', 95000, 2, 50000),
(1, 2, 'weekend', 480000, null, null), 
(1, 3, 'weekend', 240000, null, null), 
(1, 4, 'weekend', 360000, null, null),

(2, 1, 'weekday', 90000, 2, 45000),
(2, 2, 'weekday', 600000, null, null), 
(2, 3, 'weekday', 300000, null, null),
(2, 4, 'weekday', 450000, null, null), 
(2, 1, 'weekend', 105000, 2, 60000),
(2, 2, 'weekend', 720000, null, null),
(2, 3, 'weekend', 360000, null, null), 
(2, 4, 'weekend', 540000, null, null), 

(3, 1, 'weekday', 100000, 2, 50000),
(3, 2, 'weekday', 800000, null, null),
(3, 3, 'weekday', 400000, null, null),
(3, 4, 'weekday', 600000, null, null),
(3, 1, 'weekend', 115000, 2, 70000),
(3, 2, 'weekend', 960000, null, null), 
(3, 3, 'weekend', 480000, null, null), 
(3, 4, 'weekend', 720000, null, null), 

(4, 1, 'weekday', 120000, 2, 60000),
(4, 2, 'weekday', 1000000, null, null), 
(4, 3, 'weekday', 500000, null, null),
(4, 4, 'weekday', 750000, null, null), 
(4, 1, 'weekend', 140000, 2, 70000),
(4, 2, 'weekend', 1200000, null, null), 
(4, 3, 'weekend', 600000, null, null), 
(4, 4, 'weekend', 800000, null, null); 

select * from RoomTypePriceConfig

-- 9. Ảnh loại phòng 
INSERT INTO RoomTypeImages (RoomTypeId, ImageUrl, IsPrimary) VALUES 
(1, 'https://d30s6klq0kc2zb.cloudfront.net/sample_data_20230310/room-class/room_1-1.png', 1),
(2, 'https://d30s6klq0kc2zb.cloudfront.net/sample_data_20230310/room-class/room_2-1.png', 1),
(3, 'https://d30s6klq0kc2zb.cloudfront.net/sample_data_20230310/room-class/room_3-1.png', 1),
(4, 'https://d30s6klq0kc2zb.cloudfront.net/sample_data_20230310/room-class/room_4-1.png', 1);

-- 10. Danh sách phòng 
INSERT INTO Rooms (BranchId, RoomTypeId, RoomNumber, Status, IsDelete) VALUES 
(1, 1, '101', 'Available', 0),
(1, 1, '102', 'Occupied', 0),
(1, 2, '201', 'Maintenance', 0),
(1, 2, '202', 'Available', 0),
(1, 3, '301', 'Available', 0),
(1, 3, '302', 'Dirty', 0),
(1, 4, '401', 'Occupied', 0),
(1, 4, '402', 'Occupied', 0);

select * from Rooms


-- 11. Ảnh của phòng 
INSERT INTO RoomImages (RoomId, ImageUrl, IsPrimary) VALUES 
(1, 'https://d30s6klq0kc2zb.cloudfront.net/sample_data_20230310/room-class/room_1-1.png', 1);

-- 12. Khách hàng 
DECLARE @CustomerId UNIQUEIDENTIFIER = 'C0000000-0000-0000-0000-000000000001';
INSERT INTO Customers (Id, TenantId, FullName, IdCard, Phone, Email) VALUES 
(@CustomerId, @TenantId, N'Lê Khách Hàng', '001099123456', '0911222333', 'khachhang@gmail.com');

-- 13. Ảnh giấy tờ 
INSERT INTO CustomerIdDocImages (CustomerId, Name, ImageUrl) VALUES 
(@CustomerId, N'CCCD Mặt Trước', 'https://example.com/cccd-front.jpg');

-- 14. Đơn đặt phòng 
DECLARE @BookingId UNIQUEIDENTIFIER = 'B0000000-0000-0000-0000-000000000001';
INSERT INTO Bookings (Id, TenantId, BranchId, CustomerId, Status, CreateAt, DepositAmount) VALUES 
(@BookingId, @TenantId, 1, @CustomerId, 'CheckedIn', GETDATE(), 200000);

select * from BookingDetails


-- 15. Chi tiết đặt phòng 
DECLARE @BookingDetailId UNIQUEIDENTIFIER = 'D0000000-0000-0000-0000-000000000001';
INSERT INTO BookingDetails (Id, BookingId, RoomId, ExpectedCheckIn, ExpectedCheckOut, ActualCheckIn, ActualCheckOut, Note, Status, RoomPrice, AdultCount, ChildrenCount) VALUES 
(@BookingDetailId, @BookingId, 2, '2026-04-12 14:00:00', '2026-04-14 12:00:00', '2026-04-12 14:30:00', NULL, N'Khách yêu cầu phòng yên tĩnh', 'InUse', 500000, 2, 0);

-- 16. Danh mục dịch vụ 
INSERT INTO ServiceCategories (TenantId, Name, Description, IsDelete) VALUES 
(@TenantId, N'Đồ Uống', N'Nước suối, nước ngọt, bia...', 0),
(@TenantId, N'Giặt Là', N'Dịch vụ giặt sấy ủi', 0);

-- 17. Dịch vụ 
INSERT INTO HotelServices (CategoryId, TenantId, ServiceName, Unit, IsInventoryItem, Price, IsDelete) VALUES 
(1, @TenantId, N'Nước Suối Lavie', N'Chai', 1, 15000, 0),
(1, @TenantId, N'Bia Heineken', N'Lon', 1, 30000, 0),
(2, @TenantId, N'Giặt sấy quần áo', N'Kg', 0, 50000, 0);

select * from HotelServices

-- 18. Tồn kho 
INSERT INTO BranchInventory (BranchId, ServiceID, Stock, MinStock) VALUES 
(1, 1, 100, 20),
(1, 2, 50, 10);

-- 19. Dịch vụ sử dụng 
INSERT INTO ServiceOrders (BookingDetailId, ServiceId, Quantity, PriceAtTime) VALUES 
(@BookingDetailId, 1, 2, 15000); -- Khách uống 2 chai nước

-- 20. Nhà cung cấp 
INSERT INTO Suppliers (TenantId, Name, Phone, Address, Email, IsDelete) VALUES 
(@TenantId, 'Đại lý nước giải khát Hùng Vương', '0283123456', N'Khu công nghiệp A', 'hungvuong@supply.com', 0);

-- 21. Phiếu nhập kho 
INSERT INTO InventoryReceipts (TenantId, BranchId, SupplierId, UserId, TotalAmount, Status, Note) VALUES 
(@TenantId, 1, 1, @AdminId, 1500000, 'Completed', N'Nhập nước suối đầu tháng');

-- 22. Chi tiết nhập hàng 
INSERT INTO InventoryReceiptDetails (InventoryReceiptId, HotelServiceID, Quantity, UnitPrice) VALUES 
(1, 1, 100, 10000), -- Nhập 100 chai giá 10k, bán 15k
(1, 2, 20, 25000);  -- Nhập 20 lon bia giá 25k, bán 30k

-- 23. Hóa đơn 
-- Lưu ý: Đơn này chưa thanh toán xong (khách chưa out), nhưng mock sẵn 1 đơn cũ để test
DECLARE @OldBookingId UNIQUEIDENTIFIER = 'B0000000-0000-0000-0000-000000000002';
INSERT INTO Bookings (Id, TenantId, BranchId, CustomerId, Status, CreateAt, DepositAmount) VALUES 
(@OldBookingId, @TenantId, 1, @CustomerId, 'Completed', '2026-03-01 10:00:00', 0);

INSERT INTO Invoices (BookingId, TenantId, UserId, RoomAmount, ServiceAmount, VATTaxRate, TotalDiscount, TotalAmount, PaymentMethod, PaymentDate, Note) VALUES 
(@OldBookingId, @TenantId, @ReceptionistId, 500000, 50000, 8.00, 0, 594000, N'Chuyển Khoản', '2026-03-02 12:00:00', N'Khách đã thanh toán đủ');

-- 24. Bảng ghi log 
INSERT INTO ActivityLogs (TenantId, UserID, BranchID, Action, Description, CreateAt) VALUES 
(@TenantId, @AdminId, 1, 'UPDATE_PRICE', N'Cập nhật giá phòng Standard cuối tuần lên 400k', GETDATE()),
(@TenantId, @ReceptionistId, 1, 'CHECK_IN', N'Check-in phòng 102 cho khách Lê Khách Hàng', GETDATE());

GO


-- Tạo Index tối ưu hóa truy vấn cho mô hình Multi-tenant
CREATE INDEX IX_Users_TenantId ON Users(TenantId);
CREATE INDEX IX_Customers_TenantId ON Customers(TenantId);
CREATE INDEX IX_Bookings_TenantId ON Bookings(TenantId);
CREATE INDEX IX_Invoices_TenantId ON Invoices(TenantId);


DECLARE @TenantId UNIQUEIDENTIFIER = 'A0000000-0000-0000-0000-000000000001';
SELECT 
    rt.Id,
    rt.TypeName,
    rt.LimitAdult,
    rt.LimitChildren,
    rt.ExtraPersonPrice,
    -- Lấy ảnh chính (Primary Image)
    (SELECT TOP 1 ImageUrl FROM RoomTypeImages WHERE RoomTypeId = rt.Id ORDER BY IsPrimary DESC) AS Thumbnail,
    -- Lấy giá đại diện thấp nhất cho từng loại hình để hiển thị "Giá chỉ từ..."
    MIN(CASE WHEN ps.Name = N'Giờ' THEN config.Price END) AS PricePerHour,
    MIN(CASE WHEN ps.Name = N'Qua đêm' THEN config.Price END) AS PriceOvernight,
    MIN(CASE WHEN ps.Name = N'Cả ngày' THEN config.Price END) AS PriceAllDay,
    MIN(CASE WHEN ps.Name = N'Buổi' THEN config.Price END) AS PriceBySession
FROM RoomTypes rt
LEFT JOIN RoomTypePriceConfig config ON rt.Id = config.RoomTypeId
LEFT JOIN PriceSlots ps ON config.PriceSlotID = ps.Id
WHERE rt.TenantId = @TenantId AND rt.IsDelete = 0
GROUP BY rt.Id, rt.TypeName, rt.LimitAdult, rt.LimitChildren, rt.ExtraPersonPrice;


SELECT * FROM Branches

SELECT 
    b.Id AS BookingId,
    bd.Id AS BookingDetailId,
    r.Id AS RoomId,
    r.RoomNumber,
    rt.TypeName AS RoomType,
    bd.ExpectedCheckIn,
    bd.ExpectedCheckOut,
    bd.ActualCheckIn,
    bd.ActualCheckOut,
    bd.Status,
    bd.RoomPrice,
    bd.AdultCount,
    bd.ChildrenCount
FROM Bookings b
INNER JOIN BookingDetails bd 
    ON b.Id = bd.BookingId
INNER JOIN Rooms r 
    ON bd.RoomId = r.Id
INNER JOIN RoomTypes rt 
    ON r.RoomTypeId = rt.Id
WHERE b.Id = '295A095E-A0F4-4C94-85BE-84BB6256722E';

DECLARE @TenantId UNIQUEIDENTIFIER = 'A0000000-0000-0000-0000-000000000001';
SELECT 
	hs.Id, hs.ServiceName, hs.Unit, hs.IsInventoryItem, hs.Price, hs.ImageUrl, hs.IsDelete,
	hs.CategoryId, sc.Name AS CategoryName,
	ISNULL(bi.Stock, 0) AS Stock, 
	ISNULL(bi.MinStock, 0) AS MinStock
	FROM HotelServices hs
	LEFT JOIN ServiceCategories sc ON hs.CategoryId = sc.Id
	LEFT JOIN BranchInventory bi ON hs.Id = bi.ServiceID AND bi.BranchId = 1
	WHERE hs.TenantId = @TenantId 

DECLARE @TenantId UNIQUEIDENTIFIER = 'A0000000-0000-0000-0000-000000000001';
SELECT 
        r.Id AS RoomTypeId, r.TypeName,
        p.PriceSlotID, ps.Name, p.DayType, p.Price, p.ExtraHourPrice, p.FirstBlockHours
      FROM RoomTypes r
      LEFT JOIN RoomTypePriceConfig p ON r.Id = p.RoomTypeId
	  LEFT JOIN PriceSlots ps on p.PriceSlotID = ps.Id
      WHERE r.TenantId = @tenantId AND r.BranchId = 1 AND r.IsDelete = 0

select * from RoomTypePriceConfig

DECLARE @TenantId UNIQUEIDENTIFIER = 'A0000000-0000-0000-0000-000000000001';
            WITH UserRoles AS (
                SELECT 
                    u.Id, u.Username, u.FullName, u.Email, u.Phone, u.IsAdmin, u.IsDelete,
                    STUFF((SELECT ',' + CAST(BranchId AS VARCHAR) + '-' + CAST(RoleId AS VARCHAR) 
                           FROM UserBranchRoles WHERE UserId = u.Id FOR XML PATH('')), 1, 1, '') AS AssignmentData,
                    STUFF((SELECT ', ' + r.RoleName FROM UserBranchRoles ubr INNER JOIN Roles r ON ubr.RoleId = r.Id WHERE ubr.UserId = u.Id FOR XML PATH('')), 1, 2, '') AS Roles,
                    STUFF((SELECT ', ' + b.Name FROM UserBranchRoles ubr INNER JOIN Branches b ON ubr.BranchId = b.Id WHERE ubr.UserId = u.Id FOR XML PATH('')), 1, 2, '') AS Branches
                FROM Users u
                WHERE u.TenantId = @tenantId
            )
            SELECT *, COUNT(*) OVER() AS TotalRows FROM UserRoles WHERE 1=1



DECLARE @TenantId UNIQUEIDENTIFIER = 'A0000000-0000-0000-0000-000000000001';
SELECT 
    r.Id AS RoomId, 
    r.RoomNumber, 
    r.Status AS OccupancyStatus, 
    r.IsDirty,
    rt.TypeName,
            
    COALESCE(bd.Id, UpcomingBooking.UpcomingBookingDetailId) AS BookingDetailId,
    COALESCE(bd.BookingId, UpcomingBooking.UpcomingBookingId) AS BookingId,
    COALESCE(c.FullName, UpcomingBooking.UpcomingGuestName) AS GuestName,

    COALESCE(bd.PriceType, UpcomingBooking.PriceType) AS PriceType,
    COALESCE(bd.DiscountValue, UpcomingBooking.DiscountValue) AS DiscountValue,
    COALESCE(bd.DiscountType, UpcomingBooking.DiscountType) AS DiscountType,
            
	bd.ActualCheckIn,
    --bd.ExpectedCheckIn AS CurrentCheckIn, 
    bd.ExpectedCheckOut,
            
    UpcomingBooking.UpcomingBookingDetailId,
    UpcomingBooking.ExpectedCheckIn AS UpcomingCheckIn,
    UpcomingBooking.UpcomingCheckOut,   
    UpcomingBooking.UpcomingGuestName,
    UpcomingBooking.UpcomingBookingId,

    PriceHour.Price AS PriceHour,
    PriceDay.Price AS PriceDay,
    PriceNight.Price AS PriceNight,
    PriceHourWE.Price AS PriceHourWeekend,
    PriceDayWE.Price AS PriceDayWeekend,
    PriceNightWE.Price AS PriceNightWeekend

FROM Rooms r
INNER JOIN RoomTypes rt ON r.RoomTypeId = rt.Id
        
LEFT JOIN BookingDetails bd ON r.Id = bd.RoomId AND bd.Status = 'InUse'
LEFT JOIN Bookings b ON bd.BookingId = b.Id
LEFT JOIN Customers c ON b.CustomerId = c.Id
        
OUTER APPLY (
    SELECT TOP 1 
        bd_up.Id AS UpcomingBookingDetailId, 
        bd_up.ExpectedCheckIn, 
        bd_up.ExpectedCheckOut AS UpcomingCheckOut, 
        c_up.FullName AS UpcomingGuestName, 
        b_up.Id AS UpcomingBookingId,
        bd_up.PriceType,
        bd_up.DiscountValue,
        bd_up.DiscountType
    FROM BookingDetails bd_up
    INNER JOIN Bookings b_up ON bd_up.BookingId = b_up.Id
    LEFT JOIN Customers c_up ON b_up.CustomerId = c_up.Id
    WHERE bd_up.RoomId = r.Id AND bd_up.Status = 'Reserved' 
            
    ORDER BY bd_up.ExpectedCheckIn ASC
) AS UpcomingBooking
        
OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 1 AND DayType = 'weekday') AS PriceHour
OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 2 AND DayType = 'weekday') AS PriceDay
OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 3 AND DayType = 'weekday') AS PriceNight
        
OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 1 AND DayType = 'weekend') AS PriceHourWE
OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 2 AND DayType = 'weekend') AS PriceDayWE
OUTER APPLY (SELECT TOP 1 Price FROM RoomTypePriceConfig WHERE RoomTypeId = rt.Id AND PriceSlotID = 3 AND DayType = 'weekend') AS PriceNightWE
        
WHERE r.BranchId = 1 
    AND r.BranchId IN (SELECT Id FROM Branches WHERE TenantId = @tenantId)
    AND r.IsDelete = 0 AND rt.IsDelete = 0
ORDER BY r.RoomNumber ASC


select * from Invoices i
left join Bookings b on b.Id = i.BookingId
where b.Status != 'Completed'

select * from Bookings bd
where bd.Status != 'Completed'

select * from Bookings
where ID = '8E8C2D8D-627E-448C-A8F4-7DD92B1940FC'

UPDATE Bookings 
            SET Status = 'Cancelled'
            WHERE Id = '8E8C2D8D-627E-448C-A8F4-7DD92B1940FC'

select * from BookingDetails
where BookingId = '8E8C2D8D-627E-448C-A8F4-7DD92B1940FC'

DELETE from BookingDetails where BookingId = '8E8C2D8D-627E-448C-A8F4-7DD92B1940FC'

UPDATE BookingDetails
            SET Status = 'InUse'
            WHERE BookingId = '8E8C2D8D-627E-448C-A8F4-7DD92B1940FC'

select * from Bookings
where BranchId is null

select * 
from Rooms r
left join BookingDetails bd on bd.RoomId = r.Id
left join Bookings b on b.Id = bd.BookingId
where r.Id = 1 and bd.Status != 'Completed'

select * from BookingDetails
where Status != 'Completed'

select i.BookingId, b.Note, i.Note from Bookings b
left join Invoices i on i.BookingId = b.Id
order by i.PaymentDate desc

select * from Invoices

UPDATE i
SET i.VATTaxRate = t.VATTaxRate
FROM Invoices i
INNER JOIN Bookings b ON i.BookingId = b.Id
INNER JOIN Tenants t ON b.TenantId = t.Id;

UPDATE i
SET i.VATTaxAmount = (i.RoomAmount + i.ServiceAmount) * i.VATTaxRate / 100
FROM Invoices i;


select * from Invoices i where i.VATTaxRate = 0
select * from Invoices i where i.VATTaxAmount = 0
