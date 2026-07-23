import EventEmitter from 'event-emitter-es6'
import WSClient     from 'websocket-as-promised'

const KEEP_ALIVE_DELAY = 30000

export default class SimpleService extends EventEmitter {
    constructor(linkCb, decoder, binary = false, keepAlive = false) {
        super()
        this.linkCb = linkCb
        this.link = ""
        this.binary = binary
        this.keepAlive = keepAlive
        this.keepAliveFlag = false
        this.keepAliveIt = undefined
        this.ws = new WSClient(this.link, {
            createWebSocket: () => {
                let ws = new WebSocket(this.link)
                if (this.binary) ws.binaryType = 'arraybuffer'
                return ws
            }
        })
        this.cmDecoder = decoder
        this.cmDecoder.on('send', data => {
            if (this.ws && this.ws.isOpened) {
                if (!this.keepAliveFlag) this.keepAliveFlag = true
                this.ws.send(data)
            }
        })
        this.ws.onMessage.addListener((data) => {
            if (!this.keepAliveFlag) this.keepAliveFlag = true
            this.cmDecoder.write(new Buffer(data))
        })
        this.ws.onClose.addListener(e => {
            this.clearKeepAlive()
            this.emit('close', e)
            this._cleanLifecycle()
        })
        this.pauseCb = () => {}
        this.resumeCb = () => {}
        // Register Cordova pause/resume events if the document is available.
        // These events are never fired in a plain browser, so this is harmless
        // in non-Cordova environments. Use setLifecycleHooks() to override.
        this._initDefaultLifecycle()
    }

    _initDefaultLifecycle() {
        if (typeof document !== 'undefined') {
            document.addEventListener('pause',  (this.pauseCb  = () => this.pause()))
            document.addEventListener('resume', (this.resumeCb = () => this.resume()))
        }
    }

    _cleanLifecycle() {
        if (typeof document !== 'undefined') {
            document.removeEventListener('pause',  this.pauseCb)
            document.removeEventListener('resume', this.resumeCb)
        }
    }

    // Override lifecycle hooks (e.g. for Cordova adapters or custom implementations)
    setLifecycleHooks({ onPause, onResume }) {
        this._cleanLifecycle()
        this.pauseCb  = onPause  || (() => {})
        this.resumeCb = onResume || (() => {})
        if (typeof document !== 'undefined') {
            document.addEventListener('pause',  this.pauseCb)
            document.addEventListener('resume', this.resumeCb)
        }
    }

    async genLink() {
        this.link = await this.linkCb()
    }

    setKeepAlive() {
        this.keepAliveIt = setInterval(() => {
            if (!this.keepAliveFlag) {
                if (this.binary) this.ws.send(new Uint8Array([0]))
                else             this.ws.send(" \0")
            }
            this.keepAliveFlag = false
        }, KEEP_ALIVE_DELAY)
    }

    clearKeepAlive() {
        if (this.keepAliveIt != undefined) {
            clearInterval(this.keepAliveIt)
            this.keepAliveIt = undefined
        }
    }

    async connect() {
        await this.genLink()
        await this.ws.open()
        if (this.keepAlive) this.setKeepAlive()
    }

    async pause() {
        this.ws.onClose.mute()
        await this.ws.close()
    }

    async resume() {
        this.ws.onClose.unmute()
        await this.connect()
    }

    async close() {
        await this.ws.close()
    }

    async forceSilentClose() {
        this.ws.onMessage.mute()
        this.ws.onClose.mute()
        this.clearKeepAlive()
        this._cleanLifecycle()
        await this.ws.close()
    }

    getStreamId() {
        let res = "?"
        let i = this.link.indexOf("v?id=")
        if (i >= 0) {
            i += 5
            let j = this.link.indexOf("&", i)
            res = j >= 0 ? this.link.substring(i, j) : this.link.substring(i)
        }
        return res
    }
}
