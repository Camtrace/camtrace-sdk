# CamTrace Integration SDK — Demo

This package contains a self-contained demo and the four reusable modules that power live and recorded video playback from CamTrace servers.

## What's included

| Path | Description |
|---|---|
| `apps/demo/` | Vanilla JS demo app (login → camera list → live → player records) |
| `packages/api/` | CamTrace HTTP client — authentication (WSSE), camera list, session |
| `packages/decoder/` | CamTrace binary protocol demultiplexer — H264 NAL units, control events |
| `packages/streaming/` | High-level facades — `LivePlayer`, `PlaybackPlayer`, WebSocket services |
| `packages/web-video-decoder/` | Generic FFmpeg-WASM wrapper — renders H264 to canvas (replaceable with any H264 decoder) |
| `docs/` | Integration documentation |

## Quickstart (5 minutes)

**Requirements:** Node 16+, a running CamTrace server accessible on the network.

```bash
cd apps/demo
npm install
npm run dev
# Open http://localhost:8080
# Enter your CamTrace server address and credentials, then select a camera.
```

## Documentation

- [`docs/quickstart-vanilla.md`](docs/quickstart-vanilla.md) — step-by-step integration guide (vanilla JS)
- [`docs/quickstart-vue.md`](docs/quickstart-vue.md) — Vue 3 integration guide
- [`docs/architecture.md`](docs/architecture.md) — module overview and data flow
- [`docs/advanced-player.md`](docs/advanced-player.md) — record playback protocol and controls
- [`docs/api-and-protocols.md`](docs/api-and-protocols.md) — WSSE authentication and WebSocket protocol reference

## Notes

- `packages/web-video-decoder/` is a **generic** FFmpeg-WASM wrapper provided as a proof-of-concept decoder. You can substitute your own H264 decoder (WebCodecs API, another WASM wrapper, native decoder) as long as it consumes the NAL unit packets emitted by `@camtrace/decoder`.
- The demo app requires `SharedArrayBuffer` (COOP/COEP headers) for the WASM decoder. See [`docs/quickstart-vanilla.md`](docs/quickstart-vanilla.md) for the required HTTP response headers.

## Support

Contact: support@camtrace.com
