# @camtrace/decoder

Binary and text protocol parsers for CamTrace WebSocket streams. Decodes live video, recorded video, and bidirectional control channels.

## Quickstart — Live stream

```js
import CMDecoder from '@camtrace/decoder'

const dec = new CMDecoder.Live()
const ws  = new WebSocket(liveUrl)   // URL from cm.buildLiveCameraUrl()
ws.binaryType = 'arraybuffer'

ws.onmessage = e => dec.write(Buffer.from(e.data))
dec.on('send', data => ws.send(data))   // keep-alive pings

dec.on('packet', pck => {
  // Video packet: { type, name, subtype, data, time, tvSet, tvUset, width?, height?, fps? }
  // pck.name:    'h264' | 'h265' | 'mpeg4' | 'jpeg' | …
  // pck.subtype: 'H' description | 'S' SPS/PPS | 'I' keyframe | 'P' inter-frame
  if (pck.name === 'h264' && pck.subtype === 'I') {
    // pck.data → Buffer containing the NAL unit
  }
})
```

## Quickstart — Record playback

```js
import CMDecoder from '@camtrace/decoder'

// Control channel
const ctrl   = new CMDecoder.Record.Control()
const ctrlWs = new WebSocket(ctrlUrl)  // from cm.buildReplayCameraControlUrl(cameraId)
ctrlWs.onmessage = e => ctrl.write(Buffer.from(e.data))
ctrl.on('send', data => ctrlWs.send(data))

ctrl.createPlayer()   // sends "CTL"

ctrl.on('id', async ([playerId]) => {
  // Video channel
  const vid   = new CMDecoder.Record.Video()
  const vidWs = new WebSocket(await cm.buildReplayCameraVideoUrl(playerId, cm.streamProtocol()))
  vidWs.binaryType = 'arraybuffer'
  vidWs.onmessage = e => vid.write(Buffer.from(e.data))
  vid.on('packet', pck => { /* render */ })

  // Initialize and start
  ctrl.init('bar', cameraId, startTime, endTime, barSize, currentTime)
  ctrl.playForward()
})

ctrl.on('time', ([pos]) => console.log('position:', pos))
```

## Exports

```js
import CMDecoder from '@camtrace/decoder'
// CMDecoder.Live           — live stream binary decoder
// CMDecoder.Record.Video   — recorded video binary decoder (same format as live)
// CMDecoder.Record.Control — recorded playback text decoder + command sender
// CMDecoder.Control        — server control channel text decoder + command sender
```

## Binary packet format

Each frame from the server:
```
[1B type][4B length (big-endian)][payload…]
```

**Packet `name` values** (from the `packet` event):

| name | byte | description |
|------|------|-------------|
| `h264` | 72 | H.264 video |
| `h265` | 53 | H.265 / HEVC video |
| `mpeg4` | 77 | MPEG-4 video |
| `jpeg` | 74 | JPEG frame |
| `audio` | 65 | Audio |
| `status` | 83 | Status update |
| `quit` | 81 | Server closing stream |

**Video packet `subtype` values:**

| subtype | byte | description |
|---------|------|-------------|
| `H` | 72 | Stream description — also sets `pck.width`, `pck.height`, `pck.fps` |
| `S` | 83 | SPS/PPS codec parameters — `pck.data` contains init bytes with startcodes |
| `I` | 73 | Key frame (I-frame) |
| `P` | 80 | Inter-frame (P/B-frame) |

## Control channel commands

**Server control (`CMDecoder.Control`):**
```js
ctrl.wsseLogin(username, digest, nonce, created)
ctrl.forceRecord(cameraId, true|false)
ctrl.ackAlarm(cameraId)
ctrl.ptzPreset(cameraId, presetId)
ctrl.ptzArea(cameraId, x0, y0, x1, y1, w, h)
ctrl.ptzZoom(cameraId, level)
```

**Record control (`CMDecoder.Record.Control`):**
```js
ctrl.createPlayer()                        // → emits 'id' with playerId
ctrl.init(barName, cameraId, start, end, barSize, current)
ctrl.playForward()   ctrl.playBackward()   ctrl.stop()
ctrl.goto(position)  ctrl.time(timestamp) ctrl.step(n)
ctrl.freq(frequency)
```

## Events

| Event | Emitter | Payload |
|-------|---------|---------|
| `packet` | Live / Record.Video | `{ type, name, subtype, data, time, tvSet, tvUset, width?, height?, fps? }` |
| `send` | all decoders | outgoing bytes to forward to the WebSocket |
| `id` | Record.Control | `[playerId]` |
| `load` | Record.Control | timeline data |
| `time` | Record.Control | `[position]` |
| `login` | Control | login result |
| `event` | Control | `[eventName, cameraId, …args]` |

## Dependencies

`event-emitter-es6`, `buffer`, `wsse`, `ws` (Node.js only), `atob`
