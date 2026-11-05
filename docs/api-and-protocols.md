# API & Protocols

## CamTrace HTTP API v1.2

### Version discovery

```
GET /api/
```
Returns server API version. Response `Date` header is used for WSSE clock drift compensation.
Supported: v1.2. Versions v1 and v1.1 are rejected.
The client requires a 2xx status and a JSON body with `versions.latest`; anything else is an
`ApiError` (`HTTP_ERROR` / `BAD_RESPONSE`, see `troubleshooting.md`).

### Choosing the method

`GET /api/v1.2/users/{username}/auth` (no auth) lists the methods offered for the user, in the
server's order: `{ auth: [{ type: "basic" }, { type: "wsse", salt: "$2a$…" }] }`. A server with
an LDAP directory (17.1) lists `basic` first for every user: its directory accounts can only use
HTTP Basic, its local accounts can still use WSSE. `cm.authenticate({ user, pass, cryptpass })`
uses WSSE with a stored `cryptpass` alone; with the password, the first method it can use in
that order — `basic` over HTTPS when `GET /users/login` announces
`capabilities.webSocket.basicProtocol: true` (API revision 1.2-48), `wsse` when a salt is given.

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
- `timeShift = localDate − serverDate` (from the HTTP `Date` header of the discovery request)
- The server refuses a token created more than 2 s in its future or more than 10 s in its past
- On 401: recalculate from the response `Date`; retry once when the offset differs by more than 1 s from the one the request was signed with
- After a WebSocket that could not be opened (`noteStreamFailure()`) or a return from the background (`noteResume()`): the next service URL is built after reading the server clock again (`resyncClock()`)
- From 17.1, after a refused credential the server refuses every credential of that name from that address for 10 s: a retry sent sooner is refused whatever it carries

### Authentication (HTTP Basic)

HTTP API requests carry `Authorization: Basic <Base64 of user:password in UTF-8>`. The server
checks a user and password once a minute, whatever the number of requests and WebSockets
carrying them; no clock is involved.

A page cannot set `Authorization` on a WebSocket: it offers the credentials as subprotocols,
over HTTPS only (API revision 1.2-48):
```js
new WebSocket(url, ['camtrace', 'camtrace-basic.' + base64url('user:password')])
// base64url: '-' and '_', no '=' padding — exactly these two entries, in this order
// the server answers Sec-WebSocket-Protocol: camtrace
```
`url` keeps its viewer parameters (`_mobile`, `_accept`) and carries no WSSE parameter: any
other shape is refused with `400`. A refused WebSocket gives JavaScript no status; with a wrong
password the stream socket opens then closes without data, and the control channel answers
`nologin`. `cm.webSocketProtocols()` returns the list after an HTTP Basic login.

### Endpoint reference

All paths prefixed with `/api/v1.2`. All require authentication (WSSE or HTTP Basic).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Version discovery (no auth) |
| GET | `/users/{username}/auth` | Authentication methods offered, WSSE salt (no auth) |
| GET | `/users/login` | Login → services, permissions, capabilities |
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

WebSocket URLs are built from the `/users/login` response; with WSSE they carry the
credentials as query params:
```
wss://host:port/path?_username=…&_password=…&_nonce=…&_created_at=…[&extra_params]
```
With HTTP Basic they carry none: the credentials go in the subprotocols (see above).

Use `@camtrace/api` URL builders, opened with `cm.webSocketProtocols()` — the
`@camtrace/streaming` services do both.

### Control channel (text, newline-delimited)

**URL:** `cm.buildControlUrl()` → `wss://…/control?…`

**Initial handshake (sent by `CMDecoder.Control` after connect):**
```
Client → Server: "login wsse <username> <digest> <nonce> <created_at>"
Server → Client: "login <status>"
```
With HTTP Basic the opening already authenticated the channel; the historic line
`login <username> -` (user and digest ignored) only reads the verdict: `OK`, or `nologin`.

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

> `CMDecoder.Control` sends these commands 150 ms apart.

### Live video stream (binary)

**URL:** `cm.buildLiveCameraUrl(streamUrl, accept?, type?, compr?)` → `wss://…/live/view?id=…&_accept=v1b&…`

**`accept` is a protocol variant, not a MIME type.** The server rewrites `_accept=<value>` into an `Accept: application/vnd.camtrace.<value>` header and uses it to decide what the client can receive: `v1` = base, `v1a` = +audio, `v1b` = +H265, `v1c` = +analytics metadata. Any unknown value (a MIME type such as `video/h264`, for instance) downgrades the connection to `v1`: an H265 camera then sends **no video packet at all** and the stream stays silent. Use `cm.streamProtocol()` — the variant returned at login in `services.mobile.stream_protocol` — or omit the argument when using `@camtrace/streaming`, which fills it in for you.

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

### Record playback control (text)

**URL:** `cm.buildReplayCameraControlUrl(cameraId)` → `wss://…/player/control?id=<cameraId>&…`

On open the server sends one line, `capabilities <words…>` (`capabilities autojump automove timems`, and `keyseek` from server 17.1). Send **one command per WebSocket message, without a trailing `\0`**: the server ends each of its own messages with a `\0` and stops reading at an empty command, so a command that arrives in the same read as the previous one is lost when the client adds its own `\0`. `CMDecoder.Record.Control` sends this way; the server control channel (`CMDecoder.Control`) keeps its queue.

**Initialization sequence** (order matters):
```
Server → capabilities autojump automove timems keyseek
Client → CTL                            # create player
Server → id <playerId>                  # player ID — the video channel URL is now known
(Client → open video channel)           # optional here, required before any play command
Server → load <data>                    # readiness signal — wait for it before sending init
Client → init <barName> <cameraId> <startSec> <endSec> <barSize> <currentMs>
Server → span <startSec> <endSec>       # the window of the bars that follow
Server → bar <type> <seq> <charStr>     # burst: timeline bars for ALL types (regul, alarm, …)
Server → init <data>                    # init acknowledgement
Server → rfreq 1000
Server → [video channel] the frames up to currentMs, then the image at currentMs
```

Notes:
- Do **not** send `type` during initialization — `barName` is already the first argument of `init`. `type` would trigger a second decoder initialization on the video channel.
- Wait for the `load` event before sending `init` (with a ~2 s fallback timeout for servers that don't send it).
- After the preview burst the server may **close the video channel**. Reopen it with the same `playerId` before the next play command.
- `init` can be sent again on the same player to move or resize the window (no need to reopen the channels): the server answers with the same burst and seeks to `currentMs`; playback goes on.
- The window bounds playback: a seek before its start fails, and by default (`automove off`) playback pauses at its edge. Send a new `init` before the position leaves it.

**Units:** `startSec`/`endSec` are Unix seconds; `currentMs` is Unix **milliseconds**; `goto` positions are bar units (`0..barSize-1`).

**Commands:**
```
CTL                                      # create player → server replies with "id <playerId>"
init <barName> <cameraId> <startSec> <endSec> <barSize> <currentMs>
type <barName> <currentMs>               # switch displayed bar type (see note below)
play forw                                # play forward
play back                                # play backward
play next / play prev                    # step one frame (video channel open, playback stopped)
play stop                                # stop
goto <position> [key [start|nearest]]    # seek to bar unit (0..barSize-1)
time <unixSec> [key [start|nearest]]     # seek to a Unix time in seconds (a value in ms is rejected)
timems <unixMs> [key [start|nearest]]    # seek to a Unix time in milliseconds (when listed in capabilities)
step <n>                                 # play one key frame out of n (see below) — not a navigation command
freq <f>                                 # playback speed × 1000 (rfreq is always 1000: 1000 = 1×)
autojump on|off / automove on|off        # automove: the window moves by its length at its edge (default off: pause)
sync [0|1]                               # enable/disable sync
```

**Every positioning command is an exact seek** (`goto`, `time`, `timems`, `type`, `init`): the server goes back to the previous key frame and sends the frames up to the target with a zero timestamp (needed to decode it), then the target frame. A player that displays only timestamped frames shows the target image alone; displayed, the zero-timestamp frames replay up to a GOP in a fast burst at every seek (`@camtrace/web-video-decoder` currently renders every decoded frame). With `step <n>` (n ≥ 2), forward playback jumps n key frames at a time and waits for the time they cover at the current speed: one image every n GOPs.

**Keyframe seeks** (servers that list `keyseek` in their capabilities): `goto`, `time` and `timems` followed by `key` (or `key start`) send one picture, the key frame opening the group of pictures the position falls in; followed by `key nearest`, the key frame nearest to the position (the one before it at equal distance). No zero-timestamp frames: a fraction of the exact seek's time and bytes, for a cursor being dragged (send an exact seek where it is released). The key frame stays within the window and the account's playback window: when the one before the position is outside them (or across a gap in the recording), the one after it is sent, and with neither inside them the seek is exact. The player then stands on that key frame. The answer is that of an exact seek: `play stop <ms>`, `flush`, the frame, then its `image` status, at the key frame's time. An older server ignores the `key` form and sends no image: send it only where `keyseek` is listed.

**Seeks read back to back** (servers that list `keyseek`): of the seeks (`goto`, `time`, `timems`) the server reads in one go, only the last one runs. Two seeks sent in a row may thus get a single answer. Any other command between them keeps both (an unchanged `step <n>` does nothing else).

**Events:**
```
capabilities <words…>            # once, when the channel opens
id <playerId>                    # player ID for the video channel URL
load <data>                      # readiness signal (see initialization sequence)
span <startSec> <endSec>         # window of the bars that follow (every init)
bar <type> <seq> <charStr>       # timeline data — payload [type, seq, charStr]
init <data>                      # init acknowledgement
rfreq <freq>                     # always 1000 on current servers
```
Current servers send no `time`, `step` or `play` line on this channel (`CMDecoder.Record.Control` would emit them): the playback position and state come from the `status` packets of the video channel.

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

**URL:** `cm.buildReplayCameraVideoUrl(playerId, accept?)` → `wss://…/player/video?id=<playerId>&…`

Uses the same binary protocol as the live stream (identical packet types and framing).

**Status packets — the position source:** packets with `name: 'status'` carry the text `"image 0 <unixMs> <bytes> 0 0"` for each displayed frame. `parseInt(parts[2])` is its position in Unix **milliseconds**. Other statuses: `play forw|back|stop <unixMs>` (playback state), `flush`, and `nodata` in a gap. At the end of what is recorded (shortly before now) the server sends nothing more. The control channel sends no position.

**Preview frames:** right after `init`, the server pushes a burst of non-timestamped frames on the video channel as an automatic preview, then may close the channel (reopen it with the same `playerId` to play).
