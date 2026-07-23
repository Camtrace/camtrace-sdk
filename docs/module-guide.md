# Module Guide

Detailed API reference for each package.

## @camtrace/api

**Package:** `@camtrace/api` v1.23.0 | **Build:** `packages/api/build/build.js` (UMD, also works in Node.js)

### Entry point

```js
import CamtraceApi from '@camtrace/api'
const cm = await CamtraceApi.loadApis(host, port, ssl, appVersion?)
```

`loadApis`:
- `GET /api/` — rejects servers before v1.2
- Computes `timeShift` from HTTP `Date` header
- Returns a `CMInterface` instance

### CMInterface — Authentication

| Method | Signature | Description |
|--------|-----------|-------------|
| `loadApis` | `(host, port, ssl, appVersion?)` → `CMInterface` | Static factory |
| `simpleLogin` | `(user, plaintext)` → `{ services, permissions }` | Hash + login |
| `login` | `(user, cryptpass)` → `{ services, permissions }` | Login with stored hash |
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

**Package:** `@camtrace/decoder` v2.0.0 | **Build:** `packages/decoder/build/build.js` (UMD, also Node.js)

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

Feed via `write(buffer: Buffer)`. Send commands via the dedicated methods — commands are rate-limited to 150ms apart.

**`CMDecoder.Control` — server control channel:**

| Method | Sends |
|--------|-------|
| `wsseLogin(user, digest, nonce, created)` | `login wsse …` |
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
| `goto(pos)` | `goto <pos>` |
| `time(ts)` | `time <ts>` |
| `step(n)` | `step <n>` |
| `freq(f)` | `freq <f>` |

Events: `'id'` `([playerId])`, `'load'` `([data])`, `'time'` `([position])`

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

**Package:** `@camtrace/streaming` v1.0.0 | **Entry:** `packages/streaming/src/index.js`

### Exports

```js
import {
  SimpleService,
  services,
  connectToServer,
  LivePlayer,
  PlaybackPlayer,
  setupCordovaHooks,
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

### `connectToServer(server, options?)`

```js
const { cmInterface, cmUser, cmCtrl, cmCameras } = await connectToServer({
  host, port, ssl, user,
  cryptpass   // BCrypt hash — use cm.getCryptPass() to obtain
}, { appVersion? })
```

### `SimpleService`

| Method | Description |
|--------|-------------|
| `connect()` | Open WebSocket, start keepAlive if enabled |
| `pause()` | Mute close event, close WebSocket |
| `resume()` | Reopen WebSocket |
| `close()` | Close (fires `'close'` event) |
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
| `.start(bar, startTime, endTime, barSize, currentTime)` → `Promise<this>` | Open both channels, init player |
| `.play()` / `.backward()` / `.stop()` | Playback direction |
| `.seek(pos)` / `.setTime(ts)` | Seek |
| `.step(n)` / `.setSpeed(freq)` | Frame step / speed |
| `.close()` | Release both WebSocket connections |
| `'ready'` | Video channel open, playback commands accepted |
| `'time'` `([pos])` | Current position |
| `'load'` `([data])` | Timeline availability data |
| `'frame'` / `'packet'` / `'close'` | Same as LivePlayer |

### `setupCordovaHooks(service)` (mobile apps only)

Binds Cordova `pause`/`resume` events to `service.pause()`/`service.resume()`. Only needed in Cordova environments — browsers silently ignore these events by default.
