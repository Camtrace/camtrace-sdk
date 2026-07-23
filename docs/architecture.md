# Architecture

## Overview

The CamTrace SDK consists of four packages that work together to stream live and recorded video from a CamTrace server to a browser canvas.

```
┌─────────────────────────────────────────────────────────────┐
│                        Your Application                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
  @camtrace/api    @camtrace/streaming  @camtrace/web-video-decoder
  (HTTP client)    (WS lifecycle)       (WASM decoder — optional)
         │                 │
         └────────┬────────┘
                  │
         @camtrace/decoder
         (binary/text parser)
```

- **`@camtrace/api`** authenticates and talks to the CamTrace HTTP API (camera list, service URLs).
- **`@camtrace/decoder`** parses the binary WebSocket frames into typed packets and sends text commands.
- **`@camtrace/streaming`** manages WebSocket connections (keep-alive, reconnect) and provides high-level `LivePlayer` / `PlaybackPlayer` façades.
- **`@camtrace/web-video-decoder`** is a reference FFmpeg-WASM decoder. It is **substitutable** — any decoder that consumes the `packet` events from `@camtrace/decoder` will work (WebCodecs, native SDK, etc.).

## Data flow — Live stream

```mermaid
sequenceDiagram
  participant App
  participant API   as @camtrace/api
  participant Dec   as @camtrace/decoder
  participant WASM  as @camtrace/web-video-decoder
  participant Srv   as CamTrace Server

  App->>API: loadApis() + simpleLogin()
  API->>Srv: GET /api/ + GET /users/login
  Srv-->>API: services URLs + camera list

  App->>API: buildLiveCameraUrl(stream.url, 'video/h264')
  API-->>App: wss://…/live/view?id=…&_username=…

  App->>Srv: WebSocket connect
  Srv-->>Dec: binary frames (ArrayBuffer)
  Dec-->>App: emit 'packet' {name, subtype, data, …}
  App->>WASM: sendPacket(pck, width, height)
  WASM-->>App: emit 'decodeddata' {rgbData, width, height}
  App->>App: canvas.putImageData()
```

## Data flow — Record playback

Record playback requires two WebSocket connections opened sequentially. See [Advanced — Record Playback](advanced-player.md) for the full sequence.

## WebSocket connections

Each server session uses up to 5 WebSocket connections:

| Connection | Protocol | Direction | Decoder |
|------------|----------|-----------|---------|
| Control channel | Text (newline-delimited) | bidirectional | `CMDecoder.Control` |
| Live stream | Binary (NAL units) | server→client | `CMDecoder.Live` |
| Live mosaic | Binary | server→client | `CMDecoder.Live` |
| Record control | Text (null-byte-delimited) | bidirectional | `CMDecoder.Record.Control` |
| Record video | Binary (NAL units) | server→client | `CMDecoder.Record.Video` |

## WebSocket lifecycle

```mermaid
stateDiagram-v2
  [*]        --> Connecting : connect()
  Connecting --> Open       : ws opened
  Open       --> Open       : keepAlive ping (30s, if idle)
  Open       --> Closed     : server closes / network error
  Closed     --> Connecting : app reconnects (5s default)
  Open       --> [*]        : forceSilentClose()
```

`SimpleService` (from `@camtrace/streaming`) manages this lifecycle automatically.

## Authentication flow — WSSE

```mermaid
sequenceDiagram
  participant Client
  participant Server as CamTrace Server

  Client->>Server: GET /api/
  Server-->>Client: API version + Date header
  Note over Client: timeShift = serverDate − localDate

  Client->>Server: GET /api/v1.2/users/{username}/auth
  Server-->>Client: { auth: [{ salt: "$2a$…" }] }
  Note over Client: cryptpass = bcrypt(plaintext, salt)

  Client->>Server: GET /api/v1.2/users/login<br/>(Authorization + X-WSSE headers)
  Server-->>Client: { services: { live, control, … }, permissions }

  Note over Client: WSSE params embedded in WebSocket URLs<br/>(_username, _password, _nonce, _created_at)
```
