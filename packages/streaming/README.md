# @camtrace/streaming

High-level streaming façades for CamTrace. Wraps `@camtrace/api` and `@camtrace/decoder` to provide a simple connect-and-play API, handling WebSocket lifecycle, keep-alive pings, and the multi-step record playback handshake.

## Quickstart — Live stream

```js
import CamtraceApi from '@camtrace/api'
import { services } from '@camtrace/streaming'
import WebDecoder from '@camtrace/web-video-decoder'

// 1. Connect and authenticate
const cm = await CamtraceApi.loadApis('192.168.1.100', 443, true)
await cm.simpleLogin('admin', 'plaintext_password')

// 2. Get cameras
const cameras = await cm.cameras()
const stream  = cameras[0].formatedStreams.hd

// 3. Open live stream (the `_accept` protocol variant advertised at login is
//    sent automatically — v1b, required for H265 cameras and for audio)
const liveService = await services.openLiveService(cm, stream.url)

// 4. Decode and render
const decoder = new WebDecoder()
const canvas  = document.getElementById('video')
const ctx     = canvas.getContext('2d')

liveService.cmDecoder.on('packet', pck =>
  decoder.sendPacket(pck, canvas.width, canvas.height, true))

decoder.on('decodeddata', ({ rgbData, width, height }) =>
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgbData), width, height), 0, 0))

// Cleanup
liveService.forceSilentClose()
decoder.close()
```

## Quickstart — LivePlayer façade

`LivePlayer` is a higher-level wrapper that manages the decoder lifecycle for you:

```js
import CamtraceApi from '@camtrace/api'
import { LivePlayer } from '@camtrace/streaming'
import WebDecoder from '@camtrace/web-video-decoder'

const cm = await CamtraceApi.loadApis('192.168.1.100', 443, true)
await cm.simpleLogin('admin', 'password')
const cameras = await cm.cameras()

const player = new LivePlayer(
  cm,
  cameras[0].formatedStreams.hd.url,
  { DecoderClass: WebDecoder }
)

player.attach(document.getElementById('video'))
await player.start()

player.on('frame', ({ rgbData, width, height }) => { /* custom rendering */ })
player.on('close', () => console.log('stream closed'))
player.stop()
```

## Quickstart — Record playback

```js
import { services } from '@camtrace/streaming'
import CMDecoder from '@camtrace/decoder'

// Open control channel
const ctrl = new CMDecoder.Record.Control()
await services.openControlRecordService(cm, cameraId, async (ctrlService, [playerId]) => {
  // Open video channel once we have a player ID
  const vidService = await services.openVideoRecordService(cm, playerId)
  vidService.cmDecoder.on('packet', pck => decoder.sendPacket(pck, w, h, true))

  // Initialize and start
  ctrlService.cmDecoder.init(barName, cameraId, startTime, endTime, barSize, currentTime)
  ctrlService.cmDecoder.playForward()
  ctrlService.cmDecoder.on('time', ([pos]) => console.log('position:', pos))
})
```

Or use `PlaybackPlayer` for a simpler interface:

```js
import { PlaybackPlayer } from '@camtrace/streaming'
import WebDecoder from '@camtrace/web-video-decoder'

const player = new PlaybackPlayer(cm, cameraId, { DecoderClass: WebDecoder })
player.attach(document.getElementById('video'))

// autoOpenVideo: true opens the video channel before sending init, so the server
// can immediately stream the initial non-timestamped preview frames on connect.
await player.start('regul', startSec, endSec, 1000, startSec, { autoOpenVideo: true })

player.on('ready', () => { /* preview frame already displayed; call play() to start */ })
player.on('time',  pos => updateTimeline(pos))   // pos is Unix seconds (from video status packets)

// Playback controls
player.play()             // play forward
player.backward()         // play backward
player.stop()             // stop (keeps video channel open)
player.seek(barPosition)  // go to bar position (0–barSize)
player.setSpeed(freq)     // set playback frequency
player.stepForward()      // advance one frame (play next) — use only when stopped
player.stepBackward()     // retreat one frame (play prev) — use only when stopped
player.setBarType(type, currentSec)  // switch between 'regul' and 'alarm' bar data
player.close()            // release both WebSocket connections
```

## API Reference

### `connectToServer(server, [options])`

Pure function equivalent of the mobile app's server connection sequence.

```js
import { connectToServer } from '@camtrace/streaming'

const { cmInterface, cmUser, cmCtrl, cmCameras } = await connectToServer({
  host: '192.168.1.100',
  port: 443,
  ssl: true,
  user: 'admin',
  cryptpass: storedBcryptHash   // use cm.getCryptPass() to obtain this
}, { appVersion: '1.0.0' })
```

Returns `{ cmInterface, cmUser, cmCtrl, cmCameras }`.

### `services`

Low-level WebSocket service factories. All return a `SimpleService` instance.

| Method | Description |
|--------|-------------|
| `openLiveService(cm, streamUrl, protocol, type?, compr?)` | Binary live stream |
| `openGroupLiveService(cm, cameraIds[], protocol, compr?, w?, h?)` | Binary mosaic stream |
| `openControlService(cm)` | Text server control channel |
| `openControlRecordService(cm, cameraId, playerIdCb)` | Text record control channel |
| `openVideoRecordService(cm, playerId, protocol)` | Binary record video channel |

### `SimpleService`

Underlying class used by all services. Wraps `websocket-as-promised` with CMDecoder binding, keep-alive pings (30s), and automatic reconnect hooks.

```js
service.connect()
service.pause()               // mute close, close WS (Cordova background)
service.resume()              // reopen WS
service.close()               // close with close event
service.forceSilentClose()    // close silently, no event
service.cmDecoder             // the bound CMDecoder instance
service.on('close', handler)
```

**Cordova lifecycle integration (mobile apps only):**
```js
import { setupCordovaHooks } from '@camtrace/streaming/src/platform'
setupCordovaHooks(service)    // binds Cordova pause/resume events
```

### `LivePlayer`

```js
new LivePlayer(cmInterface, streamUrl, { DecoderClass?, streamType?, type?, compr? })
.attach(canvas)               // returns this
.start()                      // returns Promise<this>
.stop()
.on('frame', { rgbData, width, height })
.on('packet', pck)
.on('close', event)
.on('error', event)
```

### `PlaybackPlayer`

```js
new PlaybackPlayer(cmInterface, cameraId, { DecoderClass?, streamType? })
.attach(canvas)
.start(barName, startTime, endTime, barSize, currentTime, { autoOpenVideo? })
  // returns Promise<this>. autoOpenVideo:true opens video before init so preview frames arrive.
  // Internally: awaits video channel, waits for server 'load' event, then sends init (no type).
.play()           // play forward (opens video channel if closed)
.backward()       // play backward
.stop()           // stop playback
.seek(barPos)     // goto bar position (0–barSize)
.setTime(ts)      // set position (Unix ms)
.setSpeed(freq)   // set playback frequency
.stepForward()    // play next frame — use only when stopped
.stepBackward()   // play prev frame — use only when stopped
.setBarType(type, currentSec)  // switch bar type ('regul'/'alarm'); sends type command
.close()
.on('ready')      // init sent, preview frame incoming (not yet playing)
.on('frame', { width, height })  // canvas already drawn; use for scheduleFit/status only
.on('time', pos)  // pos = Unix seconds, sourced from video channel status packets
.on('bar',  args) // args = [type, seqnum, charString] — server sends all types at init
.on('step', args)
.on('load', args)
.on('close', event)
```

**Protocol notes:**
- `start()` sends only `init` (not `type`) — sending `type` after `init` triggers a second `createDecoder` reset in the WASM decoder, causing P-frames to decode to black before the next I-frame.
- `'time'` events are emitted from video channel `status` packets (`"image <flags> <unix_ms>"`), not from control channel `time` commands.
- `'bar'` events for ALL bar types (`regul`, `alarm`, `index`…) are sent by the server in a single burst at `init`. The `type` command does **not** trigger new bar events — cache bar data client-side.
- Bar character encoding: `'A'`/`'a'` = surveillance zone marker, not a recording. Actual recordings are represented by other non-null chars (`'q'`, `'Q'`, `'r'`, `'R'`…) for both `regul` and `alarm` bars.

### `CTRL_CONNECT_RETRY_INTERVAL`

Milliseconds between control channel reconnect attempts (default: `5000`).

### `setLogHandler(fn)`

```js
import { setLogHandler } from '@camtrace/streaming'
setLogHandler((level, message, data) => console[level](`[stream] ${message}`, data))
```

Optional sink for the WebSocket lifecycle of every `SimpleService` (`websocket opening`,
`websocket open`, `websocket closed` with `code`/`reason`, `websocket error`, `websocket open
failed`, `control channel connection failed`). `level` is `debug | info | warn | error`;
`data.url` is the service URL without its authentication parameters. Nothing is logged until
a handler is set.

## WebSocket lifecycle

```
connect()
  └─ ws.open()
       └─ keepAlive ping every 30s (if no traffic)
            └─ ws.close event
                  └─ emit 'close'
                       └─ app reconnects after CTRL_CONNECT_RETRY_INTERVAL
```

## Dependencies

`@camtrace/api`, `@camtrace/decoder`, `event-emitter-es6`, `websocket-as-promised`
