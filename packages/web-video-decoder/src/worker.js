// Promise that resolves when the Emscripten runtime (WASM + pthreads) is ready.
// Packets arriving before initialization is complete are awaited here so that
// Module.createDecoder / Module.decodeFrame are always available when called.
let _resolveReady
const moduleReady = new Promise(resolve => { _resolveReady = resolve })

// Override Emscripten locateFile so mp4info.wasm and mp4info.worker.js
// resolve to assets emitted by Webpack alongside this worker chunk.
self.Module = {
    locateFile: (path) => {
        if (path.endsWith('.wasm'))
            return new URL('./mp4info.wasm', import.meta.url).href
        if (path.endsWith('.worker.js'))
            return new URL('./mp4info.worker.js', import.meta.url).href
        return path
    },
    onRuntimeInitialized: () => _resolveReady()
}

const H264_SUBTYPE_DESC        = 72  // createDecoder — resets decoder state
const H264_SUBTYPE_FAKE_SPSPPS = 83  // SPS/PPS config — must precede first I-frame
const H264_SUBTYPE_IFRAME      = 73  // I-frame (referencable) — establishes reference

// After a createDecoder reset, P-frames decoded without a prior I-frame produce
// black output from the WASM module.  Guard against this by tracking readiness.
let iframeReceived  = false
let decoderCreated  = false  // true once Module.createDecoder() has been called at least once

addEventListener('message', async e => {
    if (e.data[0] == 'packet') {
        await moduleReady   // ensure WASM is fully initialised before first call
        const cb = (data, w, h) => postMessage({ rgbData: data, width: w, height: h })
        const pck = e.data[1]
        if (pck.subtype == H264_SUBTYPE_DESC) {
            iframeReceived = false
            // Destroy the existing codec context before creating a new one.
            // Module.createDecoder() alone does not flush FFmpeg's DPB (Decoded Picture
            // Buffer), so I-frames from the new stream decode against stale reference
            // frames and produce garbled output.  A full destroy+create cycle is safe
            // because createDecoder packets are always followed by SPS/PPS + I-frame.
            if (decoderCreated) Module.destroyDecoder()
            if (Module.createDecoder(pck.type) < 0)
                console.log('Erreur à la création du codec')
            decoderCreated = true
        } else if (pck.subtype == H264_SUBTYPE_FAKE_SPSPPS || pck.subtype == H264_SUBTYPE_IFRAME) {
            if (pck.subtype == H264_SUBTYPE_IFRAME) iframeReceived = true
            const infos = Module.decodeFrame(
                pck.subtype, pck.data,
                e.data[2].width, e.data[2].height, e.data[2].scale,
                cb
            )
            if (infos.errorCode < 0) console.log(infos.errorText)
        } else if (iframeReceived) {
            // P-frames and other inter frames: only decode once an I-frame is in the buffer
            const infos = Module.decodeFrame(
                pck.subtype, pck.data,
                e.data[2].width, e.data[2].height, e.data[2].scale,
                cb
            )
            if (infos.errorCode < 0) console.log(infos.errorText)
        }
    } else if (e.data[0] == 'stop') {
        await moduleReady
        iframeReceived = false
        if (decoderCreated) Module.destroyDecoder()
        decoderCreated = false
    }
})

// Load the Wasm loader generated from our Emscripten build via a URL
// that Webpack tracks as an asset/resource.
self.importScripts(new URL('./mp4info.js', import.meta.url).href)
