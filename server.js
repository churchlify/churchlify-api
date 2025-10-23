const express = require('express');
const http = require('http');
const { startWorker } = require('./media-client'); // full worker
const { Server } = require('socket.io');
const {logAuditTrails} = require('./middlewares/audits');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const multer = require('multer');
const authRoutes = require('./routes/auth');
const assignmentRoutes = require('./routes/assignment');
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
const donationRoutes = require('./routes/donations');
const paymentRoutes = require('./routes/payment');
const settingsRoutes = require('./routes/settings');
const chatRoutes = require('./routes/chat'); // Import chat routes
const timezoneRoutes = require('./routes/timezone');
const webhookRoutes = require('./routes/webhook');
const uploadRoutes = require('./routes/upload');
const eventWorker = require('./common/event.worker');
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const cors = require('cors');
const { resetIndexesForAllModels, seedTimezones, skipJsonForUploads } = require('./common/shared');
const swaggerUi = require('swagger-ui-express');
const swaggerFile = require('./swagger/swagger.json');
const { churchResolver } = require('./middlewares/churchResolver');
const { authenticateFirebaseToken } = require('./middlewares/auth');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));
app.use(cors());
app.use(skipJsonForUploads); 
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(logAuditTrails);
app.use('/webhook', webhookRoutes);

// server.js

// Routes that DO NOT require a church
app.use('/timezone', timezoneRoutes);
app.use('/church', churchRoutes);
app.use('/audit', auditRoutes);
app.use('/upload', uploadRoutes);
app.use('/uploads', express.static('/files_upload/'));
app.get('/health', (req, res) => {
    res.send('Welcome to the Church Management System API');
});
app.use(authenticateFirebaseToken);
app.use('/user', userRoutes);
app.use(churchResolver);
app.use('/auth', authRoutes);
app.use('/assignment', assignmentRoutes);
app.use('/event', eventRoutes);
app.use('/kid', kidRoutes);
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
app.use('/chat', chatRoutes);
app.use('/donations', donationRoutes);
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                type: 'upload_file_too_large', 
                message: `File is too large. Max size is ${req.app.get('multerLimit') || '500KB'}.` 
            });
        }
        // Handle other Multer errors (e.g., LIMIT_FIELD_COUNT)
        return res.status(400).json({ message: err.message });
    }
    // Handle other non-Multer errors
    next(err);
});

const PORT = process.env.PORT || 5500;

mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log('Connected to MongoDB');
    await seedTimezones();
    await resetIndexesForAllModels();
    (async () => {
  try {
     await startWorker(io);
    server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
    eventWorker.start();
  } catch (err) {
    console.error('❌ Failed to start server or Mediasoup worker:', err);
    process.exit(1);
  }
})();
}).catch(err => {
    console.error(err);
});

