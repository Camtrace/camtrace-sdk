import EventEmitter from 'event-emitter-es6'
import services     from './services'

// High-level façade for CamTrace player (records) streaming.
//
// Lifecycle:
//   start()       — opens control channel, sends init, emits 'ready'.
//                   With { autoOpenVideo: true } opens video early for preview burst.
//   play()        — opens video channel lazily (if not yet open), then plays forward.
//   backward()    — same but plays backward.
//   stop()        — stops playback; video channel stays open for resume.
//   setBarType()  — switches recording type; mirrors mobile Overlay.vue: only sends 'type'.
//   close()       — closes everything.
//
// streamType is the `_accept` protocol variant (v1, v1a, v1b…), not a MIME type:
// leave it undefined so the variant advertised at login is used — forcing a wrong
// value downgrades the connection to v1, which carries no H265 and no audio.
export default class PlaybackPlayer extends EventEmitter {
    constructor(cmInterface, cameraId, { DecoderClass = null, streamType = undefined } = {}) {
        super()
        this.cmInterface  = cmInterface
        this.cameraId     = cameraId
        this.streamType   = streamType
        this.DecoderClass = DecoderClass
        this.ctrlService  = null
        this.videoService = null
        this.decoder      = null
        this.canvas       = null
        this.ctx          = null
        this._playerId    = null
    }

    attach(canvas) {
        this.canvas = canvas
        this.ctx    = canvas.getContext('2d')
        return this
    }

    _initDecoder() {
        this.decoder?.close?.()
        this.decoder = null
        if (!this.DecoderClass) return
        this.decoder = new this.DecoderClass()
        this.decoder.on('decodeddata', ({ rgbData, width, height }) => {
            // Resize canvas synchronously BEFORE drawing.
            // event-emitter-es6 dispatches listeners asynchronously (~12ms delay), so
            // emit('frame') runs AFTER putImageData.  If canvas resize were left to the
            // frame handler (playback.js), it would clear the just-drawn frame.
            if (this.canvas && (this.canvas.width !== width || this.canvas.height !== height)) {
                this.canvas.width  = width
                this.canvas.height = height
            }
            this.emit('frame', { width, height })  // async — used only for scheduleFit + status
            if (this.ctx && this.canvas) {
                this.ctx.putImageData(
                    new ImageData(new Uint8ClampedArray(rgbData), width, height), 0, 0
                )
            }
        })
    }

    async _ensureVideo() {
        if (this.videoService) return
        if (!this._playerId) throw new Error('No player ID — call start() first')
        if (!this.decoder) this._initDecoder()

        this.videoService = await services.openVideoRecordService(
            this.cmInterface, this._playerId, this.streamType
        )
        this.videoService.cmDecoder.on('packet', pck => {
            this.emit('packet', pck)
            if (pck.name === 'status') {
                // Video channel status packets carry per-frame timestamps:
                // "image <flags> <unix_ms>" — same source used by the mobile app (Overlay.vue).
                const parts = pck.data.toString().split(' ')
                if (parts[0] === 'image' && parts[2]) {
                    const ts = parseInt(parts[2])
                    if (!isNaN(ts)) this.emit('time', ts / 1000)  // ms → seconds
                }
                return
            }
            if (pck.name === 'jpeg') {
                // JPEG packets have no subtype — draw directly, never route to WASM decoder.
                if (!this.canvas || !this.ctx) return
                const blob = new Blob([pck.data], { type: 'image/jpeg' })
                const url  = URL.createObjectURL(blob)
                const img  = new Image()
                img.onload = () => {
                    if (!this.canvas) { URL.revokeObjectURL(url); return }
                    // Same pattern: resize synchronously before draw.
                    if (this.canvas.width !== img.naturalWidth || this.canvas.height !== img.naturalHeight) {
                        this.canvas.width  = img.naturalWidth
                        this.canvas.height = img.naturalHeight
                    }
                    this.emit('frame', { width: img.naturalWidth, height: img.naturalHeight })
                    if (this.canvas && this.ctx) this.ctx.drawImage(img, 0, 0)
                    URL.revokeObjectURL(url)
                }
                img.src = url
                return
            }
            // Audio packets must never reach the video decoder (subtype 83 'S'
            // collides with the video SPS/PPS subtype in the WASM worker).
            if (pck.name === 'audio') return
            if (this.decoder && this.canvas) {
                this.decoder.sendPacket(pck, this.canvas.width, this.canvas.height, true)
            }
        })
        this.videoService.on('close', e => {
            this.videoService = null   // allow reopening on next play()
            this.emit('close', e)
        })
    }

    // Opens the control channel, sends init + type, emits 'ready'.
    // With { autoOpenVideo: true }, opens the video channel before init so the server
    // sends its initial non-timestamped preview frames (same behaviour as the mobile app).
    async start(barName, startTime, endTime, barSize, currentTime, { autoOpenVideo = false } = {}) {
        this._initDecoder()

        await services.openControlRecordService(
            this.cmInterface, this.cameraId,
            async (ctrlService, playerId) => {
                this.ctrlService = ctrlService
                this._playerId   = playerId

                ctrlService.cmDecoder.on('time',  t => this.emit('time',  t))
                ctrlService.cmDecoder.on('step',  s => this.emit('step',  s))
                ctrlService.cmDecoder.on('bar',   b => this.emit('bar',   b))
                ctrlService.cmDecoder.on('span',  s => this.emit('span',  s))
                ctrlService.cmDecoder.on('rfreq', r => this.emit('rfreq', r))

                // ① Register load listener BEFORE opening video to avoid missing an early fire.
                let loadReady = false
                let resolveLoad
                const loadPromise = new Promise(r => { resolveLoad = r })
                ctrlService.cmDecoder.on('load', l => {
                    if (!loadReady) { loadReady = true; resolveLoad() }
                    this.emit('load', l)
                })

                if (autoOpenVideo) {
                    await this._ensureVideo()
                }

                // ② Wait for server 'load' signal before sending init — mirrors the mobile app
                // which only calls sendInit() after the 'load' event fires.
                // 2s timeout as fallback for protocol versions that may not send 'load'.
                if (!loadReady) {
                    await Promise.race([loadPromise, new Promise(r => setTimeout(r, 2000))])
                }
                // barName is already the first argument of init — do NOT call type() here.
                // type() causes the server to send a fresh createDecoder, which resets the
                // WASM decoder state; P-frames decoded before the next I-frame produce black
                // output.  The mobile app never calls type() on initial load, only on bar
                // type switch (setBarType).
                ctrlService.cmDecoder.init(barName, this.cameraId, startTime, endTime, barSize, currentTime * 1000)
                this.emit('ready')
            }
        )
        return this
    }

    async play() {
        await this._ensureVideo()
        this.ctrlService?.cmDecoder.playForward()
    }

    async backward() {
        await this._ensureVideo()
        this.ctrlService?.cmDecoder.playBackward()
    }

    stop()         { this.ctrlService?.cmDecoder.stop() }
    seek(pos)      { this.ctrlService?.cmDecoder.goto(pos) }
    setTime(ts)    { this.ctrlService?.cmDecoder.time(ts) }
    setSpeed(freq) { this.ctrlService?.cmDecoder.freq(freq) }

    async stepForward() {
        await this._ensureVideo()
        this.ctrlService?.cmDecoder.playNext()
    }

    async stepBackward() {
        await this._ensureVideo()
        this.ctrlService?.cmDecoder.playPrev()
    }

    // Switch bar type ('regul' or 'alarm').
    // Mirrors mobile Overlay.vue::toggleRecordType: only send 'type' on the control channel.
    // The server emits a fresh createDecoder on the video channel; worker.js handles the
    // DPB reset there (destroyDecoder + createDecoder) so this method needs no decoder
    // manipulation.
    async setBarType(type, currentSec = 0) {
        this.ctrlService?.cmDecoder.type(type, currentSec * 1000)
        await this._ensureVideo().catch(e => console.error('[PlaybackPlayer] setBarType:', e))
    }

    close() {
        this.ctrlService?.forceSilentClose()
        this.videoService?.forceSilentClose()
        this.decoder?.close?.()
        this.ctrlService  = null
        this.videoService = null
        this.decoder      = null
        this._playerId    = null
    }
}
