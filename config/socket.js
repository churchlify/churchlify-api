const http = require('http');
const { Server } = require('socket.io');
const { startWorker, mediaTopology } = require('../media-client');
const eventWorker = require('../common/event.worker');
const notificationWorker = require('../common/notification.worker');
const userDeletionWorker = require('../common/user.deletion.worker');
const { auth } = require('../common/firebase');
const User = require('../models/user');

let io; // Store io instance globally

const socketRequireAuth = process.env.SOCKET_REQUIRE_AUTH !== 'false';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function extractSocketToken(socket) {
  const fromAuth = socket.handshake?.auth?.token;
  if (fromAuth) {
    return String(fromAuth).replace(/^Bearer\s+/i, '');
  }

  const fromQuery = socket.handshake?.query?.token;
  if (fromQuery) {
    return String(fromQuery).replace(/^Bearer\s+/i, '');
  }

  const authHeader = socket.handshake?.headers?.authorization;
  if (authHeader) {
    return String(authHeader).replace(/^Bearer\s+/i, '');
  }

  return null;
}

async function setupSocket(app) {
  const server = http.createServer(app);
  io = new Server(server, {
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : true,
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  io.use(async (socket, next) => {
    if (!socketRequireAuth) {
      return next();
    }

    try {
      const token = extractSocketToken(socket);
      if (!token) {
        return next(new Error('Missing Firebase token for socket authentication'));
      }

      const decoded = await auth.verifyIdToken(token);
      socket.data.authUser = decoded;

      const user = await User.findOne({ firebaseId: decoded.uid })
        .select('_id firebaseId church firstName lastName')
        .lean();

      if (user) {
        socket.data.authUserId = String(user._id);
        socket.data.authChurchId = user.church ? String(user.church) : null;
      }

      return next();
    } catch (error) {
      return next(new Error(`Socket auth failed: ${error.message}`));
    }
  });

  try {
    await startWorker(io);
    eventWorker.start();
    notificationWorker.start();
    userDeletionWorker.start();
    console.log(`✅ Socket + workers started (mediasoup topology: ${mediaTopology})`);
  } catch (err) {
    console.error('❌ Failed to start core worker:', err);
    process.exit(1);
  }

  return { server, io };
}

// Getter function to access io instance
function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized! Call setupSocket first.');
  }
  return io;
}

module.exports = { setupSocket, getIO };
