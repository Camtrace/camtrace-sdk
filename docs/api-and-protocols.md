# API & Protocols

## CamTrace HTTP API v1.2

### Version discovery

```
GET /api/
```
Returns server API version. Response `Date` header is used for WSSE clock drift compensation.
Supported: v1.2. Versions v1 and v1.1 are rejected.

### Authentication (WSSE)

HTTP API requests use headers:
```
Authorization: WSSE profile="UsernameToken"
X-WSSE: UsernameToken Username="<user>", PasswordDigest="<digest>", Nonce="<nonce>", Created="<iso8601>"
```

WebSocket service URLs use equivalent query parameters: `_username`, `_password`, `_nonce`, `_created_at`.

**Password flow:**
```
1. GET /api/v1.2/users/{username}/auth
   → { auth: [{ type: "wsse", salt: "$2a$…" }] }

2. cryptpass = bcryptjs.hash(plaintext_password, salt)
   → store for future sessions (no need to re-hash)

3. Per-request:
   token  = new WSSE.UsernameToken({ username, password: cryptpass })
   digest = token.getPasswordDigest()   // sha1(nonce + created_at + cryptpass)
   nonce  = token._nonce
   date   = token.getCreated()          // adjusted by timeShift
```

**Clock drift handling:**
- `timeShift = serverDate − localDate` (from HTTP `Date` header on first request)
- On 401: recalculate from response `Date`, retry once

### Endpoint reference

All paths prefixed with `/api/v1.2`. All require WSSE authentication.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Version discovery (no auth) |
| GET | `/users/{username}/auth` | Get BCrypt salt (no auth) |
| GET | `/users/login` | Login → services + permissions |
| GET | `/cameras` | Camera list with stream info |
| GET | `/cameras/{id}` | Camera detail |
| GET | `/cameras/{id}/ref.jpg` | Camera thumbnail (Blob) |
| GET | `/cameras/alarms` | All alarms |
| GET | `/cameras/{id}/alarms` | Camera alarms |
| GET | `/cameras/alarms/{id}.jpg` | Alarm snapshot (Blob) |
| GET | `/groups` | Group list |
| GET | `/groups/{id}` | Group detail |
| GET | `/exturls` | External URL list |
| GET | `/exturls/{id}/trigger` | Trigger action |
| GET | `/license` | License info |
| GET | `/sysinfo` | System info (CPU, RAM, disk) |
| GET | `/health` | Health status |
| POST | `/snapshots` | Create snapshot |
| PUT | `/snapshots/{id}` | Update snapshot comment |
| GET | `/snapshots/{id}.jpg` | Snapshot image (Blob) |
| POST | `/precords` | Protect a recording |

**Camera `formatedStreams`:**
Each camera object from `GET /cameras` includes a `formatedStreams` property:
```json
{
  "hd": { "url": "1.1", "encoding": "H264", "width": 1920, "height": 1080 },
  "md": { "url": "1.2", "encoding": "H264", "width": 1280, "height": 720  },
  "ld": { "url": "1.3", "encoding": "H264", "width": 640,  "height": 360  }
}
```
Pass `stream.url` to `cm.buildLiveCameraUrl()`.

---

## WebSocket Protocols

### Service URL construction

WebSocket URLs are built from the `/users/login` response plus WSSE auth as query params:
```
wss://host:port/path?_username=…&_password=…&_nonce=…&_created_at=…[&extra_params]
```

Use `@camtrace/api` URL builders — they handle auth injection automatically.

### Control channel (text, newline-delimited)

**URL:** `cm.buildControlUrl()` → `wss://…/control?…`

**Initial handshake (sent by `CMDecoder.Control` after connect):**
```
Client → Server: "login wsse <username> <digest> <nonce> <created_at>"
Server → Client: "login <status>"
```

**Commands (client → server):**
```
force [+|-]<cameraId>                               # force/stop recording
acquit <cameraId>                                   # acknowledge alarm
ptzd preset <cameraId> <presetId>                   # go to PTZ preset
ptzd area <cameraId> <x0> <y0> <x1> <y1> <w> <h>   # area zoom
ptzd center <cameraId> <x> <y> <w> <h>              # center on point
ptzd ptz <cameraId> <direction>                     # PTZ direction move
ptzd zoom <cameraId> <level>                        # set zoom level
ptzd guardtour <cameraId> <active>_<tourId>
ptzd tourstart <cameraId> <tourId>
ptzd tourstop <cameraId>
```

**Events (server → client):**
```
login <status>
status <camera_status_data>
presets-updated <cameraId> [args]
tours-updated <cameraId> [args]
activetour-updated <cameraId> [args]
```

> Commands are rate-limited to 150ms apart internally by `CMDecoder`.

### Live video stream (binary)

**URL:** `cm.buildLiveCameraUrl(streamUrl, accept?, type?, compr?)` → `wss://…/live/view?id=…&accept=video/h264&…`

**Mosaic (multiple cameras):** `cm.buildGroupLiveCameraUrl(cameraIds[], …)` → `wss://…/live/mosaic?ids=1,2,3&…`

**Binary framing:**
```
[1B type][4B length (big-endian)][payload…]
```

**Packet types (`pck.name`):**

| name | byte | video header? |
|------|------|---------------|
| `h264` | 72 | yes (9B) |
| `h265` | 53 | yes (9B) |
| `mpeg4` | 77 | yes (9B) |
| `jpeg` | 74 | no |
| `audio` | 65 | no |
| `status` | 83 | no |
| `quit` | 81 | no |

**Video header (H264/H265/MPEG4):**
```
[1B subtype][4B tvSet (seconds)][4B tvUset (microseconds)][NAL data…]
```

**Subtypes (`pck.subtype`):**

| subtype | byte | payload |
|---------|------|---------|
| `H` | 72 | Stream description — `pck.width`, `pck.height`, `pck.fps` |
| `S` | 83 | SPS/PPS init params (custom base46 encoding, decoded by `@camtrace/decoder`) |
| `I` | 73 | I-frame (key frame) — `pck.data` contains NAL unit with startcode |
| `P` | 80 | P/B-frame — `pck.data` contains NAL unit |

**Stream init sequence:**
```
1. Server sends H (description): width, height, fps
2. Server sends S (SPS/PPS): codec init params
3. Server sends I (key frame): first decodable frame
4. Server sends P (inter frames): ongoing stream
   … periodic I-frames for recovery
```

**Timestamps:** `time_us = tvSet × 1 000 000 + tvUset`

**Base46:** CamTrace uses a custom base64-like encoding for SPS/PPS. `@camtrace/decoder` decodes it transparently — `pck.data` always contains ready-to-use NAL units.

### Record playback control (text, null-byte-delimited)

**URL:** `cm.buildReplayCameraControlUrl(cameraId)` → `wss://…/record/control?id=<cameraId>&…`

**Initialization sequence** (order matters):
```
Client → CTL\0                          # create player
Server → id <playerId>\0                # player ID — the video channel URL is now known
(Client → open video channel)           # optional here, required before any play command
Server → load <data>\0                  # readiness signal — wait for it before sending init
Client → init <barName> <cameraId> <startSec> <endSec> <barSize> <currentMs>\0
Server → init <data>\0                  # init acknowledgement
Server → bar <type> <seq> <charStr>\0   # burst: timeline bars for ALL types (regul, alarm, …)
Server → [video channel] non-timestamped preview frames
```

Notes:
- Do **not** send `type` during initialization — `barName` is already the first argument of `init`. `type` would trigger a second decoder initialization on the video channel.
- Wait for the `load` event before sending `init` (with a ~2 s fallback timeout for servers that don't send it).
- After the preview burst the server may **close the video channel**. Reopen it with the same `playerId` before the next play command.

**Units:** `startSec`/`endSec` are Unix seconds; `currentMs` is Unix **milliseconds**; `goto` positions are bar units (`0..barSize`).

**Commands:**
```
CTL                                      # create player → server replies with "id <playerId>"
init <barName> <cameraId> <startSec> <endSec> <barSize> <currentMs>
type <barName> <currentMs>               # switch displayed bar type (see note below)
play forw                                # play forward
play back                                # play backward
play next / play prev                    # step one frame (video channel open, playback stopped)
play stop                                # stop
goto <position>                          # seek to bar unit (0..barSize)
time <timestamp>                         # seek to Unix timestamp
step <n>                                 # frames per tick during playback (not a navigation command)
freq <f>                                 # playback rate in fps (UI speed × rfreq)
sync [0|1]                               # enable/disable sync
```

**Events:**
```
id <playerId>                    # player ID for the video channel URL
load <data>                      # readiness signal (see initialization sequence)
init <data>                      # init acknowledgement
bar <type> <seq> <charStr>       # timeline data — payload [type, seq, charStr]
time <unixSec>                   # current playback position (control channel)
play <forw|back|stop|next|prev>  # playback state confirmations
step <data>
span <data>
rfreq <freq>                     # real fps of the recording
```

**`bar` event encoding** — one character per bar position (`charStr.length === barSize`):

| Character | Meaning |
|-----------|---------|
| `\0` | No recording |
| `'A'` / `'a'` | Surveillance-zone marker — **not** a recording |
| `'r'` / `'R'` | Recording present (protected) |
| Any other non-null char | Recording present |

"Recording present" test (identical for `regul` and `alarm`):
`ch && ch !== 'A' && ch !== 'a' && ch.charCodeAt(0) > 0`

Bars for **all** types arrive in the burst following `init` — cache them per type; `type` does not re-send them.

**Switching bar type:** the `type` command switches the *preview* stream (the server sends a fresh decoder initialization + key frame on the video channel), but playback keeps using the type given at `init`. To switch the playback type, re-run the full initialization sequence with the new `barName`.

### Record video stream (binary)

**URL:** `cm.buildReplayCameraVideoUrl(playerId, accept?)` → `wss://…/record/video?id=<playerId>&…`

Uses the same binary protocol as the live stream (identical packet types and framing).

**Status packets — primary position source:** packets with `name: 'status'` carry the text `"image <flags> <unixMs>"`. `parseInt(parts[2]) / 1000` gives the current position in Unix **seconds**. Prefer this feed for driving a timeline cursor — the control channel `time` events are sent less systematically.

**Preview frames:** right after `init`, the server pushes a burst of non-timestamped frames on the video channel as an automatic preview, then may close the channel (reopen it with the same `playerId` to play).
