
// mediasoup/mediasoup-worker.js
import { createWorker } from 'mediasoup';

async function startWorker() {
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
}

// Run immediately
startWorker().catch((err) => {
  console.error('❌ Failed to start Mediasoup worker:', err);
  process.exit(1);
});
