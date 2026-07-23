# @camtrace/api

HTTP client for the CamTrace REST API v1.2. Handles server discovery, WSSE authentication, camera enumeration, and WebSocket service URL construction.

## Quickstart

```js
import CamtraceApi from '@camtrace/api'

// 1. Connect to the server (version check + clock sync)
const cm = await CamtraceApi.loadApis('192.168.1.100', 443, true)

// 2. Log in (fetches BCrypt salt, hashes password, returns services + permissions)
await cm.simpleLogin('admin', 'plaintext_password')

// 3. List cameras
const cameras = await cm.cameras()
const cam = cameras[0]
// cam.formatedStreams → { hd, md, ld } each: { url, encoding, width, height }

// 4. Build a live stream WebSocket URL (includes WSSE auth params)
const liveUrl = await cm.buildLiveCameraUrl(cam.formatedStreams.hd.url, 'video/h264')
// → "wss://192.168.1.100:443/live/view?id=1.1&accept=video%2Fh264&_username=…"
```

## API Reference

### `CamtraceApi.loadApis(host, port, ssl, [appVersion])`

Discovers the server API version and returns a `CMInterface` instance.

- Calls `GET /api/` — rejects servers older than v1.2
- Calculates clock drift (`timeShift`) for WSSE timestamp accuracy
- `appVersion` is forwarded as `_mobile` query param on service URLs (optional, pass your app version string)

### `CMInterface`

#### Authentication

| Method | Description |
|--------|-------------|
| `simpleLogin(user, plaintext)` | Fetches BCrypt salt, hashes password, calls `login()` |
| `login(user, cryptpass)` | WSSE login → returns `{ services, permissions }` |
| `getCryptPass(user, plaintext)` | Returns BCrypt hash without logging in |
| `buildAuth()` | Returns current WSSE token `{ username, digest, nonce, date }` |

#### Cameras

| Method | Description |
|--------|-------------|
| `cameras()` | `GET /cameras` — returns array with `formatedStreams: {hd,md,ld}` |
| `camera(id)` | `GET /cameras/{id}` |
| `cameraImageRef(id)` | `GET /cameras/{id}/ref.jpg` → `ObjectURL` |
| `alarms()` / `cameraAlarms(id)` | `GET /cameras/alarms` |
| `takeSnapshot(cameraId, time)` | `POST /snapshots` |
| `protectRecord(cameraId, from, to, comment, type)` | `POST /precords` |

#### WebSocket URL Builders

These methods return fully-authenticated WebSocket URLs ready to pass to `new WebSocket()`.

| Method | Description |
|--------|-------------|
| `buildLiveCameraUrl(streamUrl, accept?, type?, compr?)` | Live stream URL |
| `buildGroupLiveCameraUrl(cameraIds[], accept?, compr?, vw?, vh?)` | Mosaic live URL |
| `buildReplayCameraControlUrl(cameraId)` | Record control channel URL |
| `buildReplayCameraVideoUrl(playerId, accept?)` | Record video channel URL |
| `buildControlUrl()` | Main server control channel URL |

#### Other endpoints

| Method | Description |
|--------|-------------|
| `groups()` / `group(id)` | Camera groups |
| `extUrls()` / `extUrl(id)` / `triggerExtUrl(id)` | External URLs |
| `license()` / `sysinfo()` / `health()` | Server status |

## Authentication — WSSE

CamTrace uses WSSE UsernameToken authentication. HTTP requests use `Authorization` and `X-WSSE` headers; WebSocket URLs embed equivalent parameters as query strings (`_username`, `_password`, `_nonce`, `_created_at`).

**Password derivation:**
```
1. GET /api/v1.2/users/{username}/auth  →  salt (BCrypt, e.g. "$2a$10$…")
2. cryptpass = bcryptjs.hash(plaintext, salt)   // store for future sessions
3. Per-request digest = sha1(nonce + created_at + cryptpass)
```

**Clock drift:** The server `Date` header on the first response is used to compute `timeShift = serverTime − localTime`, applied to all WSSE `Created` timestamps. A 401 response triggers an automatic recalculation and retry.

## Dependencies

`axios`, `bcryptjs`, `wsse`, `es6-promise`, `isomorphic-fetch`
