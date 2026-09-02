import CamtraceApi from '@camtrace/api'
import { state, saveCredentials, loadCredentials } from '../state.js'
import { navigate } from '../router.js'

export default function LoginView(container) {
    const saved = loadCredentials() || {}

    container.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <h2>CT-Server streaming demo</h2>
          <form id="login-form">
            <div class="form-row-inline">
              <div class="form-row">
                <label>Host</label>
                <input type="text" id="host" value="${saved.host || ''}" placeholder="192.168.1.100" required />
              </div>
              <div class="form-row" style="max-width:90px">
                <label>Port</label>
                <input type="number" id="port" value="${saved.port || 80}" placeholder="80" required />
              </div>
            </div>
            <div class="checkbox-row">
              <input type="checkbox" id="ssl" ${saved.ssl === true ? 'checked' : ''} />
              <label for="ssl">HTTPS / WSS</label>
            </div>
            <div class="form-row">
              <label>Username</label>
              <input type="text" id="user" value="${saved.user || ''}" placeholder="admin" required />
            </div>
            <div class="form-row">
              <label>Password</label>
              <input type="password" id="password" placeholder="••••••••" />
            </div>
            <button type="submit" class="btn btn-primary" id="submit-btn">Connect</button>
            <div class="error-msg" id="error-msg" style="display:none"></div>
          </form>
        </div>
      </div>
    `

    const form   = container.querySelector('#login-form')
    const btn    = container.querySelector('#submit-btn')
    const errEl  = container.querySelector('#error-msg')

    function showError(msg) {
        errEl.textContent = msg
        errEl.style.display = ''
    }

    function hideError() { errEl.style.display = 'none' }

    form.addEventListener('submit', async e => {
        e.preventDefault()
        hideError()
        btn.disabled    = true
        btn.textContent = 'Connecting…'

        const host = container.querySelector('#host').value.trim()
        const port = parseInt(container.querySelector('#port').value, 10)
        const ssl  = container.querySelector('#ssl').checked
        const user = container.querySelector('#user').value.trim()
        const pass = container.querySelector('#password').value

        try {
            const cm = await CamtraceApi.loadApis(host, port, ssl)
            await cm.simpleLogin(user, pass)
            const cameras = await cm.cameras()

            state.cm      = cm
            state.cameras = cameras
            saveCredentials({ host, port, ssl, user })
            navigate('/cameras')
        } catch (err) {
            // @camtrace/api rejects with an ApiError: err.code is a stable identifier
            // (NETWORK, TIMEOUT, AUTH_FAILED…), err.message a readable description
            showError((err?.message || String(err) || 'Connection failed') + (err?.code ? ` [${err.code}]` : ''))
            btn.disabled    = false
            btn.textContent = 'Connect'
        }
    })
}
