/**
 * Example 01 — Hello Stream
 *
 * The minimal code to display a live H.264 stream from a CamTrace server
 * in a browser canvas. No framework, no helper — raw @camtrace/api and
 * @camtrace/decoder with a WebDecoder WASM renderer.
 *
 * Prerequisites:
 *   - webpack 5 or Vite with SharedArrayBuffer support (COOP/COEP headers)
 *   - See docs/quickstart-vanilla.md for the full bundler setup
 */

import CamtraceApi from '@camtrace/api'
import CMDecoder   from '@camtrace/decoder'
import WebDecoder  from '@camtrace/web-video-decoder'

const HOST   = '192.168.1.100'
const PORT   = 443
const SSL    = true
const USER   = 'admin'
const PASS   = 'plaintext_password'
const CANVAS = document.getElementById('video')

async function main() {
    // 1. Connect and authenticate
    const cm = await CamtraceApi.loadApis(HOST, PORT, SSL)
    await cm.simpleLogin(USER, PASS)

    // 2. Pick the first camera, HD stream
    const cameras = await cm.cameras()
    const stream  = cameras[0].formatedStreams.hd

    // 3. Build the authenticated WebSocket URL
    const wsUrl = await cm.buildLiveCameraUrl(stream.url, 'video/h264')

    // 4. Set up decoder and renderer
    const decoder = new CMDecoder.Live()
    const wasm    = new WebDecoder()
    const ctx     = CANVAS.getContext('2d')
    CANVAS.width  = stream.width  || 1280
    CANVAS.height = stream.height || 720

    // 5. Connect WebSocket, wire everything together
    const ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'

    ws.onmessage = e => decoder.write(Buffer.from(e.data))
    decoder.on('send', data => { if (ws.readyState === 1) ws.send(data) })

    decoder.on('packet', pck =>
        wasm.sendPacket(pck, CANVAS.width, CANVAS.height, true))

    wasm.on('decodeddata', ({ rgbData, width, height }) =>
        ctx.putImageData(
            new ImageData(new Uint8ClampedArray(rgbData), width, height), 0, 0
        ))
}

main().catch(console.error)
