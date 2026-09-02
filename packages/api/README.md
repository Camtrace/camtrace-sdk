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
const liveUrl = await cm.buildLiveCameraUrl(cam.formatedStreams.hd.url, cm.streamProtocol())
// → "wss://192.168.1.100:443/live/view?id=1.1&_accept=v1b&_username=…"
```

## API Reference

### `CamtraceApi.loadApis(host, port, ssl, [appVersion], [options])`

Discovers the server API version and returns a `CMInterface` instance.

- Calls `GET /api/` — rejects servers older than v1.2
- Calculates clock drift (`timeShift`) for WSSE timestamp accuracy
- `appVersion` is forwarded as `_mobile` query param on service URLs (optional, pass your app version string)
- `options.timeout` (ms, default 15000): abort delay of the discovery request, also used as the
  HTTP timeout of every request made by the returned `CMInterface`

### Errors

`loadApis()`, `simpleLogin()`, `login()` and `getCryptPass()` reject with an `ApiError`:

```js
import CamtraceApi, { ApiError, ApiErrorCodes } from '@camtrace/api'

try {
  const cm = await CamtraceApi.loadApis(host, port, ssl)
  await cm.simpleLogin(user, pass)
} catch (err) {
  if (err instanceof ApiError) {
    console.log(err.code, err.httpStatus, err.message)   // e.g. "AUTH_FAILED", 401, "Authentication failed…"
    console.log(err.cause)                               // original fetch / axios error
  }
}
```

| `err.code` | Raised by | Meaning |
|---|---|---|
| `NETWORK` | discovery, auth | DNS failure, connection refused, TLS error, offline (`err.cause` = fetch/axios error) |
| `TIMEOUT` | discovery, auth | No answer within the timeout, or the platform gave up on the connection after 10 s or more |
| `BAD_RESPONSE` | discovery | `GET /api/` did not return the expected JSON (wrong port, proxy, captive portal) |
| `HTTP_ERROR` | discovery | Non-2xx status on `GET /api/` (`err.httpStatus`) |
| `VERSION_TOO_OLD` | discovery | Server API v1 / v1.1 |
| `VERSION_UNSUPPORTED` | discovery | Unknown API version |
| `AUTH_FAILED` | auth | HTTP 401 after the clock-drift retry: wrong user name or password |
| `AUTH_HTTP` | auth | Other HTTP status during authentication (`err.httpStatus`) |
| `AUTH_CONFIG` | auth | The user has no WSSE salt on the server, or the hash could not be computed |

`err.message` is always a readable English sentence. The other endpoints (`cameras()`,
`license()`…) reject with the raw axios error (`err.response.status` when the server answered).

### `CMInterface`

#### Authentication

| Method | Description |
|--------|-------------|
| `simpleLogin(user, plaintext)` | Fetches BCrypt salt, hashes password, calls `login()` |
| `login(user, cryptpass)` | WSSE login → returns `{ services, permissions }` |
| `getCryptPass(user, plaintext)` | Returns BCrypt hash without logging in |
| `buildAuth()` | Returns current WSSE token `{ username, digest, nonce, date }` |
| `streamProtocol()` | Protocol variant to pass as `accept` on stream URLs (see below) |

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

The `accept` argument is a **CamTrace protocol variant, not a MIME type**. It is sent as `_accept=<value>` and rewritten by the server into `Accept: application/vnd.camtrace.<value>`: `v1` = base, `v1a` = +audio, `v1b` = +H265, `v1c` = +analytics metadata. An unknown value silently downgrades the connection to `v1`, and an H265 camera then sends no video packet at all. Always pass `cm.streamProtocol()` (the value the server returned at login in `services.mobile.stream_protocol`, `undefined` on servers predating the field).

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

**Clock drift:** The server `Date` header on the first response is used to compute `timeShift = serverTime − localTime`, applied to all WSSE `Created` timestamps. A 401 response triggers an automatic recalculation and retry; a second 401 rejects with `ApiError` `AUTH_FAILED`.

## Dependencies

`axios`, `bcryptjs`, `wsse`, `es6-promise`, `isomorphic-fetch`
