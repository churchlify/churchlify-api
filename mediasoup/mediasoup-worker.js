import { createWorker } from 'mediasoup';
import http from 'http'; // Add this

const HTTP_PORT = 3000;

async function startWorker() {
  // 1. Start the Media Engine
  const worker = await createWorker({
    logLevel: 'warn',
    rtcMinPort: 40000,
    rtcMaxPort: 40100,
  });

  worker.on('died', () => {
    console.error('Mediasoup worker died');
    process.exit(1);
  });

  console.log('✅ Mediasoup worker running');

  // 2. Start the Signaling/Health Server
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`🚀 Signaling server listening on port ${HTTP_PORT}`);
  });
}

startWorker().catch((err) => {
  console.error('❌ Failed to start Mediasoup worker:', err);
  process.exit(1);
});