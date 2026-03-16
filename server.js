const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
const morgan = require('morgan');
const logger = require('./logger/logger');

// Config + DB + Socket
const { connectDB } = require('./config/db');
const { setupSocket } = require('./config/socket');
const { PORT, MONGO_URI } = require('./config/env');

// Middlewares
const { logAuditTrails } = require('./middlewares/audits');
const { authenticateFirebaseToken } = require('./middlewares/auth');
const { churchResolver, cacheMiddleware } = require('./middlewares/churchResolver');
const { skipJsonForUploads } = require('./middlewares/skipJsonForUploads');
const { errorHandler } = require('./middlewares/errorHandler');

// Routes
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
const chatRoutes = require('./routes/chat');
const venueRoutes = require('./routes/venues');
const timezoneRoutes = require('./routes/timezone');
const webhookRoutes = require('./routes/webhook');
const uploadRoutes = require('./routes/upload');
const notificationsRoutes = require('./routes/notifications');
const livestreamRoutes = require('./routes/livestream');
const verificationRoutes = require('./routes/verification');
const scheduleRoutes = require('./routes/schedule');
const allowedHeaders = [
  'Authorization',
  'Content-Type',
  'Accept',
  'Origin',
  'User-Agent',
  'Referer',
  'Accept-Encoding',
  'Accept-Language',
  'Cache-Control',
  'Pragma',
  'X-Requested-With',
  'X-CSRF-Token',
  'X-XSRF-TOKEN',
  'X-Auth-Token',
  'X-Api-Key',
  'X-Access-Token',
  'X-Refresh-Token',
  'X-Custom-Header',
  'X-Client-Version',
  'X-App-Version',
  'X-Device-Id',
  'X-Session-Id',
  'X-Trace-Id',
  'X-Request-Id',
  'Content-Length',
  'Content-Encoding',
  'Content-Language',
  'Content-Location',
  'Content-Disposition',
  'Content-MD5',
  'Content-Range',
  'If-Modified-Since',
  'If-None-Match',
  'Range',
  'X-Debug',
  'X-Forwarded-For',
  'X-Forwarded-Host',
  'X-Forwarded-Proto',
  'X-Real-IP',
  'x-church',
  'x-user',
  'x-Restricted',
  'x-client-web',
];


// Swagger
const swaggerFile = require('./swagger/swagger.json');

const app = express();

//app.use(cors());
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim());

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {return callback(null, true); }

    const normalized = origin.toLowerCase().replace(/\/$/, '');

    if (allowedOrigins.includes(normalized)) {
      return callback(null, true);
    }
    console.log('Allowed Origins:', allowedOrigins);
    console.log('❌ Blocked and Arrested by CORS:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
  allowedHeaders
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));


// Swagger + CORS
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));
// JSON handling
app.use(skipJsonForUploads);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    if (req.originalUrl && req.originalUrl.startsWith('/webhook/')) {
      req.rawBody = Buffer.from(buf);
    }
  }
}));
// Send simplified access logs to Winston
app.use(
  morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  })
);


// Static uploads
app.use('/uploads', express.static(path.join(__dirname, 'files_upload')));

// Audit logging
app.use(logAuditTrails);

// Public routes
app.use('/webhook', webhookRoutes);
app.use('/timezone', timezoneRoutes);
app.use('/church', churchRoutes);
app.use('/audit', auditRoutes);
app.use('/upload', uploadRoutes);

// Health check
app.get('/health', (_, res) =>
  res.send('✅ Church Management System API is running')
);

// Authentication
app.use('/auth', authRoutes); // public first
app.use(authenticateFirebaseToken);

// Church-based routes
app.use(cacheMiddleware);      // gives req.cache for tenant helpers
app.use(churchResolver);
app.use('/venues', venueRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/verify', verificationRoutes);
app.use('/user', userRoutes);
app.use('/assignment', assignmentRoutes);
app.use('/schedule', scheduleRoutes);
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
app.use('/livestream', livestreamRoutes);

// Error handling
app.use((req, res, next) => {
    const error = new Error(`Not Found: ${req.originalUrl}`);
    error.status = 404;
    next(error); 
});
app.use(errorHandler);

// --- STARTUP ---
(async () => {
  await connectDB(MONGO_URI);

  // Wait for Redis to be ready before starting server
  const redis = require('./common/redis.connection');
  
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  
  let redisReady = false;
  let attempts = 0;
  const maxAttempts = 30;

  while (!redisReady && attempts < maxAttempts) {
    try {
      await redis.ping();
      redisReady = true;
      console.log('✅ Redis: Readiness check passed');
    } catch (err) {
      attempts++;
      console.log(`⏳ Redis: Waiting for readiness... attempt ${attempts}/${maxAttempts}`);
      await sleep(1000);
    }
  }

  if (!redisReady) {
    console.error('❌ Redis: Failed readiness check after 30 attempts');
    process.exit(1);
  }

  const { server } = await setupSocket(app);

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });

  // Graceful shutdown
  const mongooseConnection = require('mongoose').connection;
  
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    
    try {
      await mongooseConnection.close();
      console.log('✅ MongoDB connection closed');
    } catch (err) {
      console.error('❌ Error closing MongoDB:', err.message);
    }
    
    try {
      await redis.quit();
      console.log('✅ Redis connection closed');
    } catch (err) {
      console.error('❌ Error closing Redis:', err.message);
    }
    
    server.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
  });
  
  // Also handle SIGTERM for container shutdowns
  process.on('SIGTERM', async () => {
    console.log('\n🛑 SIGTERM received, shutting down...');
    
    try {
      await mongooseConnection.close();
      await redis.quit();
    } catch (err) {
      console.error('Error during shutdown:', err.message);
    }
    
    server.close(() => process.exit(0));
  });
})();
