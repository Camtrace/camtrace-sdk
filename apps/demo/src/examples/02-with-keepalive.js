/**
 * Example 02 — With Keep-Alive and Reconnect
 *
 * Uses @camtrace/streaming's SimpleService (keep-alive ping every 30s,
 * Cordova pause/resume hooks) and the high-level LivePlayer façade.
 * This is the recommended approach for production integrations.
 */

import CamtraceApi        from '@camtrace/api'
import { services, LivePlayer } from '@camtrace/streaming'
import WebDecoder         from '@camtrace/web-video-decoder'

const CANVAS = document.getElementById('video')

async function main() {
    const cm = await CamtraceApi.loadApis('192.168.1.100', 443, true)
    await cm.simpleLogin('admin', 'plaintext_password')
    const cameras = await cm.cameras()
    const stream  = cameras[0].formatedStreams.hd

    // ── Option A: services low-level (access to SimpleService instance) ────

    // No protocol argument: openLiveService sends the `_accept` variant the server
    // advertised at login (v1b — H265 + audio). Pass one only to force an older variant.
    const liveService = await services.openLiveService(cm, stream.url)
    const decoder     = new WebDecoder()
    const ctx         = CANVAS.getContext('2d')
    CANVAS.width  = stream.width  || 1280
    CANVAS.height = stream.height || 720

    liveService.cmDecoder.on('packet', pck =>
        decoder.sendPacket(pck, CANVAS.width, CANVAS.height, true))

    decoder.on('decodeddata', ({ rgbData, width, height }) =>
        ctx.putImageData(
            new ImageData(new Uint8ClampedArray(rgbData), width, height), 0, 0
        ))

    liveService.on('close', () => console.log('stream closed'))

    // Stop after 60s
    setTimeout(() => {
        liveService.forceSilentClose()
        decoder.close()
    }, 60_000)


    // ── Option B: LivePlayer façade (simpler, less control) ────────────────

    const player = new LivePlayer(cm, stream.url, { DecoderClass: WebDecoder })
    player.attach(CANVAS)
    await player.start()

    player.on('frame', () => { /* custom rendering if needed */ })
    player.on('close', () => console.log('player closed'))

    // Stop after 60s
    setTimeout(() => player.stop(), 60_000)
}

main().catch(console.error)
