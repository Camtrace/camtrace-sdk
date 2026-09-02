// Optional log sink for the streaming layer. The package logs nothing by default;
// a host application can plug its own logger to trace WebSocket open/close/error
// events (the CamTrace mobile app routes them into its support diagnostic log).
//
//   import { setLogHandler } from '@camtrace/streaming'
//   setLogHandler((level, message, data) => myLogger[level]('stream', message, data))
//
// level: 'debug' | 'info' | 'warn' | 'error'. `data` is a plain object; WebSocket
// URLs are passed with their authentication query parameters already removed.

let handler = null

export function setLogHandler(fn) {
    handler = (typeof fn === 'function') ? fn : null
}

export function log(level, message, data) {
    if (!handler) return
    try {
        handler(level, message, data)
    } catch (e) {
        // a failing log sink must never break the stream
    }
}

const AUTH_PARAMS = ['_username', '_password', '_nonce', '_created_at']

// Strip WSSE authentication parameters from a service URL before logging it.
export function safeUrl(url) {
    if (typeof url !== 'string') return url
    const i = url.indexOf('?')
    if (i < 0) return url
    const query = url.slice(i + 1).split('&').filter(part => AUTH_PARAMS.indexOf(part.split('=')[0]) < 0)
    return url.slice(0, i) + (query.length ? '?' + query.join('&') : '')
}
