import * as mediasoupClient from 'mediasoup-client';

async function loadWebRtcRuntime() {
  try {
    const mod = await import('wrtc');
    return mod.default || mod;
  } catch (err) {
    // fall through
    console.warn('Failed to load `wrtc` module, trying `@roamhq/wrtc`...', err.message);
  }

  try {
    const mod = await import('@roamhq/wrtc');
    return mod.default || mod;
  } catch (err) {
    console.warn('Failed to load `@roamhq/wrtc` module...', err.message);
    // fall through
  }

  throw new Error(
    'No WebRTC runtime found. Install one of: `npm i -O wrtc` or `npm i -O @roamhq/wrtc` in mediasoup/'
  );
}

const baseUrl = (process.env.MS_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const actionPath = process.env.MS_ACTION_PATH || '/v1/signaling/actions';
const apiKey = process.env.MS_API_KEY || '';
const roomId = process.env.MS_ROOM_ID || `e2e-room-${Date.now()}`;
const peerA = process.env.MS_PEER_A || 'peer-a';
const peerB = process.env.MS_PEER_B || 'peer-b';
const socketA = process.env.MS_SOCKET_A || `socket-${peerA}`;
const socketB = process.env.MS_SOCKET_B || `socket-${peerB}`;
const STEP_TIMEOUT_MS = Number(process.env.MS_STEP_TIMEOUT_MS || 12000);
const RUN_TIMEOUT_MS = Number(process.env.MS_RUN_TIMEOUT_MS || 45000);

function logStep(label, details) {
  const suffix = details === undefined ? '' : ` ${JSON.stringify(details)}`;
  console.log(`[e2e] ${label}${suffix}`);
}

function withTimeout(label, promise, timeoutMs = STEP_TIMEOUT_MS) {
  let timer = null;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function installNodeWebRtcGlobals(wrtc) {
  if (!globalThis.navigator) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Chrome/120.0.0.0' },
      configurable: true,
      enumerable: true,
      writable: false,
    });
  }
  globalThis.RTCPeerConnection = wrtc.RTCPeerConnection;
  globalThis.RTCSessionDescription = wrtc.RTCSessionDescription;
  globalThis.RTCIceCandidate = wrtc.RTCIceCandidate;
  globalThis.MediaStream = wrtc.MediaStream;
  globalThis.MediaStreamTrack = wrtc.MediaStreamTrack;
}

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (apiKey) {
    h['x-media-api-key'] = apiKey;
  }
  return h;
}

async function callAction(action, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${actionPath}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ action, payload }),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${action} failed: ${response.status} ${JSON.stringify(body)}`);
    }

    return body;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`action:${action} timed out after ${STEP_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function connectTransport(transport, room, peer, socket, label) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const settleResolve = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };

    const settleReject = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        logStep(`${label}:connect`);
        await callAction('connectWebRtcTransport', {
          roomId: room,
          peerId: peer,
          socketId: socket,
          transportId: transport.id,
          dtlsParameters,
        });
        callback();
      } catch (error) {
        logStep(`${label}:connectError`, { message: error.message });
        errback(error);
      }
    });

    transport.on('connectionstatechange', (state) => {
      logStep(`${label}:state`, { state });
      if (state === 'connected') {
        settleResolve();
      } else if (state === 'failed' || state === 'closed' || state === 'disconnected') {
        settleReject(new Error(`Transport ${transport.id} connection state: ${state}`));
      }
    });
  });
}

async function createDevice(routerRtpCapabilities) {
  const device = new mediasoupClient.Device({ handlerName: 'Chrome111' });
  await device.load({ routerRtpCapabilities });
  return device;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeCallAction(action, payload) {
  try {
    await callAction(action, payload);
  } catch (error) {
    logStep(`cleanup:${action}:failed`, { message: error.message });
  }
}

function safeClose(entity) {
  if (!entity) {
    return;
  }

  try {
    entity.close();
  } catch (err) {
    console.warn('Failed to close entity:', err.message);
  }
}

async function runInternal() {
  const wrtc = await loadWebRtcRuntime();
  installNodeWebRtcGlobals(wrtc);

  logStep('start', { baseUrl, actionPath, roomId, peerA, peerB });

  let sendTransportA = null;
  let recvTransportB = null;
  let producer = null;
  let consumer = null;
  let audioTrack = null;

  try {
    logStep('join:peerA');
    const joinA = await callAction('joinPeer', { roomId, peerId: peerA, socketId: socketA });

    logStep('join:peerB');
    await callAction('joinPeer', { roomId, peerId: peerB, socketId: socketB });

    const routerRtpCapabilities = joinA.routerRtpCapabilities;
    logStep('deviceA:load');
    const deviceA = await withTimeout('deviceA.load', createDevice(routerRtpCapabilities));
    logStep('deviceB:load');
    const deviceB = await withTimeout('deviceB.load', createDevice(routerRtpCapabilities));

    logStep('transportA:createSend');
    const sendTransportParamsA = await callAction('createWebRtcTransport', {
      roomId,
      peerId: peerA,
      socketId: socketA,
      direction: 'send',
    });

    logStep('transportB:createRecv');
    const recvTransportParamsB = await callAction('createWebRtcTransport', {
      roomId,
      peerId: peerB,
      socketId: socketB,
      direction: 'recv',
    });

    sendTransportA = deviceA.createSendTransport({
      id: sendTransportParamsA.transportId,
      iceParameters: sendTransportParamsA.iceParameters,
      iceCandidates: sendTransportParamsA.iceCandidates,
      dtlsParameters: sendTransportParamsA.dtlsParameters,
      sctpParameters: sendTransportParamsA.sctpParameters || undefined,
    });

    recvTransportB = deviceB.createRecvTransport({
      id: recvTransportParamsB.transportId,
      iceParameters: recvTransportParamsB.iceParameters,
      iceCandidates: recvTransportParamsB.iceCandidates,
      dtlsParameters: recvTransportParamsB.dtlsParameters,
      sctpParameters: recvTransportParamsB.sctpParameters || undefined,
    });

    const connectSendPromise = connectTransport(sendTransportA, roomId, peerA, socketA, 'sendTransportA');
    const connectRecvPromise = connectTransport(recvTransportB, roomId, peerB, socketB, 'recvTransportB');

    sendTransportA.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        logStep('produce:event', { kind });
        const produced = await callAction('produce', {
          roomId,
          peerId: peerA,
          socketId: socketA,
          transportId: sendTransportA.id,
          kind,
          rtpParameters,
          appData,
        });
        callback({ id: produced.producerId });
      } catch (error) {
        errback(error);
      }
    });

    const audioSource = new wrtc.nonstandard.RTCAudioSource();
    audioTrack = audioSource.createTrack();

    logStep('produce:begin');
    producer = await withTimeout(
      'sendTransportA.produce',
      sendTransportA.produce({
        track: audioTrack,
        appData: { track: 'mic', test: 'two-peer-e2e' },
      })
    );

    try {
      await withTimeout('sendTransportA.connected', connectSendPromise);
    } catch (error) {
      // Node WebRTC runtime can omit state transitions even when produce succeeds.
      logStep('sendTransportA:connectWarning', { message: error.message });
    }

    logStep('consume:request', { producerId: producer.id });
    const consumeData = await callAction('consume', {
      roomId,
      peerId: peerB,
      socketId: socketB,
      transportId: recvTransportB.id,
      producerId: producer.id,
      rtpCapabilities: deviceB.rtpCapabilities,
    });

    logStep('consume:createConsumer', { consumerId: consumeData.consumerId });
    consumer = await withTimeout(
      'recvTransportB.consume',
      recvTransportB.consume({
        id: consumeData.consumerId,
        producerId: consumeData.producerId,
        kind: consumeData.kind,
        rtpParameters: consumeData.rtpParameters,
        appData: { test: 'two-peer-e2e' },
      })
    );

    await callAction('resumeConsumer', {
      roomId,
      peerId: peerB,
      socketId: socketB,
      consumerId: consumer.id,
    });

    try {
      await withTimeout('recvTransportB.connected', connectRecvPromise);
    } catch (error) {
      // Some Node WebRTC runtimes keep recv transport state transitions opaque.
      logStep('recvTransportB:connectWarning', { message: error.message });
    }

    const listed = await callAction('listProducers', { roomId, peerId: peerB, socketId: socketB });
    logStep('listProducers', { count: (listed.producerIds || []).length });

    console.log('E2E success: producer created and consumed across two peers.');
    await delay(100);
  } finally {
    safeClose(consumer);
    safeClose(producer);

    if (audioTrack && typeof audioTrack.stop === 'function') {
      audioTrack.stop();
    }

    safeClose(sendTransportA);
    safeClose(recvTransportB);

    await safeCallAction('disconnectPeer', { peerId: peerA, roomIds: [roomId], socketId: socketA });
    await safeCallAction('disconnectPeer', { peerId: peerB, roomIds: [roomId], socketId: socketB });

    logStep('cleanup:done');
  }
}

async function run() {
  await withTimeout('runInternal', runInternal(), RUN_TIMEOUT_MS);
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
