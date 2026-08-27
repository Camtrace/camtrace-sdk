# Troubleshooting

## Connection issues

### `loadApis()` throws "Server API version too old"

The CamTrace server must be **v1.2 or later**. Versions v1 and v1.1 are not supported. Check your server version in its admin interface.

### `loadApis()` throws "Not compatible version (API version error)"

The server responded with an unrecognized API version. Verify the host, port, and SSL settings match the server configuration.

### 401 Unauthorized

WSSE authentication failed. Possible causes:
- Wrong username or password
- The server's clock and the client's clock differ by more than a few minutes — `@camtrace/api` compensates automatically on the first request but may fail before that. Ensure both clocks are synchronized (NTP).
- Calling `login(user, cryptpass)` with a plain-text password instead of the BCrypt hash — use `simpleLogin(user, plaintext)` or call `getCryptPass()` first.

### WebSocket connection fails immediately

- Verify the URL built by `buildLiveCameraUrl()` (log it before opening the WebSocket).
- Confirm the server is reachable from the browser (no firewall blocking WebSocket ports).
- If using self-signed certificates, the browser will block the connection. Accept the certificate manually by navigating to the server URL directly in the browser first.

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
