# Quickstart — Vanilla JS

Display a live H.264 stream from a CamTrace server in a plain HTML page, with no framework.

## Prerequisites

- A bundler that supports `new URL(…, import.meta.url)` and Web Workers: **webpack 5** or **Vite**
- A CamTrace server v1.2+
- Your server must serve the page with these headers for the WASM decoder (SharedArrayBuffer requirement):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

See [webpack 5 dev-server configuration](#webpack-5-dev-server) below.

## Install

The `@camtrace/*` packages are not published on npm yet. Get them from the SDK
repository (a clone, or the delivered archive), build the compiled packages once at
its root — `npm install && npm run build` — then reference them from your project
with `file:` dependencies (or copy the `packages/` directory into your project):

```json
"dependencies": {
  "@camtrace/api":               "file:../camtrace-sdk/packages/api",
  "@camtrace/decoder":           "file:../camtrace-sdk/packages/decoder",
  "@camtrace/streaming":         "file:../camtrace-sdk/packages/streaming",
  "@camtrace/web-video-decoder": "file:../camtrace-sdk/packages/web-video-decoder"
}
```

## HTML

```html
<!DOCTYPE html>
<html>
<head><title>CamTrace Live</title></head>
<body>
  <form id="login">
    <input id="host"     placeholder="192.168.1.100" />
    <input id="port"     placeholder="443" type="number" />
    <input id="user"     placeholder="username" />
    <input id="password" placeholder="password" type="password" />
    <label><input id="ssl" type="checkbox" checked /> HTTPS</label>
    <button type="submit">Connect</button>
  </form>

  <select id="cameras" style="display:none"></select>
  <canvas id="video"   style="display:none; background:#000"></canvas>

  <script type="module" src="./main.js"></script>
</body>
</html>
```

## main.js

```js
import CamtraceApi from '@camtrace/api'
import { services }  from '@camtrace/streaming'
import WebDecoder    from '@camtrace/web-video-decoder'

let cm          = null
let cameras     = []
let liveService = null
let decoder     = null

// ── 1. Login ────────────────────────────────────────────────────────────────

document.getElementById('login').addEventListener('submit', async e => {
  e.preventDefault()
  const host = document.getElementById('host').value
  const port = parseInt(document.getElementById('port').value, 10)
  const ssl  = document.getElementById('ssl').checked
  const user = document.getElementById('user').value
  const pass = document.getElementById('password').value

  cm = await CamtraceApi.loadApis(host, port, ssl)
  await cm.simpleLogin(user, pass)

  cameras = await cm.cameras()

  const select = document.getElementById('cameras')
  select.innerHTML = cameras.map((c, i) =>
    `<option value="${i}">${c.name}</option>`
  ).join('')
  select.style.display = ''
  select.dispatchEvent(new Event('change'))
})

// ── 2. Camera selection ─────────────────────────────────────────────────────

document.getElementById('cameras').addEventListener('change', async e => {
  stopStream()
  const cam = cameras[parseInt(e.target.value, 10)]
  await startLive(cam.formatedStreams.hd)
})

// ── 3. Live stream ──────────────────────────────────────────────────────────

async function startLive(stream) {
  const canvas = document.getElementById('video')
  canvas.width  = stream.width  || 1280
  canvas.height = stream.height || 720
  canvas.style.display = ''
  const ctx = canvas.getContext('2d')

  decoder     = new WebDecoder()
  // No protocol argument: the SDK sends the `_accept` variant advertised by the
  // server at login (v1b — required for H265 cameras and for audio).
  liveService = await services.openLiveService(cm, stream.url)

  liveService.cmDecoder.on('packet', pck =>
    decoder.sendPacket(pck, canvas.width, canvas.height, true))

  decoder.on('decodeddata', ({ rgbData, width, height }) =>
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(rgbData), width, height), 0, 0))

  liveService.on('close', () => console.log('stream closed'))
}

function stopStream() {
  liveService?.forceSilentClose()
  decoder?.close()
  liveService = null
  decoder     = null
}
```

## webpack 5 dev-server

```js
// webpack.config.js
module.exports = {
  // …
  module: {
    rules: [{
      test: /\.js$/,
      exclude: {
        and: [/node_modules/],
        not: [/web-video-decoder/]   // re-transpile this package
      },
      use: ['babel-loader']
    }]
  },
  resolve: {
    symlinks: false   // required when using npm workspace symlinks
  },
  devServer: {
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
}
```

## What's next

- [Advanced — Record Playback](advanced-player.md) — add timeline controls and seek
- [Quickstart — Vue 3](quickstart-vue.md) — same flow with the Composition API
- [`@camtrace/api` reference](../packages/api/README.md) — full endpoint list
