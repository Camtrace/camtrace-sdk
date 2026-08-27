# Changelog

Notable changes to the CamTrace Integration SDK — the demo application and the
`@camtrace/*` packages. Versions are SDK releases; package versions are given when
they change.

## 1.1.0 — unreleased

### Fixed
- H.265 cameras streamed nothing when the stream URL was built with a MIME type as
  `_accept`. That parameter is a CamTrace protocol variant (`v1`, `v1a` +audio,
  `v1b` +H.265…), and an unknown value silently downgrades the connection to `v1`.
  `@camtrace/streaming` now sends the variant advertised by the server at login and
  `LivePlayer` defaults `streamType` to it; the demo and the examples were updated.
  (`@camtrace/api` 1.24.0: new `streamProtocol()`; `@camtrace/streaming` 1.1.0)

### Added
- `docs/troubleshooting.md`: H.265 / `_accept` diagnosis, audio-packet filtering when
  enabling `v1b`.
- Root `npm run build` and `npm run demo` scripts — the quickstart now works from a
  clone of the repository as well as from the archive.
- `THIRD_PARTY_NOTICES.md`, and the FFmpeg WebAssembly build recipe
  (`packages/web-video-decoder/ffmpeg-wasm/`, `scripts/rebuild-wasm.sh`) so the LGPL
  module can be rebuilt; documented in `packages/web-video-decoder/README.md`.
- `SECURITY.md`; root `package-lock.json` (CI runs `npm ci` on Node 18, 20 and 22).

### Changed
- Requirements: Node 18+.
- Quickstarts: the packages are not on npm yet — `file:` dependencies on this
  repository are documented instead of `npm install @camtrace/*`.

## 1.0.1 — 2026-07-23

- First release in the dedicated `camtrace-sdk` repository (MIT `LICENSE`,
  `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, CI).
- `@camtrace/decoder`: audio packets (description + frames) are demultiplexed on the
  live and record streams.
- Record playback documentation: `load`-before-`init` sequence, timeline (`bar`)
  character encoding, `status` timestamps; `docs/advanced-player.md` corrected.

## 1.0.0 — 2026-05-21

- First integrator archive: demo application (login, camera list, live, record
  playback), `@camtrace/api`, `@camtrace/decoder`, `@camtrace/streaming`,
  `@camtrace/web-video-decoder`, integration documentation (`docs/`).
