# Troubleshooting

## Connection issues

### Reading `@camtrace/api` errors

`loadApis()`, `authenticate()`, `simpleLogin()`, `login()`, `basicLogin()` and `getCryptPass()` reject with an `ApiError`
whose `code` tells the cause (`err.httpStatus` and `err.cause` carry the details):

| `err.code` | Cause | What to check |
|---|---|---|
| `NETWORK` | DNS, connection refused, TLS error, offline — or a server without CORS headers (the browser hides the answer). In a browser, also a refused certificate: browsers do not tell why a request failed | Host / port / SSL, firewall, CORS on the server; over HTTPS the certificate, see [Self-signed certificate](#self-signed-certificate-ct-server-171) |
| `CERTIFICATE` | Node only: the server's certificate was refused — self-signed, unknown authority, expired, or not issued for this host or IP (the TLS code is in `err.message`) | See [Self-signed certificate](#self-signed-certificate-ct-server-171) |
| `TIMEOUT` | No answer within 15 s (`loadApis(…, { timeout })` to change it), or a network failure after 10 s or more | Filtered IP, captive portal, VPN |
| `BAD_RESPONSE` | `GET /api/` returned something that is not the discovery JSON | Wrong port (another web server answers), reverse proxy, captive portal |
| `HTTP_ERROR` | `GET /api/` returned a non-2xx status | Server-side error, path rewriting |
| `VERSION_TOO_OLD` | Server API v1 / v1.1 | The server must be **v1.2 or later** |
| `VERSION_UNSUPPORTED` | Unknown API version | Verify the host really is a CamTrace server |
| `AUTH_FAILED` | HTTP 401 (after the clock-drift retry, with WSSE); `err.authMethod` is the method refused | User name / password; see below |
| `AUTH_LOCKED` | HTTP 429 (server 17.1): too many failed logins for this user or from this address; the password was not checked | Wait: every login is refused the same way until the server releases its brake (no waiting time is told); do not retry in a loop |
| `AUTH_UNAVAILABLE` | HTTP 503 (server 17.1): the password was not checked — the user's directory could not be reached, or the server's authentication service did not answer in time or failed | Directory, network or load on the server side; try again later |
| `AUTH_HTTP` | Other HTTP status during authentication | Server logs |
| `AUTH_CONFIG` | No password given, no WSSE salt for this user (or hashing failed), or no method this client can use (`authenticate()`) | `err.authMethods` without `wsse`: the account requires HTTP Basic, which needs HTTPS; `err.basicWebSocket === false`: see below |

### Self-signed certificate (CT-Server 17.1)

From 17.1 a CT-Server only answers over HTTPS (HTTP is redirected to it), and a fresh install uses a
self-signed certificate. It names the server's host name, `localhost` and its IP addresses, and the server
makes a new one when they change. Neither a browser nor Node trusts it: the first request, the discovery
(`loadApis()`), fails before reaching the server. Every error of `loadApis()` carries the discovery URL in
`err.url` (e.g. `https://192.168.1.100:443/api/`).

- **In a browser**, the request fails like an unreachable server: `NETWORK`, with the browser's own text
  (Chrome `Failed to fetch`, Firefox `NetworkError when attempting to fetch resource.`, Safari `Load failed`).
  Open `err.url` in the same browser and accept the warning (Chrome: *Advanced → Proceed*; Firefox:
  *Advanced → Accept the Risk and Continue*; Safari: *Show Details → visit this website*): the page then shows
  the API versions. The API and the WebSockets use the same host and port, so this one acceptance covers both,
  and the page that failed needs no reload: call `loadApis()` again. The demo does so — it shows the link and
  tries the discovery again every 2 s. How long the acceptance lasts depends on the browser (Firefox keeps it
  until it is removed under *Settings → Privacy & Security → Certificates → View Certificates → Servers*).
- **For a lasting setup**, trust the server's certificate in the operating system (macOS Keychain, Windows
  certificate store; Firefox has its own store). Its names include the IP addresses, so connecting by IP works.
  Do it again when the server makes a new certificate (new host name or IP). To save it:
  `openssl s_client -connect <host>:443 </dev/null | openssl x509 > ct-server.pem`.
- **In Node**, the error is `CERTIFICATE`, its message carries the TLS code (`DEPTH_ZERO_SELF_SIGNED_CERT`,
  `ERR_TLS_CERT_ALTNAME_INVALID`…). Start Node with `NODE_EXTRA_CA_CERTS=ct-server.pem`: `fetch`, the HTTP
  requests and the `ws` WebSockets then accept that certificate. Avoid `NODE_TLS_REJECT_UNAUTHORIZED=0`, which
  accepts any certificate for the whole process.
- **Over HTTP**, the discovery is redirected to HTTPS: it then fails on the certificate (`NETWORK`), or it
  succeeds and the login fails — e.g. `AUTH_CONFIG` with `err.authMethods` `['basic']`, HTTP Basic being only
  used over HTTPS. Connect with `ssl = true` on port 443.

### `AUTH_FAILED` (401 Unauthorized)

Authentication failed. Possible causes:
- Wrong username or password (with HTTP Basic, `err.authMethod === 'basic'`, the refusal is never retried with WSSE)
- The client's clock moved since the connection — `@camtrace/api` measures the offset with the server at discovery and measures it again on a 401 (one retry when it differs by more than 1 s from the offset the request was signed with). The server only accepts tokens created at most 2 s in its future and 10 s in its past, so keep both clocks synchronized (NTP). From 17.1, a refused credential also makes the server refuse every credential of that name from that address for the next 10 s, so a retry needs to wait that long. On servers that do not expose the `Date` header to the browser (CORS), no compensation is possible.
- An account that requires HTTP Basic (e.g. an LDAP directory account), logged in with WSSE: the server lists `basic` (`err.authMethods`). With a stored `cryptpass`, ask for the password again and call `authenticate({ user, pass })`: the account may have moved to the directory, or its password changed. Over HTTP, HTTP Basic is not used: the account needs an HTTPS connection.
- `err.basicWebSocket === false`: the server accepted HTTP Basic on the API but does not take it on WebSockets — a server older than API revision 1.2-48, or HTTPS ended by a proxy in front of the server, which then reaches it over HTTP. The password is right; the account cannot be used by this client on that server.
- Calling `login(user, cryptpass)` with a plain-text password instead of the BCrypt hash — use `authenticate({ user, pass })` or `simpleLogin(user, plaintext)`, or call `getCryptPass()` first.

### WebSocket connection fails immediately

- Verify the URL built by `buildLiveCameraUrl()` (log it before opening the WebSocket).
- After an HTTP Basic login, open it with `new WebSocket(url, cm.webSocketProtocols())` (the `@camtrace/streaming` services do): the URL carries no credentials. A proxy in front of the server must pass the `Sec-WebSocket-Protocol` header through.
- Confirm the server is reachable from the browser (no firewall blocking WebSocket ports).
- With a self-signed certificate, the browser refuses the WebSockets as it refuses the discovery: accept it first, see [Self-signed certificate](#self-signed-certificate-ct-server-171).

---

## WASM decoder issues

### `SharedArrayBuffer is not defined`

The page is not served with the required COOP/COEP headers. Add:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

In webpack dev-server:
```js
devServer: {
  headers: {
    'Cross-Origin-Opener-Policy':   'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp'
  }
}
```

In Vite:
```js
server: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } }
```

### Worker or WASM file not found (404)

The `@camtrace/web-video-decoder` package uses `new URL('./worker.js', import.meta.url)` patterns that webpack 5 and Vite detect statically and emit as separate chunks. This requires:
1. The package is **not pre-bundled** — webpack must process its source directly.
2. The `babel-loader` `exclude` rule is inverted for this package:
```js
exclude: { and: [/node_modules/], not: [/web-video-decoder/] }
```
3. `resolve.symlinks: false` is set (required when using npm workspace symlinks).

### Black canvas, no errors

The decoder received packets but nothing appears. Check:
- `decoder.on('decodeddata', …)` is registered **before** calling `sendPacket()`.
- The canvas `width` and `height` match the stream dimensions (use the `H` description packet's values, or the `formatedStreams` dimensions from the camera object).
- The stream is actually delivering H.264/H.265 (not JPEG-only). JPEG packets (`pck.name === 'jpeg'`) are not decoded by WebDecoder — render them directly with `drawImage()`.

---

## Stream issues

### No `packet` events after connecting

- **H265 camera, and the same code works on H264 cameras?** You are almost certainly sending a wrong `_accept` value. It is a CamTrace protocol variant (`v1` base, `v1a` +audio, `v1b` +H265), **not a MIME type** — an unrecognised value such as `'video/h264'` downgrades the connection to `v1`, and an H265 camera then sends no video packet at all: the WebSocket opens, stays open, and nothing arrives. Omit the argument (`@camtrace/streaming` fills in the right variant) or pass `cm.streamProtocol()` when building URLs yourself. Verify in DevTools → Network → WS: the stream URL must carry `_accept=v1b`.
- The live service connects but the server may not be sending. Verify the stream URL includes a valid `id` parameter (stream ID from `cam.formatedStreams.hd.url`).
- The keep-alive ping (every 30s) is sent automatically by `SimpleService`. If the stream silently closes, check for `close` events on the service.

### Video breaks after enabling the right protocol variant

`v1b` carries more than H265: the same WebSocket also delivers **audio** packets and analytics metadata. The audio description subtype (83) has the same value as the video SPS/PPS subtype, so a consumer that dispatches on `pck.subtype` alone will feed audio into the video decoder and corrupt streams that used to work.

Always filter on `pck.name` first:
```js
if (pck.name === 'status') return
if (pck.name === 'jpeg')   { /* drawImage */ return }
if (!['h264', 'h265', 'mpeg4'].includes(pck.name)) return   // audio, metadata…
decoder.sendPacket(pck, canvas.width, canvas.height, true)
```
`@camtrace/web-video-decoder` applies this filter internally; a custom or native decoder must do it explicitly.

### Stream stops after ~30 seconds

The server disconnects when no activity is detected. `SimpleService` sends a keep-alive ping automatically — if you created the WebSocket manually (without `@camtrace/streaming`), add a ping every 30s:
```js
setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(new Uint8Array([0])) }, 30000)
```

### Record playback: video channel never opens

The video WebSocket URL depends on the `playerId` sent by the server after `createPlayer()`. If the `id` event is never emitted, check:
- The control WebSocket is connected and open before calling `createPlayer()`.
- `ctrlService.cmDecoder.on('id', …)` is registered before `createPlayer()`.
- No error in the server logs related to the camera ID or replay availability.

---

## Module resolution issues

### `Cannot find module '@camtrace/api'`

The package is installed but the bundler cannot find it. Run `npm install` in your app directory. If using workspace symlinks, set `resolve.symlinks: false` in webpack.

### `@camtrace/streaming` imports fail with `Module not found`

`@camtrace/streaming` imports `@camtrace/api` and `@camtrace/decoder` transitively. With workspace symlinks and webpack, set `resolve.symlinks: false` so the resolution stays relative to your app's `node_modules/` rather than the symlink target's real path.
