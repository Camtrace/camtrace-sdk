import { PlaybackPlayer } from '@camtrace/streaming'
import WebDecoder         from '@camtrace/web-video-decoder'
import { state }          from '../state.js'
import { navigate }       from '../router.js'

function pad(n) { return String(Math.floor(n)).padStart(2, '0') }

function formatHMS(sec) {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    return h > 0 ? `${pad(h)}h${pad(m)}m${pad(s)}s` : `${pad(m)}m${pad(s)}s`
}

function formatTime(unixMs) {
    const d = new Date(unixMs)
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function toLocalInput(d) {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function defaultRange() {
    const now   = new Date()
    const start = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    return { start: toLocalInput(start), end: toLocalInput(now) }
}

export default function PlaybackView(container, cameraIndex) {
    if (!state.cm || !state.cameras.length) { navigate('/'); return }


    const cam = state.cameras[cameraIndex] || state.cameras[0]
    const { start: defaultStart, end: defaultEnd } = defaultRange()

    container.innerHTML = `
      <div class="page page-player">
        <div class="header">
          <button class="back" id="back-btn">← Cameras</button>
          <h1>${cam.name}</h1>
        </div>
        <div class="player-wrap">

          <!-- Video -->
          <div class="video-container">
            <canvas class="video-canvas" id="video-canvas"></canvas>
            <div class="video-status" id="video-status">Loading timeline…</div>
          </div>

          <!-- Transport -->
          <div class="transport">
            <button class="btn btn-icon" id="btn-backward" title="Backward">◀</button>
            <button class="btn btn-icon" id="btn-stop"     title="Stop">■</button>
            <button class="btn btn-icon" id="btn-play"     title="Play forward">▶</button>
            <button class="btn btn-icon" id="btn-stepbck"  title="Prev frame">⏮</button>
            <button class="btn btn-icon" id="btn-stepfwd"  title="Next frame">⏭</button>
            <select id="speed-select" class="speed-select">
              <option value="1">1×</option>
              <option value="2">2×</option>
              <option value="4">4×</option>
              <option value="8">8×</option>
            </select>
            <div style="display:flex;gap:4px;margin-left:8px">
              <button class="btn btn-sm bartype-btn active" data-type="regul">Regular</button>
              <button class="btn btn-sm bartype-btn"        data-type="alarm">Alarm</button>
            </div>
            <span class="time-display" id="time-display">--:--</span>
          </div>

          <!-- Timeline -->
          <div id="timeline-wrap" style="display:none">
            <div class="timeline-bar" id="timeline-bar">
              <div class="timeline-recs"   id="timeline-recs"></div>
              <div class="timeline-cursor" id="timeline-cursor">
                <div class="timeline-cursor-label" id="cursor-label"></div>
              </div>
            </div>
            <div class="timeline-labels">
              <span id="tl-start">--:--:--</span>
              <span id="tl-end">--:--:--</span>
            </div>
            <div id="tl-load-info" style="font-size:.8rem;color:var(--text-dim);margin-top:4px;min-height:1.2em"></div>
          </div>

          <!-- Time range selector -->
          <div class="playback-setup">
            <div class="form-row">
              <label>From</label>
              <input type="datetime-local" id="start-time" value="${defaultStart}" />
            </div>
            <div class="form-row">
              <label>To</label>
              <input type="datetime-local" id="end-time" value="${defaultEnd}" />
            </div>
            <div style="display:flex;gap:6px;align-self:flex-end">
              <button class="btn btn-sm" data-range="30">30m</button>
              <button class="btn btn-sm active" data-range="120">2h</button>
              <button class="btn btn-sm" data-range="480">8h</button>
              <button class="btn btn-sm" id="btn-today">Today</button>
            </div>
          </div>

        </div>
      </div>
    `

    // ── DOM refs ──────────────────────────────────────────────────────────────

    const canvas         = container.querySelector('#video-canvas')
    const videoContainer = container.querySelector('.video-container')
    const statusEl       = container.querySelector('#video-status')
    const timeDisplay = container.querySelector('#time-display')
    const tlWrap      = container.querySelector('#timeline-wrap')
    const tlCursor    = container.querySelector('#timeline-cursor')
    const cursorLabel = container.querySelector('#cursor-label')
    const tlRecs      = container.querySelector('#timeline-recs')
    const tlStart     = container.querySelector('#tl-start')
    const tlEnd       = container.querySelector('#tl-end')
    const tlLoadInfo  = container.querySelector('#tl-load-info')

    // ── State ─────────────────────────────────────────────────────────────────

    let active          = true   // false once the view is torn down; guards async event-emitter callbacks
    let player          = null
    let startSec        = 0
    let endSec          = 0
    let currentSec      = 0
    let barType         = 'regul'
    let playing         = false
    let pendingSnap     = false   // true after initTimeline: snap cursor to 1st record on bar arrival
    let realFreq        = 0       // real FPS reported by server via 'rfreq' event
    let speedMultiplier = 1       // currently selected speed factor (1×, 2×, 4×, 8×)
    const barSize       = 1000
    const barCache      = {}   // stores bar char-string per type (regul, alarm, index…)

    // ── Canvas fit ───────────────────────────────────────────────────────────

    let fitRafId = null

    function fitCanvas() {
        fitRafId = null
        if (!active || !canvas.width || !canvas.height) return

        const GAP = 16  // var(--gap)

        // Measure all fixed-height elements to compute actual available height
        const headerEl    = container.querySelector('.header')
        const transportEl = container.querySelector('.transport')
        const tlWrapEl    = container.querySelector('#timeline-wrap')
        const setupEl     = container.querySelector('.playback-setup')

        const headerSpace = headerEl.offsetHeight + GAP        // offsetHeight + margin-bottom
        const transportH  = transportEl.offsetHeight
        const tlH         = tlWrapEl.style.display !== 'none' ? tlWrapEl.offsetHeight : 0
        const setupH      = setupEl.offsetHeight

        // Gaps in .player-wrap: one gap per visible non-video item
        const visibleSiblings = [transportEl, tlWrapEl, setupEl]
            .filter(el => el.style.display !== 'none').length
        const gapsTotal = visibleSiblings * GAP

        const availH = Math.max(200,
            window.innerHeight - 2 * GAP - headerSpace
            - transportH - tlH - setupH - gapsTotal - 1
        )
        const availW = videoContainer.clientWidth

        const scale = Math.min(availW / canvas.width, availH / canvas.height)
        canvas.style.width  = Math.round(canvas.width  * scale) + 'px'
        canvas.style.height = Math.round(canvas.height * scale) + 'px'
    }

    function scheduleFit() {
        if (fitRafId) cancelAnimationFrame(fitRafId)
        fitRafId = requestAnimationFrame(fitCanvas)
    }

    window.addEventListener('resize', scheduleFit)

    // ── Cursor ────────────────────────────────────────────────────────────────

    function updateTransportLimits() {
        if (!active) return
        const atStart = currentSec <= startSec
        container.querySelector('#btn-backward').disabled = atStart
        container.querySelector('#btn-stepbck').disabled  = atStart
    }

    function setCursor(posRaw) {
        const pos = parseFloat(posRaw)
        if (isNaN(pos) || endSec <= startSec) return
        currentSec = pos
        const pct = Math.max(0, Math.min(100, (pos - startSec) / (endSec - startSec) * 100))
        tlCursor.style.left     = `${pct}%`
        cursorLabel.textContent = formatTime(pos * 1000)
        timeDisplay.textContent = formatHMS(Math.max(0, pos - startSec))
        updateTransportLimits()
    }

    // ── Recording bar ─────────────────────────────────────────────────────────

    // Returns the bar-unit index (0..barSize-1) of the first real recording in charStr,
    // or -1 if none.  Uses the same character filter as drawBar.
    function findFirstRecordPos(charStr) {
        if (!charStr) return -1
        for (let i = 0; i < charStr.length; i++) {
            const ch = charStr[i]
            if (ch && ch !== 'A' && ch !== 'a' && ch.charCodeAt(0) > 0) return i
        }
        return -1
    }

    function posToSec(pos) {
        return startSec + (pos / barSize) * (endSec - startSec)
    }

    function drawBar(charStr) {
        tlRecs.innerHTML = ''
        if (!charStr) { tlLoadInfo.textContent = 'No recordings'; return }

        const total    = charStr.length
        const isAlarm  = (barType === 'alarm')
        const segs     = []
        let segStart   = null

        for (let i = 0; i <= total; i++) {
            const ch  = charStr[i]
            // 'A'/'a' = surveillance zone marker, not a recording event.
            // Both regul and alarm bars use the same check (mirrors Overlay.vue in the mobile app).
            // Alarm recordings are represented by other non-null chars in the alarm bar data.
            const has = ch && ch !== 'A' && ch !== 'a' && ch.charCodeAt(0) > 0
            if (has && segStart === null)       segStart = i
            else if (!has && segStart !== null) { segs.push([segStart / total * 100, i / total * 100]); segStart = null }
        }

        if (!segs.length) { tlLoadInfo.textContent = 'No recordings in this range'; return }

        const segClass = isAlarm ? 'timeline-seg alarm' : 'timeline-seg'
        segs.forEach(([l, r]) => {
            const seg = document.createElement('div')
            seg.className = segClass
            seg.style.left  = `${l}%`
            seg.style.width = `${Math.max(0.5, r - l)}%`
            tlRecs.appendChild(seg)
        })
        const totalSec = segs.reduce((a, [l, r]) => a + (r - l) / 100 * (endSec - startSec), 0)
        const label    = isAlarm ? 'alarm segment(s)' : 'segment(s)'
        tlLoadInfo.textContent = `${segs.length} ${label} — ${formatHMS(totalSec)}`
    }

    function handleBar(args) {
        // Format: ["<type>", "<seqnum>", "<charstring>"]  (args[2] = actual bar data)
        // Null bytes (\x00) within the string represent positions with no recording.
        // Do NOT strip them — the protocol \0 terminator is not included in WebSocket frames.
        if (!Array.isArray(args) || args.length < 3) return
        const type    = args[0]
        const charStr = args[2]
        barCache[type] = charStr          // cache every type received (init sends all at once)
        if (type === barType) {
            drawBar(charStr)
            if (pendingSnap) {
                const firstPos = findFirstRecordPos(charStr)
                if (firstPos >= 0) {
                    setCursor(posToSec(firstPos))
                    player.seek(firstPos)
                }
                pendingSnap = false
            }
        }
    }

    // ── Player lifecycle ──────────────────────────────────────────────────────

    function readRange() {
        startSec = Math.floor(new Date(container.querySelector('#start-time').value).getTime() / 1000)
        endSec   = Math.floor(new Date(container.querySelector('#end-time').value).getTime()   / 1000)
        return endSec > startSec
    }

    async function initTimeline() {
        closePlayer()
        if (!readRange()) { statusEl.textContent = 'Invalid range'; return }

        statusEl.textContent = 'Loading timeline…'
        statusEl.style.display = ''
        tlWrap.style.display = 'none'
        tlRecs.innerHTML = ''
        tlLoadInfo.textContent = ''
        playing     = false
        pendingSnap = true
        realFreq    = 0

        canvas.width  = 1280
        canvas.height = 720
        canvas.style.width  = '100%'
        canvas.style.height = 'auto'

        try {
            player = new PlaybackPlayer(state.cm, cam.id, { DecoderClass: WebDecoder })
            player.attach(canvas)

            player.on('frame', () => {
                // Canvas already resized by PlaybackPlayer before drawing (sync).
                // event-emitter-es6 dispatches this listener async (~12ms later);
                // resizing here would clear the frame that was just drawn.
                scheduleFit()
                if (statusEl.style.display !== 'none') statusEl.style.display = 'none'
            })

            player.on('ready', () => {
                statusEl.textContent = 'Loading preview…'
                tlWrap.style.display = ''
                tlStart.textContent = formatTime(startSec * 1000)
                tlEnd.textContent   = formatTime(endSec   * 1000)
                tlCursor.style.left = '0%'
                cursorLabel.textContent = ''
                currentSec = startSec
                setActiveTransport('#btn-stop')
                updateTransportLimits()
                scheduleFit()
            })

            player.on('time', pos => setCursor(pos))
            player.on('bar',  args => handleBar(args))
            player.on('rfreq', r => {
                realFreq = parseInt(r) || realFreq
                if (playing) player.setSpeed(Math.round(speedMultiplier * realFreq) || 1)
            })

            player.on('close', () => {
                // Ignore close when not playing: the server normally closes the video
                // channel after sending the initial non-timestamped preview frames.
                if (!playing) return
                playing = false
                setActiveTransport(null)
                statusEl.textContent = 'Stream closed'
                statusEl.style.display = ''
            })

            // autoOpenVideo: true opens the video channel before init so the server sends its
            // initial preview frames immediately.  The brief burst of I-frames perceived as
            // "playback" is normal server behaviour (same as mobile) — no play command is sent.
            await player.start(barType, startSec, endSec, barSize, startSec, { autoOpenVideo: true })
        } catch (err) {
            console.error('[playback]', err)
            statusEl.textContent = `Error: ${err?.message || err}`
        }
    }

    function closePlayer() {
        player?.close()
        player  = null
        playing = false
    }

    // ── Transport ─────────────────────────────────────────────────────────────

    function setActiveTransport(id) {
        container.querySelectorAll('.btn-icon').forEach(b => b.classList.remove('transport-active'))
        if (id) container.querySelector(id)?.classList.add('transport-active')
    }

    container.querySelector('#btn-play').addEventListener('click', async () => {
        if (!player) { await initTimeline(); if (!player) return }
        await player.play()
        playing = true
        setActiveTransport('#btn-play')
    })

    container.querySelector('#btn-stop').addEventListener('click', () => {
        player?.stop()
        playing = false
        setActiveTransport('#btn-stop')
    })

    container.querySelector('#btn-backward').addEventListener('click', async () => {
        if (!player) return
        await player.backward()
        playing = true
        setActiveTransport('#btn-backward')
    })

    container.querySelector('#btn-stepfwd').addEventListener('click', async () => {
        if (!playing && player) await player.stepForward()
    })
    container.querySelector('#btn-stepbck').addEventListener('click', async () => {
        if (!playing && player) await player.stepBackward()
    })

    container.querySelector('#speed-select').addEventListener('change', e => {
        speedMultiplier = parseInt(e.target.value, 10)
        // freq = multiplier × realFreq (mirrors mobile Overlay.vue::sendFreq).
        // Fall back to multiplier directly when realFreq is not yet known (rfreq not received).
        const freq = realFreq ? Math.round(speedMultiplier * realFreq) : speedMultiplier
        player?.setSpeed(freq || 1)
    })

    // ── Bar type toggle ───────────────────────────────────────────────────────

    container.querySelectorAll('.bartype-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!player) return
            barType = btn.dataset.type
            container.querySelectorAll('.bartype-btn').forEach(b => b.classList.toggle('active', b === btn))
            // Full reinit with the new barType so the server receives a fresh `init`
            // command for the correct type.  The `type` command alone only switches the
            // preview — the server still uses the original `init` type for playback,
            // causing garbled frames when the two types differ.
            // pendingSnap (set inside initTimeline) will seek to the first record of
            // the new type once bars arrive.
            initTimeline()
        })
    })

    // ── Seek by clicking on the timeline bar ──────────────────────────────────

    container.querySelector('#timeline-bar').addEventListener('click', e => {
        if (!player) return
        const rect = e.currentTarget.getBoundingClientRect()
        const pct  = (e.clientX - rect.left) / rect.width
        player.seek(Math.round(pct * barSize))
    })

    // ── Time range controls ───────────────────────────────────────────────────

    container.querySelector('#back-btn').addEventListener('click', () => { closePlayer(); navigate('/cameras') })

    function setActiveRangeBtn(el) {
        container.querySelectorAll('[data-range], #btn-today').forEach(b => b.classList.remove('active'))
        el?.classList.add('active')
    }

    container.querySelector('#btn-today').addEventListener('click', () => {
        const now   = new Date()
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        container.querySelector('#start-time').value = toLocalInput(start)
        container.querySelector('#end-time').value   = toLocalInput(now)
        setActiveRangeBtn(container.querySelector('#btn-today'))
        initTimeline()
    })

    container.querySelectorAll('[data-range]').forEach(btn =>
        btn.addEventListener('click', () => {
            setActiveRangeBtn(btn)
            const endInput = container.querySelector('#end-time')
            const end      = endInput.value ? new Date(endInput.value) : new Date()
            container.querySelector('#start-time').value =
                toLocalInput(new Date(end.getTime() - parseInt(btn.dataset.range, 10) * 60 * 1000))
            initTimeline()
        })
    )

    container.querySelectorAll('#start-time, #end-time').forEach(el =>
        el.addEventListener('change', () => { setActiveRangeBtn(null); initTimeline() })
    )

    // ── Auto-init on page load ────────────────────────────────────────────────

    initTimeline()

    return () => {
        active = false
        closePlayer()
        window.removeEventListener('resize', scheduleFit)
        if (fitRafId) { cancelAnimationFrame(fitRafId); fitRafId = null }
    }
}
