# Changelog

Notable changes to the CamTrace Integration SDK — the demo application and the
`@camtrace/*` packages. Versions are SDK releases; package versions are given when
they change.

## 1.3.0 — 2026-10-22

### Added
- `@camtrace/api` 2.1.0 — HTTP Basic, for the accounts that require it (from 17.1, every account of an
  LDAP directory: such a server lists `basic` first in `GET /users/{name}/auth`).
  `CMInterface.authenticate({ user, pass, cryptpass })` picks the method: WSSE with a stored
  `cryptpass` alone; with the password, the first method of the server's list this client can
  use — `basic` over HTTPS when the server also takes it on WebSockets
  (`capabilities.webSocket.basicProtocol` of `GET /users/login`, API revision 1.2-48), `wsse`
  when a salt is given. A Basic refusal is never retried with WSSE. New methods `basicLogin()`,
  `basicWebSocket()`, `authMethod()` and `webSocketProtocols()` (the subprotocols that carry the
  credentials on a WebSocket after an HTTP Basic login: `['camtrace', 'camtrace-basic.<base64url>']`).
  With HTTP Basic the service URLs carry no credentials and no clock is involved.
- `@camtrace/api` 2.1.0 — login results carry `method` (`'wsse'` or `'basic'`) and `capabilities`;
  refusals carry `err.authMethod` (the method refused) and, from `authenticate()`,
  `err.authMethods` and `err.basicWebSocket = false` when the API accepted HTTP Basic but the
  WebSockets would not (a server older than API revision 1.2-48, or HTTPS ended by a proxy in
  front of the server).
- `@camtrace/streaming` 1.3.0 — `SimpleService` option `protocols()`, read at every open with the
  link; the `open*Service` helpers pass `cm.webSocketProtocols()`. With HTTP Basic the control
  channel sends the historic login line (`legacyLogin()`, new in `@camtrace/decoder` 2.1.0) to read
  the verdict, and a `nologin` answer is not retried. `connectToServer(server)` accepts
  `server.pass` and logs in with `authenticate()`.
- Demo and documentation: `authenticate()` instead of `simpleLogin()`.
- `@camtrace/api` 2.1.0 — `err.authMethods` on `AUTH_CONFIG` and `AUTH_FAILED`: the authentication
  methods the server offers for the user, in its order (`basic` first: the server expects HTTP
  Basic, at least for some accounts — today those of an LDAP directory).
- `@camtrace/api` 2.1.0 — error codes `AUTH_LOCKED` (HTTP 429) and `AUTH_UNAVAILABLE` (HTTP 503) for
  the two refusals by which a 17.1 server says it did not check the password: too many failed
  logins for the user or from the address, and a directory it could not reach. Both were
  answered `401` before 17.1, which this client reported as `AUTH_FAILED`.
- `@camtrace/api` 2.1.0 — `CMInterface.noteStreamFailure()`, `noteResume()` and `resyncClock()`:
  after a WebSocket that could not be opened, or when the app is back from the background
  (where the device clock may have been set), the next URL builder call reads the server clock
  again. `resyncClock()` resolves to `{ ok, previous, timeShift, error? }`.
- `@camtrace/streaming` 1.3.0 — `SimpleService` takes an optional fifth argument
  `{ onOpenFailed, onOpen, beforeResume }`. `onOpenFailed` is called when the socket could not
  be opened or was closed by the server before its first message; the `open*Service` helpers
  use it to call `noteStreamFailure()`. `onOpen` is called after every successful open.
  `beforeResume` is called when `resume()` starts; the helpers use it to call `noteResume()`,
  so a stream reopened after the background carries a token the server accepts. Read-only state
  `opened`, `received` and `closingLocally`, reset on every open, lets a `'close'` handler tell
  an open refused by the server from a stream that played.

### Changed
- `@camtrace/streaming` 1.3.0 — `connectToServer(server)`: a `server` that carries both `pass` and
  `cryptpass` now logs in with the password (`authenticate()`, the method follows the server);
  with `cryptpass` alone, WSSE as before.
- `@camtrace/api` 2.1.0 — `AUTH_UNAVAILABLE` (HTTP 503) also stands for a server whose authentication
  service did not answer in time or failed (server API revisions 1.2-53 and 1.2-54): the
  password was not checked, as for an unreachable directory; its message no longer names the
  directory alone.

### Fixed
- `@camtrace/api` 2.1.0 — clock drift: a 401 is retried once when the offset read from its `Date`
  header differs by more than 1 s from the offset the request was signed with (was 5 s from
  the last measure, while the server refuses a token more than 2 s in its future; requests in
  flight when the offset was corrected were not retried), never more than once, and never
  when the `Date` header cannot be read (the offset could be reset to 0).
- `@camtrace/api` 2.1.0 — `GET /users/{name}/auth`: the user name is URL-encoded, and the request
  is sent without WSSE headers.
- `@camtrace/streaming` 1.3.0 — control channel: the login line was only sent on the first open,
  and its answer was never read. A session whose token was refused (a clock that moved since
  discovery) stayed open but unauthenticated, without any event. The line is now sent on every
  open (reconnections, resume). A `nologin` answer makes the service read the server clock
  again and, when the offset moved, send the line once more 11 s later: from 17.1 the server
  refuses every credential of a name from an address for 10 s after a refused one.

## 1.2.0 — 2026-09-02

### Breaking
- `@camtrace/api` 2.0.0 — typed errors. `loadApis()`, `simpleLogin()`, `login()` and
  `getCryptPass()` now reject with an `ApiError` (`err.code` in `ApiErrorCodes`,
  `err.httpStatus`, `err.cause`) instead of plain strings (`"Server API version too old"`,
  `"Salt not found !"`…) or raw `fetch` / axios errors. `err.message` stays a readable
  English text, so code that only displays the message keeps working; code that tested
  `typeof err === 'string'` or matched the message text must switch to `err.code`.
  `import CamtraceApi, { ApiError, ApiErrorCodes } from '@camtrace/api'`.
- `@camtrace/api` 2.0.0 — timeouts. The discovery request aborts after 15 s
  (`loadApis(host, port, ssl, appVersion, { timeout })`) and every request of the returned
  `CMInterface` has a 15 s HTTP timeout (previously unlimited): a silently dropped
  connection now fails with `TIMEOUT` instead of hanging.
- `@camtrace/api` 2.0.0 — discovery checks the HTTP status: a non-2xx `GET /api/` answer is
  an `HTTP_ERROR` (a 401/500 with a JSON body could previously pass as a valid discovery),
  and a non-JSON or unexpected body is a `BAD_RESPONSE`.

### Added
- `@camtrace/streaming` 1.2.0 — `setLogHandler(fn)`: optional log sink for WebSocket
  opening / open / close / error events (URLs are passed without their authentication
  parameters). `SimpleService` now emits `'error'` on WebSocket errors, so
  `LivePlayer.on('error')` fires.
- Demo: the login form shows the error code next to the message.
- `docs/troubleshooting.md`: error code table for `@camtrace/api`.

## 1.1.0 — 2026-08-27

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
