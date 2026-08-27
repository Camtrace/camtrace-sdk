import EventEmitter from 'event-emitter-es6'
import services     from './services'

// High-level façade for live camera streaming.
// Usage:
//   const player = new LivePlayer(cmInterface, streamUrl, { DecoderClass: WebDecoder })
//   player.attach(canvas)
//   await player.start()
//   player.on('frame', ({ rgbData, width, height }) => { ... })
//   player.stop()
//
// DecoderClass is optional — if not provided, raw CMDecoder packets are emitted
// as 'packet' events so the caller can render them with any decoder.
//
// streamType is the `_accept` protocol variant (v1, v1a, v1b…), not a MIME type:
// leave it undefined so the variant advertised at login is used — forcing a wrong
// value downgrades the connection to v1, which carries no H265 and no audio.
export default class LivePlayer extends EventEmitter {
    constructor(cmInterface, streamUrl, { DecoderClass = null, streamType = undefined, type, compr } = {}) {
        super()
        this.cmInterface = cmInterface
        this.streamUrl   = streamUrl
        this.streamType  = streamType
        this.type        = type
        this.compr       = compr
        this.DecoderClass = DecoderClass
        this.service     = null
        this.decoder     = null
        this.canvas      = null
        this.ctx         = null
    }

    attach(canvas) {
        this.canvas = canvas
        this.ctx    = canvas.getContext('2d')
        return this
    }

    async start() {
        if (this.DecoderClass) {
            this.decoder = new this.DecoderClass()
            this.decoder.on('decodeddata', ({ rgbData, width, height }) => {
                this.emit('frame', { rgbData, width, height })
                if (this.ctx && this.canvas) {
                    this.ctx.putImageData(
                        new ImageData(new Uint8ClampedArray(rgbData), width, height),
                        0, 0
                    )
                }
            })
        }

        this.service = await services.openLiveService(
            this.cmInterface, this.streamUrl, this.streamType, this.type, this.compr
        )
        this.service.cmDecoder.on('packet', pck => {
            this.emit('packet', pck)
            // Audio packets must never reach the video decoder: the WASM worker
            // dispatches on subtype only, and the audio desc subtype (83 'S')
            // collides with the video SPS/PPS subtype.
            if (pck.name === 'audio') return
            if (this.decoder && this.canvas) {
                this.decoder.sendPacket(pck, this.canvas.width, this.canvas.height, true)
            }
        })
        this.service.on('close', e => this.emit('close', e))
        this.service.on('error', e => this.emit('error', e))
        return this
    }

    stop() {
        if (this.service) {
            this.service.forceSilentClose()
            this.service = null
        }
        if (this.decoder) {
            this.decoder.close?.()
            this.decoder = null
        }
    }
}
