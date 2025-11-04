const http = require('http');
const { Server } = require('socket.io');
const { startWorker } = require('../media-client');
const eventWorker = require('../common/event.worker');
const notificationWorker = require('../common/notification.worker');

async function setupSocket(app) {
  const server = http.createServer(app);
  const io = new Server(server);

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

module.exports = { setupSocket };
