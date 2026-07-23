# @camtrace/web-video-decoder

> **Note:** This is a generic FFmpeg-WASM video decoder provided as a reference implementation to show that the full streaming chain works end-to-end in a browser. It is **not** a CamTrace-specific component. You are free to substitute your own decoder (e.g. [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API), another WASM decoder, or a native SDK decoder) as long as it consumes the `packet` events emitted by `@camtrace/decoder`.

Decodes H.264, H.265, and MPEG-4 video frames using FFmpeg 7.1 LTS compiled to WebAssembly via Emscripten. Runs inside a Web Worker to keep the main thread unblocked.

## Usage

```js
import WebDecoder from '@camtrace/web-video-decoder'

const decoder = new WebDecoder()
const canvas  = document.getElementById('video')
const ctx     = canvas.getContext('2d')

// Feed packets from @camtrace/decoder
liveService.cmDecoder.on('packet', pck => {
  decoder.sendPacket(pck, canvas.width, canvas.height, /* scale */ true)
})

// Receive decoded RGBA frames
decoder.on('decodeddata', ({ rgbData, width, height }) => {
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(rgbData), width, height),
    0, 0
  )
})

// Cleanup
decoder.close()
```

## API

### `new WebDecoder()`

Creates a decoder instance and spawns a Web Worker.

### `decoder.sendPacket(pck, canvasWidth, canvasHeight, scale)`

Sends a video packet (from `@camtrace/decoder`'s `packet` event) to the worker for decoding.

- `pck` — packet object with `{ name, subtype, data, width?, height?, fps? }`
- `canvasWidth` / `canvasHeight` — target output dimensions
- `scale` — `true` to letterbox/fit the frame into the canvas dimensions

### `decoder.close()`

Stops the decoder and terminates the worker.

### Event: `decodeddata`

```js
decoder.on('decodeddata', ({ rgbData, width, height }) => { … })
```

- `rgbData` — `Uint8Array` of RGBA pixel data (4 bytes per pixel)
- `width` / `height` — actual decoded frame dimensions

## Supported codecs

`h264`, `h265`, `mpeg4`

JPEG frames are not sent to this decoder — they can be rendered directly via a canvas `drawImage()` with a `Blob` URL.

## Requirements

### Browser

- **SharedArrayBuffer** — required by the WASM pthreads model
- **COOP / COEP headers** on the server:
  ```
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```

### Bundler

This package is consumed **as source** — it must be processed by the consuming bundler, not pre-compiled. The Web Worker and WASM assets are declared via `new URL('./worker.js', import.meta.url)` patterns which **webpack 5** and **Vite** detect statically and emit as separate chunks.

**webpack 5 configuration:**

```js
module.exports = {
  module: {
    rules: [{
      test: /\.js$/,
      exclude: {
        and: [/node_modules/],
        not: [/web-video-decoder/]   // re-include this package for transpilation
      },
      use: [{ loader: 'babel-loader' }]
    }]
  },
  // Required when using workspace symlinks:
  resolve: { symlinks: false }
}
```

**Vite:** no additional configuration needed — Vite handles `import.meta.url` and Web Workers natively.
