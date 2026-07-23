# CamTrace Integration Demo

Minimal vanilla JS application demonstrating the full CamTrace video streaming chain:
connection → authentication → live stream → record playback.

## Quick start

From the **repo root**, prepare the demo (builds shared packages, installs demo deps):

```bash
./build.sh demo
```

Then start the dev server:

```bash
cd apps/demo && npm run dev
# → http://localhost:8080
```

Enter your CamTrace server credentials in the login form. The app will list your cameras and let you watch live streams and recorded video.

## What it demonstrates

- **Login** — server discovery, WSSE authentication, camera list
- **Live stream** — H.264 decoding via WebAssembly (FFmpeg), HD/MD/LD quality selection
- **Record playback** — dual-WebSocket control+video sequence, play/pause/backward/seek/step/speed controls

## Packages used

| Package | Role |
|---------|------|
| `@camtrace/api` | HTTP client — authentication, camera list, WebSocket URL construction |
| `@camtrace/decoder` | Protocol parser — binary framing (NAL units), text commands |
| `@camtrace/streaming` | WebSocket lifecycle, keep-alive, `LivePlayer`/`PlaybackPlayer` façades |
| `@camtrace/web-video-decoder` | WASM decoder reference implementation (substitutable) |

> `@camtrace/web-video-decoder` is a generic FFmpeg-WASM decoder. You can replace it with any decoder that accepts the `packet` events emitted by `@camtrace/decoder` — WebCodecs, a native SDK, etc.

## Code examples

The `src/examples/` directory contains three standalone snippets you can copy into your own project:

| File | Description |
|------|-------------|
| `01-hello-stream.js` | Minimal live stream (~30 lines, raw WebSocket) |
| `02-with-keepalive.js` | Same with `@camtrace/streaming` keep-alive and `LivePlayer` façade |
| `03-playback-controls.js` | Full record playback with all commands |

## Further documentation

- [Architecture overview](../../docs/architecture.md)
- [API & Protocols reference](../../docs/api-and-protocols.md)
- [Advanced record playback](../../docs/advanced-player.md)
- [Troubleshooting](../../docs/troubleshooting.md)

## Bundler requirements

This demo uses webpack 5. If you build your own integration with a different bundler, see [Quickstart — Vanilla JS](../../docs/quickstart-vanilla.md) for the configuration requirements (SharedArrayBuffer headers, `@camtrace/web-video-decoder` babel-loader setup).
