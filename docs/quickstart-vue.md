# Quickstart — Vue 3

Display a live H.264 stream from a CamTrace server using **Vue 3 Composition API**.

> **Bundler:** Vite (recommended) or webpack 5. See [webpack 5 configuration](quickstart-vanilla.md#webpack-5-dev-server) if needed — Vite works out of the box.

## Install

```bash
npm install @camtrace/api @camtrace/decoder @camtrace/streaming @camtrace/web-video-decoder
```

Your dev server must include these response headers (WASM SharedArrayBuffer requirement):
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Vite (`vite.config.js`):**
```js
export default {
  server: {
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
}
```

## LoginForm.vue

```vue
<script setup>
import { ref } from 'vue'
import CamtraceApi from '@camtrace/api'

const emit = defineEmits(['connected'])

const host = ref('192.168.1.100')
const port = ref(443)
const ssl  = ref(true)
const user = ref('admin')
const pass = ref('')

async function connect() {
  const cm      = await CamtraceApi.loadApis(host.value, port.value, ssl.value)
  await cm.simpleLogin(user.value, pass.value)
  const cameras = await cm.cameras()
  emit('connected', { cm, cameras })
}
</script>

<template>
  <form @submit.prevent="connect">
    <input v-model="host" placeholder="Host" />
    <input v-model="port" type="number" placeholder="Port" />
    <input v-model="user" placeholder="Username" />
    <input v-model="pass" type="password" placeholder="Password" />
    <label><input v-model="ssl" type="checkbox" /> HTTPS</label>
    <button type="submit">Connect</button>
  </form>
</template>
```

## LivePlayer.vue

```vue
<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { services } from '@camtrace/streaming'
import WebDecoder   from '@camtrace/web-video-decoder'

const props = defineProps({
  cm:     { type: Object, required: true },
  stream: { type: Object, required: true }   // cam.formatedStreams.hd
})

const canvas      = ref(null)
let   liveService = null
let   decoder     = null

async function startLive(stream) {
  stopLive()

  const ctx = canvas.value.getContext('2d')
  canvas.value.width  = stream.width  || 1280
  canvas.value.height = stream.height || 720

  decoder     = new WebDecoder()
  liveService = await services.openLiveService(props.cm, stream.url, 'video/h264')

  liveService.cmDecoder.on('packet', pck =>
    decoder.sendPacket(pck, canvas.value.width, canvas.value.height, true))

  decoder.on('decodeddata', ({ rgbData, width, height }) =>
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(rgbData), width, height), 0, 0))
}

function stopLive() {
  liveService?.forceSilentClose()
  decoder?.close()
  liveService = null
  decoder     = null
}

watch(() => props.stream, startLive, { immediate: true })
onUnmounted(stopLive)
</script>

<template>
  <canvas ref="canvas" style="background:#000; width:100%" />
</template>
```

## App.vue

```vue
<script setup>
import { ref } from 'vue'
import LoginForm  from './LoginForm.vue'
import LivePlayer from './LivePlayer.vue'

const connection    = ref(null)   // { cm, cameras }
const selectedIndex = ref(0)

const currentStream = computed(() =>
  connection.value?.cameras[selectedIndex.value]?.formatedStreams.hd
)
</script>

<template>
  <div v-if="!connection">
    <LoginForm @connected="connection = $event" />
  </div>
  <div v-else>
    <select v-model="selectedIndex">
      <option v-for="(cam, i) in connection.cameras" :key="cam.id" :value="i">
        {{ cam.name }}
      </option>
    </select>
    <LivePlayer
      v-if="currentStream"
      :cm="connection.cm"
      :stream="currentStream"
    />
  </div>
</template>
```

## What's next

- [Advanced — Record Playback](advanced-player.md)
- [`@camtrace/streaming` reference](../packages/streaming/README.md) — LivePlayer, PlaybackPlayer façades
