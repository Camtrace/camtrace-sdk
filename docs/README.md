# CamTrace Integration SDK — Documentation

This directory contains the public documentation for integrating CamTrace video streaming into your own applications.

## Getting started

| Document | Description |
|----------|-------------|
| [Quickstart — Vanilla JS](quickstart-vanilla.md) | Step-by-step guide to display a live stream in a plain HTML page |
| [Quickstart — Vue 3](quickstart-vue.md) | Same guide using Vue 3 Composition API |
| [Advanced — Record Playback](advanced-player.md) | Full playback controls, timeline, seek, speed |
| [Troubleshooting](troubleshooting.md) | Common errors and fixes |

## Reference

| Document | Description |
|----------|-------------|
| [Architecture](architecture.md) | Module overview and data flow |
| [API & Protocols](api-and-protocols.md) | HTTP endpoints, WebSocket protocols, WSSE authentication |
| [Module Guide](module-guide.md) | Detailed API reference for each package |

## Package READMEs

Each package also has its own README with a focused quickstart:

- [`@camtrace/api`](../packages/api/README.md) — HTTP client and URL builders
- [`@camtrace/decoder`](../packages/decoder/README.md) — Binary/text protocol parsers
- [`@camtrace/streaming`](../packages/streaming/README.md) — High-level streaming façades
- [`@camtrace/web-video-decoder`](../packages/web-video-decoder/README.md) — WASM reference decoder

## Packages overview

```
@camtrace/api           — CamTrace HTTP API v1.2 client (auth, cameras, service URLs)
@camtrace/decoder       — Binary & text protocol parsers for WebSocket streams
@camtrace/streaming     — WebSocket lifecycle, keep-alive, LivePlayer, PlaybackPlayer
@camtrace/web-video-decoder — FFmpeg-WASM reference decoder (substitutable)
```
