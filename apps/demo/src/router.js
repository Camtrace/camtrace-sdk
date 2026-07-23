import LoginView     from './views/login.js'
import CamerasView   from './views/cameras-list.js'
import LiveView      from './views/live.js'
import PlaybackView  from './views/playback.js'

const ROUTES = {
    '/':         LoginView,
    '/cameras':  CamerasView,
    '/live':     LiveView,
    '/player':   PlaybackView,
}

let currentDestroy = null
let container      = null

function parseHash() {
    const hash   = window.location.hash.slice(1) || '/'
    const parts  = hash.split('/')
    const path   = '/' + (parts[1] || '')
    const param  = parts[2] !== undefined ? parseInt(parts[2], 10) : null
    return { path, param }
}

function render() {
    const { path, param } = parseHash()
    if (currentDestroy) { currentDestroy(); currentDestroy = null }
    container.innerHTML = ''
    const View = ROUTES[path] || ROUTES['/']
    currentDestroy = View(container, param) || null
}

export function navigate(path) {
    window.location.hash = path
}

export function init(el) {
    container = el
    window.addEventListener('hashchange', render)
    render()
}
