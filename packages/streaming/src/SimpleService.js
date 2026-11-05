import EventEmitter from 'event-emitter-es6'
import WSClient     from 'websocket-as-promised'
import { log, safeUrl, safeText } from './log'

const KEEP_ALIVE_DELAY = 30000

export default class SimpleService extends EventEmitter {
    // options.onOpenFailed(error): called synchronously when the WebSocket could not be
    // opened, or was closed by the other side before its first message: a server may accept
    // the upgrade, then drop a refused credential (e.g. cmInterface.noteStreamFailure(), so
    // the next link is dated afresh)
    // options.onOpen(): called after every successful open (connect, resume, reconnection)
    // options.beforeResume(): called when resume() starts, before the new link is built (e.g.
    // cmInterface.noteResume(): the device clock may have been changed in the background)
    // options.protocols(): the WebSocket subprotocols, read at every open with the link (e.g.
    // cmInterface.webSocketProtocols(): HTTP Basic credentials); undefined = none. Never logged.
    // Read-only state, reset on every open: `opened`, `received` (a message arrived),
    // `closingLocally` (close() was called); a 'close' listener can tell a refused open
    // (opened, nothing received, not closed locally) from a stream that played.
    // Cordova pause/resume listeners: set at construction and by every successful connect(),
    // removed by any close except pause(); a service closed for good never reopens on resume.
    constructor(linkCb, decoder, binary = false, keepAlive = false, options = {}) {
        super()
        this.linkCb = linkCb
        this.onOpenFailed = options.onOpenFailed
        this.onOpen = options.onOpen
        this.beforeResume = options.beforeResume
        this.protocolsCb = options.protocols
        this.opened = false
        this.received = false
        this.closingLocally = false
        this.link = ""
        this.protocols = undefined
        this.binary = binary
        this.keepAlive = keepAlive
        this.keepAliveFlag = false
        this.keepAliveIt = undefined
        this.ws = new WSClient(this.link, {
            createWebSocket: () => {
                let ws = this.protocols ? new WebSocket(this.link, this.protocols) : new WebSocket(this.link)
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
            this.received = true
            if (!this.keepAliveFlag) this.keepAliveFlag = true
            this.cmDecoder.write(new Buffer(data))
        })
        this.ws.onClose.addListener(e => {
            log('info', 'websocket closed', { url: safeUrl(this.link), code: e && e.code, reason: e && e.reason, wasClean: e && e.wasClean })
            if (this.opened && !this.received && !this.closingLocally && this.onOpenFailed) this.onOpenFailed(e)
            this.clearKeepAlive()
            this.emit('close', e)
            this._cleanLifecycle()
        })
        this.ws.onError.addListener(e => {
            log('warn', 'websocket error', { url: safeUrl(this.link) })
            this.emit('error', e)
        })
        // Register Cordova pause/resume events if the document is available.
        // These events are never fired in a plain browser, so this is harmless
        // in non-Cordova environments. Use setLifecycleHooks() to override.
        this._initDefaultLifecycle()
    }

    _initDefaultLifecycle() {
        this.pauseCb  = () => this.pause()
        this.resumeCb = () => this.resume()
        this._bindLifecycle()
    }

    // Idempotent: the DOM ignores a listener that is already registered
    _bindLifecycle() {
        if (typeof document !== 'undefined') {
            document.addEventListener('pause',  this.pauseCb)
            document.addEventListener('resume', this.resumeCb)
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
        this._bindLifecycle()
    }

    async genLink() {
        this.link = await this.linkCb()
        this.protocols = this.protocolsCb ? this.protocolsCb() : undefined
    }

    // One interval per service, even when connect() runs again on an open socket
    setKeepAlive() {
        this.clearKeepAlive()
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
        this.opened = false
        this.received = false
        this.closingLocally = false
        await this.genLink()
        log('info', 'websocket opening', { url: safeUrl(this.link) })
        try {
            await this.ws.open()
        } catch (error) {
            log('error', 'websocket open failed', { url: safeUrl(this.link), error: error && safeText(error.message) })
            if (this.onOpenFailed) this.onOpenFailed(error)
            throw error
        }
        log('info', 'websocket open', { url: safeUrl(this.link) })
        this.opened = true
        // A close removed the listeners: a service reconnected on the same object (the control
        // channel) follows the background again
        this._bindLifecycle()
        if (this.keepAlive) this.setKeepAlive()
        if (this.onOpen) this.onOpen()
    }

    async pause() {
        this.ws.onClose.mute()
        // onClose muted: its clearKeepAlive() does not run, and the interval would send on the
        // closed socket every 30 s, then run beside the one resume() starts
        this.clearKeepAlive()
        await this.ws.close()
    }

    async resume() {
        this.ws.onClose.unmute()
        if (this.beforeResume) this.beforeResume()
        await this.connect()
    }

    async close() {
        this.closingLocally = true
        // Closed while paused (onClose muted): the next resume must not reopen it
        this._cleanLifecycle()
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
