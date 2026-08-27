import { services }  from '@camtrace/streaming'
import WebDecoder    from '@camtrace/web-video-decoder'
import { state }     from '../state.js'
import { navigate }  from '../router.js'

// Compressed video packets go to the WASM decoder; 'jpeg' is drawn directly.
const COMPRESSED_TYPES = ['h264', 'h265', 'mpeg4']

export default function LiveView(container, cameraIndex) {
    if (!state.cm || !state.cameras.length) { navigate('/'); return }

    const cam     = state.cameras[cameraIndex] || state.cameras[0]
    const streams = cam.formatedStreams || {}
    const QUALITIES = [
        { key: 'hd', label: 'HD' },
        { key: 'md', label: 'MD' },
        { key: 'ld', label: 'LD' },
    ].filter(q => streams[q.key])

    let activeQuality = QUALITIES[0]?.key || 'hd'

    container.innerHTML = `
      <div class="page page-live">
        <div class="header">
          <button class="back" id="back-btn">← Cameras</button>
          <h1>${cam.name}</h1>
          <div class="quality-bar" id="quality-bar">
            ${QUALITIES.map(q => `
              <button class="btn btn-sm ${q.key === activeQuality ? 'active' : ''}"
                      data-quality="${q.key}">${q.label}</button>
            `).join('')}
          </div>
        </div>
        <div class="player-wrap">
          <div class="video-container">
            <canvas class="video-canvas" id="video-canvas"></canvas>
            <div class="video-status" id="video-status">Connecting…</div>
          </div>
        </div>
      </div>
    `

    container.querySelector('#back-btn').addEventListener('click', () => navigate('/cameras'))

    const canvas         = container.querySelector('#video-canvas')
    const videoContainer = container.querySelector('.video-container')
    const statusEl       = container.querySelector('#video-status')

    let active      = true   // false once torn down; guards async decoder/RAF callbacks
    let liveService = null
    let decoder     = null

    // ── Canvas fit ────────────────────────────────────────────────────────────

    let fitRafId = null

    function fitCanvas() {
        fitRafId = null
        if (!active || !canvas.width || !canvas.height) return
        const GAP    = 16
        const header = container.querySelector('.header')
        const availH = Math.max(200, window.innerHeight - 2 * GAP - header.offsetHeight - GAP - 1)
        const availW = videoContainer.clientWidth
        const scale  = Math.min(availW / canvas.width, availH / canvas.height)
        canvas.style.width  = Math.round(canvas.width  * scale) + 'px'
        canvas.style.height = Math.round(canvas.height * scale) + 'px'
    }

    function scheduleFit() {
        if (fitRafId) cancelAnimationFrame(fitRafId)
        fitRafId = requestAnimationFrame(fitCanvas)
    }

    window.addEventListener('resize', scheduleFit)

    async function startStream(qualityKey) {
        stopStream()
        statusEl.textContent = 'Connecting…'
        statusEl.style.display = ''

        const stream = streams[qualityKey]
        if (!stream) {
            statusEl.textContent = `No ${qualityKey} stream available`
            return
        }

        canvas.width        = stream.width  || 1280
        canvas.height       = stream.height || 720
        canvas.style.width  = '100%'
        canvas.style.height = 'auto'
        scheduleFit()
        const ctx = canvas.getContext('2d')

        try {
            // No protocol forced: the SDK sends the `_accept` variant the server
            // advertised at login (v1b), which is what carries H265 and audio.
            liveService = await services.openLiveService(state.cm, stream.url)

            let firstFrame = true

            // Created on the first compressed packet, whatever the encoding — a
            // MJPEG camera never spawns a decoder worker.
            function ensureDecoder() {
                if (decoder) return decoder
                decoder = new WebDecoder()
                decoder.on('decodeddata', ({ rgbData, width, height }) => {
                    if (!active) return
                    if (canvas.width !== width || canvas.height !== height) {
                        canvas.width  = width
                        canvas.height = height
                        scheduleFit()
                    }
                    if (firstFrame) { statusEl.style.display = 'none'; firstFrame = false }
                    ctx.putImageData(
                        new ImageData(new Uint8ClampedArray(rgbData), width, height), 0, 0
                    )
                })
                return decoder
            }

            liveService.cmDecoder.on('packet', pck => {
                if (pck.name === 'status') return

                if (pck.name === 'jpeg') {
                    const blob = new Blob([pck.data], { type: 'image/jpeg' })
                    const url  = URL.createObjectURL(blob)
                    const img  = new Image()
                    img.onload = () => {
                        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
                            canvas.width  = img.naturalWidth
                            canvas.height = img.naturalHeight
                            scheduleFit()
                        }
                        ctx.drawImage(img, 0, 0)
                        URL.revokeObjectURL(url)
                        if (firstFrame) { statusEl.style.display = 'none'; firstFrame = false }
                    }
                    img.src = url
                    return
                }

                // Audio packets must never reach the video decoder: the WASM worker
                // dispatches on subtype only, and the audio desc subtype (83 'S')
                // collides with the video SPS/PPS subtype.
                if (COMPRESSED_TYPES.indexOf(pck.name) === -1) return

                ensureDecoder().sendPacket(pck, canvas.width, canvas.height, true)
            })

            liveService.on('close', () => {
                statusEl.textContent = 'Stream closed'
                statusEl.style.display = ''
            })
        } catch (err) {
            console.error('[live]', err)
            statusEl.textContent = `Error: ${err?.message || err}`
        }
    }

    function stopStream() {
        liveService?.forceSilentClose()
        decoder?.close()
        liveService = null
        decoder     = null
    }

    container.querySelector('#quality-bar').addEventListener('click', e => {
        const btn = e.target.closest('[data-quality]')
        if (!btn) return
        container.querySelectorAll('[data-quality]').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        activeQuality = btn.dataset.quality
        startStream(activeQuality)
    })

    startStream(activeQuality)

    return () => {
        active = false
        stopStream()
        window.removeEventListener('resize', scheduleFit)
        if (fitRafId) { cancelAnimationFrame(fitRafId); fitRafId = null }
    }
}
