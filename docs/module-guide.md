# Module Guide

Detailed API reference for each package.

## @camtrace/api

**Package:** `@camtrace/api` v2.2.0 | **Build:** `packages/api/build/build.js` (UMD, also works in Node.js)

### Entry point

```js
import CamtraceApi, { ApiError, ApiErrorCodes } from '@camtrace/api'
const cm = await CamtraceApi.loadApis(host, port, ssl, appVersion?, { timeout? })
```

`loadApis`:
- `GET /api/` — checks the HTTP status, rejects servers before v1.2
- Computes `timeShift` from HTTP `Date` header
- Aborts after `options.timeout` ms (default 15000); the same value is the HTTP timeout of every request of the returned `CMInterface`
- Returns a `CMInterface` instance

### Errors

`loadApis()`, `authenticate()`, `simpleLogin()`, `login()`, `basicLogin()` and `getCryptPass()`
reject with an `ApiError` (`err.code`, `err.message`, `err.httpStatus`, `err.cause`; on `loadApis()` errors
`err.url`, the discovery URL; on authentication refusals `err.authMethod`, `err.authMethods`, `err.basicWebSocket`).
Codes: `NETWORK`, `CERTIFICATE` (Node only: certificate refused; in a browser it is `NETWORK`), `TIMEOUT`,
`BAD_RESPONSE`, `HTTP_ERROR`, `VERSION_TOO_OLD`, `VERSION_UNSUPPORTED`, `AUTH_FAILED`,
`AUTH_LOCKED`, `AUTH_UNAVAILABLE`, `AUTH_HTTP`, `AUTH_CONFIG` — see `packages/api/README.md` and `troubleshooting.md`.
The other endpoints reject with the raw axios error.

### CMInterface — Authentication

| Method | Signature | Description |
|--------|-----------|-------------|
| `loadApis` | `(host, port, ssl, appVersion?)` → `CMInterface` | Static factory |
| `authenticate` | `({ user, pass?, cryptpass? })` → `{ method, cryptpass?, services, permissions, capabilities }` | WSSE, or HTTP Basic when the server requires it (keep `cryptpass` after `'wsse'`, the password after `'basic'`) |
| `simpleLogin` | `(user, plaintext)` → `{ method: 'wsse', cryptpass, services, permissions, capabilities }` | Hash + WSSE login |
| `login` | `(user, cryptpass)` → same | WSSE login with stored hash |
| `basicLogin` | `(user, plaintext)` → `{ method: 'basic', services, permissions, capabilities }` | HTTP Basic login |
| `basicWebSocket` | `()` → `boolean` | The server takes HTTP Basic on the WebSockets of this login |
| `authMethod` | `()` → `'wsse' \| 'basic'` | Method of the last login |
| `webSocketProtocols` | `()` → `string[] \| undefined` | Subprotocols for the service WebSockets (HTTP Basic credentials; `undefined` with WSSE) |
| `getCryptPass` | `(user, plaintext)` → `string` | BCrypt hash only |
| `buildAuth` | `()` → `{ username, digest, nonce, date }` | Current WSSE token |

### CMInterface — Cameras

| Method | Returns |
|--------|---------|
| `cameras()` | Array of camera objects with `formatedStreams: {hd, md, ld}` |
| `camera(id)` | Single camera |
| `cameraImageRef(id)` | `ObjectURL` (JPEG thumbnail) |
| `alarms()` | All alarms |
| `cameraAlarms(id)` | Alarms for one camera |
| `takeSnapshot(cameraId, time)` | Created snapshot |
| `protectRecord(cameraId, from, to, comment, type)` | Protected recording |

### CMInterface — Service URL builders

| Method | Description |
|--------|-------------|
| `buildLiveCameraUrl(streamUrl, accept?, type?, compr?)` | Authenticated live stream WS URL |
| `buildGroupLiveCameraUrl(ids[], accept?, compr?, vw?, vh?)` | Authenticated mosaic WS URL |
| `buildReplayCameraControlUrl(cameraId)` | Record control WS URL |
| `buildReplayCameraVideoUrl(playerId, accept?)` | Record video WS URL |
| `buildControlUrl()` | Main control channel WS URL |

### CMInterface — Other

| Method | Description |
|--------|-------------|
| `groups()` / `group(id)` | Camera groups |
| `extUrls()` / `extUrl(id)` / `triggerExtUrl(id)` | External URLs |
| `license()` / `sysinfo()` / `health()` | Server status |

---

## @camtrace/decoder

**Package:** `@camtrace/decoder` v2.2.0 | **Build:** `packages/decoder/build/build.js` (UMD, also Node.js)

### Exports

```js
import CMDecoder from '@camtrace/decoder'
// CMDecoder.Live           — live stream binary parser
// CMDecoder.Record.Video   — record video binary parser (identical format to live)
// CMDecoder.Record.Control — record playback text parser + command sender
// CMDecoder.Control        — server control text parser + command sender
```

### Binary decoders (Live / Record.Video)

Both extend `CMDecoder` (EventEmitter). Feed raw `ArrayBuffer` data via `write(buffer)`.

**`write(buffer: Buffer)`** — append incoming WebSocket data to internal parse buffer.

**Event `'packet'`** — emitted for each decoded frame:
```js
{
  type:    number,    // packet type byte (72=h264, 53=h265, …)
  name:    string,    // 'h264' | 'h265' | 'mpeg4' | 'jpeg' | 'audio' | …
  subtype: string?,   // 'H' | 'S' | 'I' | 'P' (video packets only)
  data:    Buffer,    // NAL unit (video) or raw payload
  rawLen:  number,    // payload length
  time:    number?,   // microseconds (tvSet * 1e6 + tvUset)
  tvSet:   number?,   // seconds part of timestamp
  tvUset:  number?,   // microseconds part of timestamp
  width:   number?,   // set on subtype 'H' (description)
  height:  number?,   // set on subtype 'H'
  fps:     number?,   // set on subtype 'H'
}
```

**Event `'send'`** — outgoing data to forward to the WebSocket (keep-alive or command responses).

### Text decoders (Control / Record.Control)

Feed via `write(buffer: Buffer)`. Send commands via the dedicated methods. `Control` sends them 150 ms apart; `Record.Control` sends each one at once, as one WebSocket message without a trailing `\0` (the server ends each message with its own, and a second `\0` made it drop a command read together with the previous one).

**`CMDecoder.Control` — server control channel:**

| Method | Sends |
|--------|-------|
| `wsseLogin(user, digest, nonce, created)` | `login wsse …` |
| `legacyLogin(user)` | `login <user> -` (historic line: on a channel its opening authenticated, e.g. HTTP Basic, the server answers `OK` or `nologin`) |
| `forceRecord(cameraId, force)` | `force [+\|-]<id>` |
| `ackAlarm(cameraId)` | `acquit <id>` |
| `ptzPreset(cameraId, presetId)` | `ptzd preset <id> <preset>` |
| `ptzArea(id, x0, y0, x1, y1, w, h)` | `ptzd area …` |
| `ptzCenter(id, x, y, w, h)` | `ptzd center …` |
| `ptzZoom(id, level)` | `ptzd zoom …` |
| `ptzTourStart(id, tourId)` | `ptzd tourstart …` |
| `ptzTourStop(id)` | `ptzd tourstop …` |

Events: `'login'`, `'event'` (status/presets/tours updates)

**`CMDecoder.Record.Control` — record playback channel:**

| Method | Sends |
|--------|-------|
| `createPlayer()` | `CTL` |
| `init(bar, camId, start, end, size, current)` | `init …` |
| `playForward()` | `play forw` |
| `playBackward()` | `play back` |
| `playNext()` / `playPrev()` | `play next` / `play prev` |
| `stop()` | `play stop` |
| `goto(pos, key?)` | `goto <pos>` |
| `time(sec, key?)` | `time <sec>` — Unix seconds |
| `timems(ms, key?)` | `timems <ms>` — Unix milliseconds, on servers that list `timems` in their capabilities |
| `seekTime(ms, key?)` | `timems <ms>` when the server lists it, `time <sec>` otherwise |

`key` (`'start'` or `'nearest'`) appends `key` or `key nearest`: the server sends the keyframe opening the position's group of pictures, or the nearest keyframe, alone instead of the exact image. Only servers that list `keyseek` in their capabilities accept it (an older one ignores the command and sends no image): `seekTime` drops it on the others, `goto`, `time` and `timems` send it as given.
| `step(n)` | `step <n>` |
| `freq(f)` | `freq <f>` |

Events: `'id'` `([playerId])`, `'load'` `([data])`, `'time'` `([position])` (not sent by current servers: the position comes from the video channel's `status` packets), `'capabilities'` (the words of the server's `capabilities` line, sent when the channel opens — `timems`, `keyseek`… —; also kept in `ctrl.capabilities`)

---

## @camtrace/web-video-decoder

**Package:** `@camtrace/web-video-decoder` v1.0.0 | **Entry:** `packages/web-video-decoder/src/app.js` (source, consumed by bundler)

> Generic FFmpeg-WASM decoder provided as a reference implementation. See the [package README](../packages/web-video-decoder/README.md) for bundler setup and substitution notes.

### WebDecoder class

```js
import WebDecoder from '@camtrace/web-video-decoder'
const decoder = new WebDecoder()
```

| Method / Event | Description |
|----------------|-------------|
| `sendPacket(pck, cWidth, cHeight, scale)` | Decode a packet from `@camtrace/decoder` |
| `close()` | Terminate the worker and free WASM resources |
| `on('decodeddata', ({ rgbData, width, height })` | Decoded RGBA frame |

`rgbData` is a `Uint8Array` — 4 bytes (RGBA) per pixel, row-major.

**Supported codecs:** `h264`, `h265`, `mpeg4`

---

## @camtrace/streaming

**Package:** `@camtrace/streaming` v1.4.0 | **Entry:** `packages/streaming/src/index.js`

### Exports

```js
import {
  SimpleService,
  services,
  connectToServer,
  LivePlayer,
  PlaybackPlayer,
  setupCordovaHooks,
  setLogHandler,
  CTRL_CONNECT_RETRY_INTERVAL
} from '@camtrace/streaming'
```

### `services` — WebSocket factories

All return a `SimpleService` instance with a bound CMDecoder.

| Method | Decoder | Binary? | keepAlive? |
|--------|---------|---------|------------|
| `openLiveService(cm, streamUrl, protocol, type?, compr?)` | `CMDecoder.Live` | yes | no |
| `openGroupLiveService(cm, ids[], protocol, compr?, w?, h?)` | `CMDecoder.Live` | yes | no |
| `openControlService(cm)` | `CMDecoder.Control` | no | no |
| `openControlRecordService(cm, cameraId, playerIdCb)` | `CMDecoder.Record.Control` | no | yes |
| `openVideoRecordService(cm, playerId, protocol)` | `CMDecoder.Record.Video` | yes | yes |

`openControlService` never rejects: if the control channel cannot be opened the service is
returned unconnected (`service.ws.isOpened === false`) and the failure is reported through
`setLogHandler`.

`openControlRecordService` resolves once the server gave a player, after `playerIdCb(service, playerId)`
was called. It rejects when the channel cannot be opened, when the server closes it before the player
id (`err.code === 'PLAYER_CLOSED'`, `err.closeCode`) and when no id came within 15 s
(`'PLAYER_TIMEOUT'`). The server closes the channel at once for a camera whose
records the user may not play (`playRecordsAllowed: false` in `GET /cameras`), and also for a refused
credential. Whenever it rejects, the service is closed for good, Cordova `pause` / `resume` listeners
included: an opening cut short by the app going to the background is not reopened on return.
`openVideoRecordService` does the same when its channel cannot be opened.

### `connectToServer(server, options?)`

```js
const { cmInterface, cmUser, cmCtrl, cmCameras } = await connectToServer({
  host, port, ssl, user,
  pass,       // the method follows the server (cmInterface.authenticate()), cmUser.method tells which
  cryptpass   // or the BCrypt hash of an earlier WSSE login alone: WSSE
}, { appVersion? })
```

### `SimpleService`

| Method | Description |
|--------|-------------|
| `connect()` | Open WebSocket, start keepAlive if enabled; sets the Cordova pause/resume listeners again after a close |
| `pause()` | Mute close event, stop keepAlive, close WebSocket |
| `resume()` | Reopen WebSocket |
| `close()` | Close (fires `'close'` event); the service no longer reopens on resume |
| `forceSilentClose()` | Close silently, no event, cancel keepAlive |
| `setLifecycleHooks({onPause, onResume})` | Override default Cordova lifecycle handlers |
| `getStreamId()` | Extract stream ID from WebSocket URL |
| `cmDecoder` | The bound CMDecoder instance |

### `LivePlayer`

```js
new LivePlayer(cm, streamUrl, { DecoderClass?, streamType?, type?, compr? })
```

| Method / Event | Description |
|----------------|-------------|
| `.attach(canvas)` → `this` | Set rendering canvas |
| `.start()` → `Promise<this>` | Open service, wire decoder, start rendering |
| `.stop()` | Release service and decoder |
| `'frame'` `({ rgbData, width, height })` | Decoded frame (if DecoderClass provided) |
| `'packet'` `(pck)` | Raw packet (for custom renderers) |
| `'close'` / `'error'` | WebSocket events |

### `PlaybackPlayer`

```js
new PlaybackPlayer(cm, cameraId, { DecoderClass?, streamType? })
```

| Method / Event | Description |
|----------------|-------------|
| `.attach(canvas)` → `this` | Set rendering canvas |
| `.start(bar, startTime, endTime, barSize, currentTime)` → `Promise<this>` | Open both channels, init player; rejects like `openControlRecordService` when the server gives no player |
| `.play()` / `.backward()` / `.stop()` | Playback direction |
| `.seek(pos)` / `.setTime(ts)` | Seek |
| `.step(n)` / `.setSpeed(freq)` | Frame step / speed |
| `.close()` | Release both WebSocket connections |
| `'ready'` | Video channel open, playback commands accepted |
| `'time'` `(pos)` | Current position, Unix seconds (from the video channel's `status` packets) |
| `'load'` `([data])` | Timeline availability data |
| `'frame'` / `'packet'` / `'close'` | Same as LivePlayer |

### `setupCordovaHooks(service)` (mobile apps only)

Binds Cordova `pause`/`resume` events to `service.pause()`/`service.resume()`. Only needed in Cordova environments — browsers silently ignore these events by default.

### `setLogHandler(fn)`

Optional log sink: `fn(level, message, data)` receives the WebSocket lifecycle of every
`SimpleService` (`websocket opening` / `open` / `closed` / `error` / `open failed`, plus the
control channel failure) with `level` in `debug | info | warn | error`. `data.url` is the
service URL **without** its WSSE authentication parameters; the subprotocols (HTTP Basic
credentials) are never passed. Nothing is logged until a
handler is set; pass `null` to remove it.
