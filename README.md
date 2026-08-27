# CamTrace Integration SDK — Demo

[![CI](https://github.com/Camtrace/camtrace-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Camtrace/camtrace-sdk/actions/workflows/ci.yml)

This package contains a self-contained demo and the four reusable modules that power live and recorded video playback from CamTrace servers.

CamTrace is a video management system (VMS). This SDK lets a web application authenticate to a CamTrace server, enumerate its cameras, and display live and recorded video streams in the browser — the same building blocks CamTrace's own applications use.

**Status:** the `@camtrace/*` packages are not published on npm yet — consume them from this repository (see the quickstarts). Licensed under the MIT License; the bundled FFmpeg WebAssembly decoder is LGPL, see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## What's included

| Path | Description |
|---|---|
| `apps/demo/` | Vanilla JS demo app (login → camera list → live → player records) |
| `packages/api/` | CamTrace HTTP client — authentication (WSSE), camera list, session |
| `packages/decoder/` | CamTrace binary protocol demultiplexer — H264 NAL units, control events |
| `packages/streaming/` | High-level facades — `LivePlayer`, `PlaybackPlayer`, WebSocket services |
| `packages/web-video-decoder/` | Generic FFmpeg-WASM wrapper — renders H264 to canvas (replaceable with any H264 decoder) |
| `docs/` | Integration documentation |
| `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md` | Release notes; licenses of bundled third-party components (FFmpeg LGPL, npm dependencies) |

## Quickstart (5 minutes)

**Requirements:** Node 18+, npm 8+, a running CamTrace server (API v1.2) reachable from your machine.

From the root of this package (or of a clone of the repository):

```bash
npm install        # installs the demo and the four packages (npm workspaces)
npm run build      # builds @camtrace/api and @camtrace/decoder
npm run demo       # starts the demo dev server
# Open http://localhost:8080
# Enter your CamTrace server address and credentials, then select a camera.
```

## Documentation

- [`docs/quickstart-vanilla.md`](docs/quickstart-vanilla.md) — step-by-step integration guide (vanilla JS)
- [`docs/quickstart-vue.md`](docs/quickstart-vue.md) — Vue 3 integration guide
- [`docs/architecture.md`](docs/architecture.md) — module overview and data flow
- [`docs/advanced-player.md`](docs/advanced-player.md) — record playback protocol and controls
- [`docs/api-and-protocols.md`](docs/api-and-protocols.md) — WSSE authentication and WebSocket protocol reference
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — common errors and fixes

## Notes

- `packages/web-video-decoder/` is a **generic** FFmpeg-WASM wrapper provided as a proof-of-concept decoder. You can substitute your own H264 decoder (WebCodecs API, another WASM wrapper, native decoder) as long as it consumes the NAL unit packets emitted by `@camtrace/decoder`.
- The demo app requires `SharedArrayBuffer` (COOP/COEP headers) for the WASM decoder. See [`docs/quickstart-vanilla.md`](docs/quickstart-vanilla.md) for the required HTTP response headers.

## Support

Contact: support@camtrace.com
