const STORAGE_KEY = 'camtrace-demo-credentials'

export const state = {
    cm:      null,
    cameras: [],
}

export function saveCredentials(creds) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creds))
}

export function loadCredentials() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) } catch { return null }
}

export function clearCredentials() {
    localStorage.removeItem(STORAGE_KEY)
    state.cm      = null
    state.cameras = []
}
