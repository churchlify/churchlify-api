const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const {logAuditTrails} = require('./middlewares/audits');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const churchRoutes = require('./routes/church');
const eventRoutes = require('./routes/events');
const kidRoutes = require('./routes/kid');
const auditRoutes = require('./routes/audit');
const checkinRoutes = require('./routes/checkin');
const ministryRoutes = require('./routes/ministry');
const fellowshipRoutes = require('./routes/fellowship');
const prayerRoutes = require('./routes/prayer');
const devotionRoutes = require('./routes/devotion');
const testimonyRoutes = require('./routes/testimony');
const subscriptionRoutes = require('./routes/subscription');
const moduleRoutes = require('./routes/module');
const paymentRoutes = require('./routes/payment');
const settingsRoutes = require('./routes/settings');
const eventWorker = require('./common/event.worker');
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const cors = require('cors');
const { resetIndexesForAllModels } = require('./common/shared');
const swaggerUi = require('swagger-ui-express');
const swaggerFile = require('./swagger/swagger.json');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));
app.use(cors());
app.use(express.json());
app.use(logAuditTrails);

const PORT = process.env.PORT || 5500;

mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log('Connected to MongoDB');
    await resetIndexesForAllModels();
    // Emit updates to connected clients
    io.on('connection', (socket) => {
        console.log('A client connected:', socket.id);
    
        // Example: Emit real-time update
        setInterval(() => {
        socket.emit('dataUpdated', { message: 'This is a real-time update', timestamp: new Date() });
        }, 5000); // Emit every 5 seconds
    
        socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        });
    });
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
    eventWorker.start();
}).catch(err => {
    console.error(err);
});
// server.js
app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/church', churchRoutes);
app.use('/event', eventRoutes);
app.use('/kid', kidRoutes);
app.use('/audit', auditRoutes);
app.use('/checkin', checkinRoutes);
app.use('/ministry', ministryRoutes);
app.use('/fellowship', fellowshipRoutes);
app.use('/prayer', prayerRoutes);
app.use('/devotion', devotionRoutes);
app.use('/testimony', testimonyRoutes);
app.use('/subscription', subscriptionRoutes);
app.use('/module', moduleRoutes);
app.use('/payment', paymentRoutes); 
app.use('/settings', settingsRoutes);

app.get('/', (req, res) => {
    res.send('Welcome to the Church Management System API');
});

