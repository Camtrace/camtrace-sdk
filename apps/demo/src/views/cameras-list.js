import { state, clearCredentials } from '../state.js'
import { navigate } from '../router.js'

export default function CamerasView(container) {
    if (!state.cm || !state.cameras.length) {
        navigate('/')
        return
    }

    container.innerHTML = `
      <div class="page">
        <div class="header">
          <h1>CT-Server streaming demo</h1>
          <button class="back" id="disconnect-btn">Disconnect</button>
        </div>
        <div class="cameras-grid" id="cameras-grid"></div>
      </div>
    `

    container.querySelector('#disconnect-btn').addEventListener('click', () => {
        clearCredentials()
        navigate('/')
    })

    const grid = container.querySelector('#cameras-grid')

    state.cameras.forEach((cam, i) => {
        if (cam.isIgnored || cam.status === -2) return

        const card = document.createElement('div')
        card.className = 'camera-card'
        card.innerHTML = `
          <img class="camera-thumb" alt="${cam.name}" id="thumb-${i}" />
          <div class="camera-info">
            <div class="camera-name">${cam.name}</div>
            <div class="camera-actions">
              <button class="btn btn-sm" data-action="live"     data-index="${i}">▶ Live</button>
              <button class="btn btn-sm" data-action="player" data-index="${i}">⏯ Player</button>
            </div>
          </div>
        `
        grid.appendChild(card)

        state.cm.cameraImageRef(cam.id).then(url => {
            const img = container.querySelector(`#thumb-${i}`)
            if (img) img.src = url
        }).catch(() => {})
    })

    grid.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]')
        if (!btn) return
        const { action, index } = btn.dataset
        navigate(`/${action}/${index}`)
    })
}
