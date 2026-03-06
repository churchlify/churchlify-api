const baseUrl = (process.env.MS_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const actionPath = process.env.MS_ACTION_PATH || '/v1/signaling/actions';
const apiKey = process.env.MS_API_KEY || '';
const roomId = process.env.MS_ROOM_ID || 'smoke-room';
const peerId = process.env.MS_PEER_ID || `smoke-peer-${Date.now()}`;

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (apiKey) {
    h['x-media-api-key'] = apiKey;
  }
  return h;
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...headers(),
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

async function callAction(action, payload) {
  return request(actionPath, {
    method: 'POST',
    body: JSON.stringify({ action, payload }),
  });
}

async function run() {
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Action Path: ${actionPath}`);
  console.log(`Room: ${roomId}`);
  console.log(`Peer: ${peerId}`);

  const health = await request('/health');
  console.log('Health:', health);

  const joined = await callAction('joinPeer', { roomId, peerId, socketId: 'smoke-socket' });
  console.log('joinPeer:', joined);

  const rtpCaps = await callAction('getRouterRtpCapabilities', { roomId, peerId, socketId: 'smoke-socket' });
  console.log('getRouterRtpCapabilities:', {
    roomId: rtpCaps.roomId,
    codecs: rtpCaps.routerRtpCapabilities?.codecs?.length || 0,
    headerExtensions: rtpCaps.routerRtpCapabilities?.headerExtensions?.length || 0,
  });

  const transport = await callAction('createWebRtcTransport', {
    roomId,
    peerId,
    socketId: 'smoke-socket',
    direction: 'send',
  });
  console.log('createWebRtcTransport:', {
    transportId: transport.transportId,
    iceCandidates: transport.iceCandidates?.length || 0,
  });

  const producers = await callAction('listProducers', { roomId, peerId });
  console.log('listProducers:', producers);

  const disconnected = await callAction('disconnectPeer', { peerId, roomIds: [roomId], socketId: 'smoke-socket' });
  console.log('disconnectPeer:', disconnected);

  console.log('Smoke signaling test completed successfully.');
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
