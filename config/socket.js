const http = require('http');
const { Server } = require('socket.io');
const { startWorker } = require('../media-client');
const eventWorker = require('../common/event.worker');
const notificationWorker = require('../common/notification.worker');

let io; // Store io instance globally

async function setupSocket(app) {
  const server = http.createServer(app);
  io = new Server(server);

  try {
    await startWorker(io);
    eventWorker.start();
    notificationWorker.start();
    console.log('✅ Media and Notification worker started');
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
