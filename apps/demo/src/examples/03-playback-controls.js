/**
 * Example 03 — Record Playback Controls
 *
 * Full playback sequence: two WebSocket connections (control + video),
 * initialization, and all playback commands.
 *
 * See docs/advanced-player.md for the protocol sequence diagram.
 */

import CamtraceApi        from '@camtrace/api'
import { services, PlaybackPlayer } from '@camtrace/streaming'
import WebDecoder         from '@camtrace/web-video-decoder'

const CANVAS = document.getElementById('video')

async function main() {
    const cm = await CamtraceApi.loadApis('192.168.1.100', 443, true)
    await cm.simpleLogin('admin', 'plaintext_password')
    const cameras  = await cm.cameras()
    const cam      = cameras[0]

    // One hour window starting from an hour ago
    const now      = Math.floor(Date.now() / 1000)
    const startTs  = now - 3600
    const endTs    = now
    const barSize  = 1000

    // ── Option A: PlaybackPlayer façade ────────────────────────────────────

    // Register listeners before start() — 'ready' fires inside start() via async emitter
    const player = new PlaybackPlayer(cm, cam.id, { DecoderClass: WebDecoder })
    player.attach(CANVAS)

    player.on('ready', () => {
        console.log('player ready — starting playback')
        player.play()
    })

    player.on('time', pos => {
        const elapsed = pos - startTs
        console.log(`position: ${Math.floor(elapsed)}s`)
    })

    player.on('bar',  args => console.log('bar data:', args))
    player.on('load', data => console.log('timeline data:', data))

    await player.start('regul', startTs, endTs, barSize, startTs)

    // Playback commands (wire to your UI buttons)
    document.getElementById('btn-play')     ?.addEventListener('click', () => player.play())
    document.getElementById('btn-backward') ?.addEventListener('click', () => player.backward())
    document.getElementById('btn-stop')     ?.addEventListener('click', () => player.stop())
    document.getElementById('btn-stepfwd')  ?.addEventListener('click', () => player.stepForward())
    document.getElementById('btn-stepbck')  ?.addEventListener('click', () => player.stepBackward())
    document.getElementById('btn-2x')       ?.addEventListener('click', () => player.setSpeed(2))
    document.getElementById('btn-seek')     ?.addEventListener('click', () => {
        const t = parseInt(document.getElementById('seek-input').value, 10)
        player.seek(t)
    })

    // Cleanup
    window.addEventListener('beforeunload', () => player.close())


    // ── Option B: raw services (full control over both WebSockets) ─────────

    const decoder = new WebDecoder()
    const ctx     = CANVAS.getContext('2d')
    CANVAS.width  = 1280
    CANVAS.height = 720

    decoder.on('decodeddata', ({ rgbData, width, height }) =>
        ctx.putImageData(
            new ImageData(new Uint8ClampedArray(rgbData), width, height), 0, 0
        ))

    await services.openControlRecordService(cm, cam.id, async (ctrlService, playerId) => {
        // No protocol argument: the `_accept` variant advertised at login is used
        // (v1b — H265 + audio). Pass one only to force an older variant.
        const vidService = await services.openVideoRecordService(cm, playerId)

        vidService.cmDecoder.on('packet', pck =>
            decoder.sendPacket(pck, CANVAS.width, CANVAS.height, true))

        ctrlService.cmDecoder.init('regul', cam.id, startTs, endTs, barSize, startTs)
        ctrlService.cmDecoder.playForward()

        ctrlService.cmDecoder.on('time', pos =>
            console.log('position:', pos))

        // Playback commands via ctrlService.cmDecoder:
        //   .playForward()   .playBackward()   .stop()
        //   .goto(position)  .time(timestamp)
        //   .freq(speed)
    })
}

main().catch(console.error)
