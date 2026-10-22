# @camtrace/api

HTTP client for the CamTrace REST API v1.2. Handles server discovery, authentication (WSSE, and HTTP Basic for the accounts that require it), camera enumeration, and WebSocket service URL construction.

## Quickstart

```js
import CamtraceApi from '@camtrace/api'

// 1. Connect to the server (version check + clock sync)
const cm = await CamtraceApi.loadApis('192.168.1.100', 443, true)

// 2. Log in: WSSE, or HTTP Basic when the server requires it (returns services + permissions)
const account = await cm.authenticate({ user: 'admin', pass: 'plaintext_password' })
// account.method === 'wsse': keep account.cryptpass for the next sessions, not the password
// account.method === 'basic': the password itself is needed for every session

// 3. List cameras
const cameras = await cm.cameras()
const cam = cameras[0]
// cam.formatedStreams → { hd, md, ld } each: { url, encoding, width, height }

// 4. Build a live stream WebSocket URL and open it
const liveUrl = await cm.buildLiveCameraUrl(cam.formatedStreams.hd.url, cm.streamProtocol())
// WSSE  → "wss://192.168.1.100:443/live/view?id=1.1&_accept=v1b&_username=…"
// Basic → no credentials in the URL, they go in the subprotocols
const ws = new WebSocket(liveUrl, cm.webSocketProtocols())   // undefined with WSSE
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

`loadApis()`, `authenticate()`, `simpleLogin()`, `login()`, `basicLogin()` and `getCryptPass()` reject with an `ApiError`:

```js
import CamtraceApi, { ApiError, ApiErrorCodes } from '@camtrace/api'

try {
  const cm = await CamtraceApi.loadApis(host, port, ssl)
  await cm.authenticate({ user, pass })
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
| `AUTH_FAILED` | auth | HTTP 401 (after the clock-drift retry, with WSSE): wrong user name or password. `err.authMethod` is the method refused (`'wsse'` or `'basic'`); `err.authMethods` lists the methods the server offers, when they could be read (see [Authentication](#authentication)) |
| `AUTH_LOCKED` | auth | HTTP 429 (server 17.1): too many failed logins for this user or from this address. The password was not checked; the server refuses every login the same way until its brake releases, and tells no waiting time. Do not retry automatically nor ask for the password again |
| `AUTH_UNAVAILABLE` | auth | HTTP 503 (server 17.1): the password was not checked — the user's directory could not be reached, or the server's authentication service did not answer in time or failed. A later attempt may succeed |
| `AUTH_HTTP` | auth | Other HTTP status during authentication (`err.httpStatus`) |
| `AUTH_CONFIG` | auth | No password given, the user has no WSSE salt on the server, the hash could not be computed, or `authenticate()` found no method it can use (`err.authMethods`, e.g. `['basic']` over HTTP) |

`authenticate()` also sets `err.basicWebSocket = false` when the server accepted HTTP Basic on
the API but does not take it on WebSockets (a server older than API revision 1.2-48, or HTTPS
ended by a proxy in front of the server): the password is right, yet the account cannot be used
by this client on this server.

`err.message` is always a readable English sentence. The other endpoints (`cameras()`,
`license()`…) reject with the raw axios error (`err.response.status` when the server answered).

### `CMInterface`

#### Authentication

| Method | Description |
|--------|-------------|
| `authenticate({ user, pass?, cryptpass? })` | Logs in with the method the server allows (see [Authentication](#authentication)) → the result of `login()` or `basicLogin()` |
| `simpleLogin(user, plaintext)` | Fetches BCrypt salt, hashes password, calls `login()` (WSSE only) |
| `login(user, cryptpass)` | WSSE login → `{ method: 'wsse', cryptpass, services, permissions, capabilities }` |
| `basicLogin(user, plaintext)` | HTTP Basic login → `{ method: 'basic', services, permissions, capabilities }` |
| `basicWebSocket()` | `true` when the server takes HTTP Basic on the WebSockets of this login (`capabilities.webSocket.basicProtocol`) |
| `authMethod()` | `'wsse'` or `'basic'`: the method of the last login |
| `webSocketProtocols()` | Subprotocols to open the service WebSockets with: the HTTP Basic credentials after `basicLogin()`, `undefined` with WSSE |
| `getCryptPass(user, plaintext)` | Returns BCrypt hash without logging in |
| `buildAuth()` | Returns current WSSE token `{ username, digest, nonce, date }` |
| `streamProtocol()` | Protocol variant to pass as `accept` on stream URLs (see below) |
| `noteStreamFailure()` | Tells the interface that a WebSocket built from it could not be opened: the next URL builder call reads the server clock again first |
| `noteResume()` | Tells the interface that the app is back from the background, where the device clock may have been set: the next URL builder call reads the server clock again first, so a reopened WebSocket carries a token the server accepts |
| `resyncClock()` | Reads the server clock again (`GET /api/`, no credentials); concurrent calls share one request, a failure keeps the current offset. Resolves to `{ ok, previous, timeShift, error? }` (offsets in ms) |

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

These methods return the WebSocket URLs to open with `new WebSocket(url, cm.webSocketProtocols())`. With WSSE the URL carries the credentials (a fresh token at each call); with HTTP Basic it carries none and the subprotocols do.

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

## Authentication

`GET /users/{name}/auth` lists the methods the server offers for a user, in the order it
prefers them. A server with an LDAP directory (17.1) lists `basic` first for every user: the
directory accounts can only log in with HTTP Basic, the local accounts still can with WSSE.

`authenticate({ user, pass, cryptpass })` picks the method from what you kept:

- `cryptpass` only (the hash of an earlier WSSE login): WSSE, the methods are not read;
- `pass`: the first method of the list this client can use, in the server's order — `basic`
  over HTTPS when the server also takes it on WebSockets (`capabilities.webSocket.basicProtocol`
  of `GET /users/login`, true over HTTPS from API revision 1.2-48), `wsse` when a salt is given.

Keep what the result asks for: `cryptpass` for `method: 'wsse'` (the password is no longer
needed), the password itself for `method: 'basic'`. A Basic refusal is never retried with WSSE.
When a WSSE login with a kept `cryptpass` fails with `AUTH_FAILED` and `err.authMethods`
includes `basic`, ask for the password again: the account may have moved to the directory, or
its password changed.

### WSSE

HTTP requests carry `Authorization` and `X-WSSE` headers; WebSocket URLs embed equivalent parameters as query strings (`_username`, `_password`, `_nonce`, `_created_at`).

**Password derivation:**
```
1. GET /api/v1.2/users/{username}/auth  →  salt (BCrypt, e.g. "$2a$10$…")
2. cryptpass = bcryptjs.hash(plaintext, salt)   // store for future sessions
3. Per-request digest = sha1(nonce + created_at + cryptpass)
```

**Clock drift:** The server refuses a WSSE token created more than 2 s in its future or more than 10 s in its past. The server `Date` header on the discovery response is used to compute `timeShift = localTime − serverTime`, applied to all WSSE `Created` timestamps. A 401 whose `Date` header gives an offset more than 1 s away from the one the request was signed with is retried once with the new offset (requests in flight when the clock moved are each retried); otherwise, or on a second 401, the call rejects with `ApiError` `AUTH_FAILED`. A WebSocket refusal gives JavaScript no status: report a failed open with `noteStreamFailure()`, and a return from the background with `noteResume()` (the `@camtrace/streaming` services do both), so that the next URL is built after reading the server clock again. Avoid refusals rather than retrying them: from 17.1, after a refused credential the server refuses every credential of that name from that address for 10 s, whatever comes, and each refusal it does check counts toward locking the account out of that address.

### HTTP Basic

HTTP requests carry `Authorization: Basic` (Base64 of `user:password` in UTF-8). A page cannot
set that header on a WebSocket, so the WebSockets offer the credentials as subprotocols:
`webSocketProtocols()` returns `['camtrace', 'camtrace-basic.' + base64url]` (Base64url of
`user:password`, without padding), exactly these two entries in this order; the server answers
the `camtrace` subprotocol. Over HTTPS only, and the service URLs keep their viewer parameters
(`_mobile`, `_accept`). The server checks a user and password once a minute whatever the number
of requests and WebSockets carrying them, and no clock is involved. A WebSocket refused by the
server gives JavaScript no status: to tell why, call the API with the same credentials.

## Dependencies

`axios`, `bcryptjs`, `wsse`, `es6-promise`, `isomorphic-fetch`
