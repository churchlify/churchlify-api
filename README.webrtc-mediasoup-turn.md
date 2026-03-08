# WebRTC (Mediasoup + CoTURN) Simplified Guide

This document explains the current WebRTC architecture for Churchlify and how signaling/media flows between clients, API, mediasoup, and CoTURN.

## 1. Architecture Summary

Current recommended topology for your platform: `external` mediasoup.

- API service (`churchlify_api`):
  - Handles auth-protected REST endpoints under `/chat/*`.
  - Handles Socket.IO signaling events.
  - Forwards mediasoup signaling actions to external mediasoup service.
- Mediasoup service (separate K8s app):
  - Owns SFU state (routers, transports, producers, consumers).
  - Exposes one action endpoint for signaling commands.
  - RTP/RTCP UDP range is reachable via MetalLB (`42000-42100`).
- CoTURN service (`turn.churchlify.com`):
  - Provides relay fallback when direct ICE paths fail.
  - Uses long-term auth secret shared with API.
- Redis:
  - Stores room membership in API layer.

## 2. Required Environment Variables

Set on API service:

- `MEDIASOUP_TOPOLOGY=external`
- `MEDIASOUP_SIGNALING_BASE_URL=http://<mediasoup-signaling-service>`
- `MEDIASOUP_SIGNALING_ACTION_PATH=/v1/signaling/actions` (default)
- `MEDIASOUP_SIGNALING_API_KEY=<optional-shared-key>`
- `MEDIASOUP_SIGNALING_TIMEOUT_MS=10000`
- `SOCKET_REQUIRE_AUTH=true` (default; set `false` only for trusted local development)
- `TURN_URL=turn.churchlify.com`
- `TURN_SHARED_SECRET=<same-as-coturn-static-auth-secret>`
- `TURN_USER_EXPIRY_SEC=600`

Set on mediasoup service:

- `MEDIASOUP_ANNOUNCED_IP=mediasoup.churchlify.com` (or equivalent service setting)
- `MEDIASOUP_MIN_PORT=42000`
- `MEDIASOUP_MAX_PORT=42100`

Set on coturn:

- `realm=turn.churchlify.com`
- `use-auth-secret`
- `static-auth-secret=<same TURN_SHARED_SECRET>`
- Expose relay ports (`min-port`/`max-port`) and open them in LB/firewall.

## 3. API Endpoints in This Repository

All `/chat/*` routes are behind auth middleware in `server.js` (Bearer token required).

### `GET /chat/webrtc/config`
Purpose: tells client what topology/signaling mode is active.

Example response:

```json
{
  "topology": "external",
  "signaling": {
    "mode": "api-bridge",
    "actionEndpoint": "http://mediasoup-service.default.svc.cluster.local/v1/signaling/actions"
  }
}
```

### `GET /chat/turn-credentials`
Purpose: returns temporary TURN credentials for ICE.

Example response:

```json
{
  "username": "1762437097:churchlify",
  "credential": "1f+gF3m5o3fUi3qY3AP8xCjQ9mE=",
  "ttlSec": 600,
  "urls": [
    "turn:turn.churchlify.com:3478?transport=udp",
    "turn:turn.churchlify.com:3478?transport=tcp",
    "turns:turn.churchlify.com:5349?transport=tcp"
  ]
}
```

### `POST /chat/rooms`
Purpose: creates room membership key.

Request:

```json
{
  "roomId": "room-1001"
}
```

Response:

```json
{
  "roomId": "room-1001",
  "status": "created"
}
```

### `POST /chat/rooms/join`
Purpose: adds a user to room membership key.

Request:

```json
{
  "roomId": "room-1001",
  "userId": "user-42"
}
```

Response:

```json
{
  "roomId": "room-1001",
  "userId": "user-42",
  "status": "joined"
}
```

### `GET /chat/rooms/:roomId/members`
Purpose: returns current room members from Redis/in-memory room state.

Example response:

```json
{
  "roomId": "room-1001",
  "members": ["67ce8f...", "67ce9a..."]
}
```

### `GET /chat/rooms/:roomId`
Purpose: returns room moderation settings (alias endpoint for client compatibility).

Example response:

```json
{
  "roomId": "group:fellowship:67ce8f...",
  "settings": {
    "chatEnabled": true,
    "callsEnabled": true,
    "moderatedBy": null,
    "updatedAt": null
  }
}
```

### `GET /chat/rooms/:roomId/settings`
Purpose: returns room moderation settings.

### `PATCH /chat/rooms/:roomId/moderation`
Purpose: updates room moderation flags (`chatEnabled`, `callsEnabled`) for admins/super users and room leaders.

Request:

```json
{
  "chatEnabled": false,
  "callsEnabled": true
}
```

Response:

```json
{
  "roomId": "group:fellowship:67ce8f...",
  "settings": {
    "chatEnabled": false,
    "callsEnabled": true,
    "moderatedBy": "67ce9a...",
    "updatedAt": "2026-03-07T12:34:56.000Z"
  }
}
```

### `PATCH /chat/rooms/:roomId`
Purpose: backward-compatible alias for moderation updates.

### `POST /chat/messages/upload`
Purpose: uploads a chat attachment/voice-note file and returns reusable file metadata.

Request:

- `Content-Type: multipart/form-data`
- form field: `file`

Response:

```json
{
  "fileUrl": "https://s3.churchlify.com/churchlify-data/uuid-file.m4a",
  "fileName": "voice-note.m4a",
  "mimeType": "audio/mp4",
  "sizeBytes": 245102,
  "uploadedBy": "67ce9a...",
  "uploadedAt": "2026-03-07T13:00:00.000Z"
}
```

### `POST /chat/rooms/:roomId/typing`
Purpose: updates current user's typing state and emits `chat:typing`.

Request:

```json
{
  "isTyping": true
}
```

### `GET /chat/rooms/:roomId/typing`
Purpose: returns active typers in the room.

Example response:

```json
{
  "roomId": "room-1001",
  "typing": ["67ce8f..."],
  "at": "2026-03-07T13:00:00.000Z"
}
```

### `POST /chat/messages`
Purpose: creates and broadcasts a chat message.
If room moderation has `chatEnabled=false`, this returns `403`.
Supported `messageType` values: `text`, `system`, `announcement`, `attachment`, `voice_note`.

Validation rules:

- `text`: requires non-empty `text`
- `attachment`: requires `metadata.fileUrl`
- `voice_note`: requires `metadata.fileUrl` (and optional numeric `metadata.durationSec`)

Request:

```json
{
  "roomId": "room-1001",
  "text": "Hello everyone",
  "participants": ["67ce8f...", "67ce9a..."],
  "messageType": "text"
}
```

Attachment example:

```json
{
  "roomId": "room-1001",
  "participants": ["67ce8f...", "67ce9a..."],
  "messageType": "attachment",
  "text": "Sunday bulletin",
  "metadata": {
    "fileUrl": "https://api.churchlify.com/uploads/file-abc.pdf",
    "fileName": "bulletin.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 932144
  }
}
```

Voice note example:

```json
{
  "roomId": "room-1001",
  "participants": ["67ce8f...", "67ce9a..."],
  "messageType": "voice_note",
  "metadata": {
    "fileUrl": "https://api.churchlify.com/uploads/voice-123.m4a",
    "mimeType": "audio/mp4",
    "durationSec": 12.4
  }
}
```

Response:

```json
{
  "message": {
    "id": "67d0b5...",
    "roomId": "room-1001",
    "messageType": "text",
    "text": "Hello everyone"
  }
}
```

### `GET /chat/messages?roomId=<roomId>&limit=30&before=<ISO_DATE>`
Purpose: returns paginated message history for a room.

### `PATCH /chat/messages/:id/read`
Purpose: marks a message as read by current authenticated user.

### `POST /chat/calls/start`
Purpose: creates a call session and emits ringing event.
If room moderation has `callsEnabled=false`, this returns `403`.

Request:

```json
{
  "roomId": "room-1001",
  "participants": ["67ce8f...", "67ce9a..."],
  "mediaType": "video"
}
```

### `POST /chat/calls/:id/accept`
Purpose: accepts ringing call and moves call status to `active`.

### `POST /chat/calls/:id/reject`
Purpose: rejects ringing call and ends with `rejected` status.

### `POST /chat/calls/:id/end`
Purpose: ends active/ringing call (`ended` or `cancelled` status).

### `GET /chat/calls/history?roomId=<roomId>&limit=30&skip=0`
Purpose: returns call history for current user.

## 4. Socket.IO Signaling Events (Client <-> API)

These events are implemented in `media-client.js`.

Client emits with ack callback:

- `joinRoom` `{ roomId, userId }`
- `leaveRoom` `{ roomId, userId }`
- `getRouterRtpCapabilities` `{ roomId }`
- `createWebRtcTransport` `{ roomId, direction }`
- `connectWebRtcTransport` `{ roomId, transportId, dtlsParameters }`
- `produce` `{ roomId, transportId, kind, rtpParameters, appData }`
- `consume` `{ roomId, transportId, producerId, rtpCapabilities }`
- `resumeConsumer` `{ roomId, consumerId }`
- `closeProducer` `{ roomId, producerId }`
- `closeConsumer` `{ roomId, consumerId }`
- `listProducers` `{ roomId }`
- `chatTyping` `{ roomId, isTyping }`
- `call:signal` `{ roomId, type, payload, targetPeerId }`

Optional REST fallback for typing indicators:

- `POST /chat/rooms/:roomId/typing`
- `GET /chat/rooms/:roomId/typing`

Ack envelope from API:

```json
{
  "ok": true,
  "data": { "...": "..." }
}
```

Or on error:

```json
{
  "ok": false,
  "error": "External mediasoup signaling failed: ..."
}
```

Server emits to clients:

- `userJoined` `{ userId, roomId }`
- `userLeft` `{ userId, roomId }`
- `newProducer` `{ roomId, producerId, peerId, kind }`
- `chat:message:new` `{ ...message }`
- `chat:message:read` `{ messageId, roomId, userId, readAt }`
- `chat:typing` `{ roomId, userId, isTyping, at }`
- `call:ringing` `{ ...call }`
- `call:accepted` `{ ...call }`
- `call:rejected` `{ ...call }`
- `call:ended` `{ ...call }`
- `call:signal` `{ roomId, type, payload, targetPeerId, fromPeerId, at }`
- `chat:room:moderation` `{ roomId, settings }`

## 5. Endpoint You Need in External Mediasoup Service

Create this endpoint in the separate mediasoup app:

### `POST /v1/signaling/actions`

Headers:

- `Content-Type: application/json`
- `x-media-api-key: <key>` (if you set `MEDIASOUP_SIGNALING_API_KEY`)

Generic request envelope:

```json
{
  "action": "getRouterRtpCapabilities",
  "payload": {
    "roomId": "room-1001",
    "peerId": "user-42",
    "socketId": "Q8xa..."
  }
}
```

Response format:

```json
{
  "...": "Action-specific result fields"
}
```

Generic error envelope:

```json
{
  "ok": false,
  "error": "room not found"
}
```

### Actions to implement in mediasoup service

1. `joinPeer`
2. `leavePeer`
3. `getRouterRtpCapabilities`
4. `createWebRtcTransport`
5. `connectWebRtcTransport`
6. `produce`
7. `consume`
8. `resumeConsumer`
9. `closeProducer`
10. `closeConsumer`
11. `listProducers`
12. `disconnectPeer`

### Suggested per-action response shapes

`getRouterRtpCapabilities` response:

```json
{
  "routerRtpCapabilities": {
    "codecs": [],
    "headerExtensions": []
  }
}
```

`createWebRtcTransport` response:

```json
{
  "transportId": "t-123",
  "iceParameters": {},
  "iceCandidates": [],
  "dtlsParameters": {},
  "sctpParameters": null
}
```

`connectWebRtcTransport` response:

```json
{
  "connected": true
}
```

`produce` response:

```json
{
  "producerId": "p-456"
}
```

`consume` response:

```json
{
  "consumerId": "c-789",
  "producerId": "p-456",
  "kind": "video",
  "rtpParameters": {},
  "type": "simple",
  "producerPaused": false
}
```

`resumeConsumer`, `closeProducer`, `closeConsumer`, `disconnectPeer` response:

```json
{
  "ok": true
}
```

`listProducers` response:

```json
{
  "producerIds": ["p-456", "p-457"]
}
```

## 6. Communication Flow (End-to-End)

1. Client authenticates with API.
2. Client requests `GET /chat/turn-credentials`.
3. Client opens Socket.IO to API and emits `joinRoom`.
4. API forwards `joinPeer` action to mediasoup service.
5. Client emits `getRouterRtpCapabilities`.
6. Client emits `createWebRtcTransport` twice (`send` and `recv`).
7. Client emits `connectWebRtcTransport` for each transport.
8. Publisher emits `produce`; API emits `newProducer` to room.
9. Subscribers emit `consume` for each producer.
10. Subscribers emit `resumeConsumer`.
11. On leave/disconnect, API forwards cleanup (`leavePeer` / `disconnectPeer`).
12. Text chat is sent via `POST /chat/messages`; API emits `chat:message:new` to room.
13. Call lifecycle is managed via `/chat/calls/*`; API emits `call:ringing`, `call:accepted`, `call:ended`.
14. Optional UX signals (`chatTyping`, `call:signal`) travel over Socket.IO.

## 7. Testing and Validation

## 7.1 Network/Infra Smoke

- Mediasoup UDP range:
  - `echo "test" | nc -u -v -w 1 mediasoup.churchlify.com 42000`
- TURN UDP/TCP:
  - `nc -u -v -w 1 turn.churchlify.com 3478`
  - `nc -v -w 1 turn.churchlify.com 3478`
- TURN TLS:
  - `openssl s_client -connect turn.churchlify.com:5349 -servername turn.churchlify.com`

## 7.2 API Smoke

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  https://api.churchlify.com/chat/webrtc/config

curl -H "Authorization: Bearer <TOKEN>" \
  https://api.churchlify.com/chat/turn-credentials

curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -H "x-church: <CHURCH_ID>" \
  -d '{"roomId":"room-1001","text":"hello"}' \
  https://api.churchlify.com/chat/messages

curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -H "x-church: <CHURCH_ID>" \
  -d '{"roomId":"room-1001","participants":["<USER_ID_2>"],"mediaType":"voice"}' \
  https://api.churchlify.com/chat/calls/start
```

Expect:

- topology is `external`
- TURN URLs point to `turn.churchlify.com`
- username is `<unixExpiry>:churchlify`
- message create returns `201` and emits `chat:message:new`
- call start returns `201` and emits `call:ringing`

## 7.3 External Mediasoup Endpoint Smoke

```bash
curl -X POST http://<mediasoup-service>/v1/signaling/actions \
  -H "Content-Type: application/json" \
  -H "x-media-api-key: <KEY>" \
  -d '{
    "action": "getRouterRtpCapabilities",
    "payload": {
      "roomId": "room-1001",
      "peerId": "user-42",
      "socketId": "socket-abc"
    }
  }'
```

Expect `200` and valid `routerRtpCapabilities`.

For the standalone mediasoup app in this repository, two test helpers are available:

- Automated smoke script: `mediasoup/smoke-signaling.mjs`
- Manual full workflow requests: `mediasoup/signaling-actions.http`
- Two-peer end-to-end script (real WebRTC transports): `mediasoup/two-peer-e2e.mjs`

Run automated smoke script:

```bash
cd mediasoup
MS_BASE_URL=http://localhost:3000 \
MS_ACTION_PATH=/v1/signaling/actions \
MS_API_KEY=<optional> \
npm run smoke:signaling
```

Run two-peer E2E transport test:

```bash
cd mediasoup
npm install
MS_BASE_URL=http://localhost:3000 \
MS_ACTION_PATH=/v1/signaling/actions \
MS_API_KEY=<optional> \
MS_ROOM_ID=e2e-room-1 \
npm run e2e:two-peer
```

Notes:

- The two-peer script uses `mediasoup-client` + `wrtc` and validates producer/consumer flow.
- `wrtc` is a native module; ensure build prerequisites are available in your environment.

## 7.4 Browser E2E Smoke

1. Open client A and client B in separate browsers/devices.
2. Both join same room.
3. A publishes audio/video.
4. B receives both tracks.
5. Disconnect A and verify cleanup event on B.

Success criteria:

- `newProducer` is emitted to other peers.
- `consume` succeeds for both audio and video.
- ICE reaches `connected`/`completed`.
- On disconnect, stale producers/consumers are removed.

## 7.5 Troubleshooting Checklist

- If `turn-credentials` fails:
  - verify `TURN_URL` and `TURN_SHARED_SECRET` in API env.
- If signaling ack returns `ok: false`:
  - verify mediasoup action endpoint URL and API key.
- If ICE fails behind NAT:
  - verify mediasoup announced IP/host and UDP port exposure.
  - verify coturn relay range exposure and firewall rules.
- If no remote media:
  - verify `newProducer` is received and `consume` is called.

## 8. Current Known Limitations

- Embedded mediasoup signaling actions are not implemented in API (`external` mode is the intended path right now).
- Socket events currently use room-wide broadcast for `call:signal`; client should filter by `targetPeerId` when present.
