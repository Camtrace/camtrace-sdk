import EventEmitter from 'event-emitter-es6'

const VIDEO_PCK_TYPES = ['h264', 'h265', 'mpeg4', 'jpeg']

export default class WebDecoder extends EventEmitter {
    #worker = null

    constructor() {
        super()
        // Webpack 5 detects this pattern and bundles worker.js as a separate chunk.
        this.#worker = new Worker(new URL('./worker.js', import.meta.url))
        this.#worker.onmessage = (e) => this.emit('decodeddata', e.data)
    }

    sendPacket(pck, cWidth, cHeight, scale) {
        if (VIDEO_PCK_TYPES.indexOf(pck.name) !== -1 && !this.currentBarView) {
            this.#worker.postMessage([
                'packet',
                pck,
                { width: cWidth, height: cHeight, scale: scale !== undefined ? scale : true }
            ])
            return true
        }
        return false
    }

    // Flush the codec state (destroys FFmpeg decoder context in the worker) without
    // terminating the worker itself.  Use before a stream switch so the next
    // createDecoder packet creates a fresh context and I-frames decode cleanly.
    flush() {
        this.#worker.postMessage(['stop'])
    }

    close() {
        this.#worker.postMessage(['stop'])
    }
}
