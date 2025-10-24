const http = require('http');
const { Server } = require('socket.io');
const { startWorker } = require('../media-client');
const eventWorker = require('../common/event.worker');

async function setupSocket(app) {
  const server = http.createServer(app);
  const io = new Server(server);

  try {
    await startWorker(io);
    eventWorker.start();
    console.log('✅ Media worker started');
  } catch (err) {
    console.error('❌ Failed to start media worker:', err);
    process.exit(1);
  }

  return { server, io };
}

module.exports = { setupSocket };
