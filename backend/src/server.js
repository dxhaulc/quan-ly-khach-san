const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const roomTypeRoutes = require('./routes/roomType.routes'); 
const roomRoutes = require('./routes/room.routes'); 
const priceConfigRoutes = require('./routes/priceConfig.routes'); 
const serviceCategoryRoutes = require('./routes/service-category.routes');
const serviceRoutes = require('./routes/service.routes'); 
const receptionRoutes = require('./routes/reception.routes'); 
const bookingRoutes = require('./routes/booking.routes'); 
const customerRoutes = require('./routes/customer.routes'); 
const invoiceRoute = require('./routes/invoice.routes'); 
const userRoute = require('./routes/user.routes'); 
const roleRoute = require('./routes/role.routes'); 
const branchRoute = require('./routes/branch.routes'); 
const profileRoute = require('./routes/profile.routes'); 
const dashboardRoute = require('./routes/dashboard.routes'); 
const checkInRoutes = require('./routes/checkin.routes'); 



const app = express();

app.use(cors());
app.use(express.json());

connectDB();

app.use('/api/auth', authRoutes);
app.use('/api/room-types', roomTypeRoutes);     
app.use('/api/rooms', roomRoutes); 
app.use('/api/price-configs', priceConfigRoutes);     
app.use('/api/service-categories', serviceCategoryRoutes);
app.use('/api/services', serviceRoutes); 
app.use('/api/reception', receptionRoutes);
app.use('/api/booking', bookingRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/admin/invoices', invoiceRoute);
app.use('/api/admin/users', userRoute);
app.use('/api/admin/roles', roleRoute);
app.use('/api/admin/branches', branchRoute);
app.use('/api/profile', profileRoute);
app.use('/api/dashboard', dashboardRoute);
app.use('/api/checkins', checkInRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(` Server Backend đang chạy tại http://localhost:${PORT}`);
});