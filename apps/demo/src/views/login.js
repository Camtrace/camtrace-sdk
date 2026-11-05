import CamtraceApi, { ApiErrorCodes } from '@camtrace/api'
import { state, saveCredentials, loadCredentials } from '../state.js'
import { navigate } from '../router.js'

// While the user accepts the server's certificate in another tab, the discovery is tried again
// at this interval: the browser takes the accepted certificate without reloading this page
const CERT_RETRY_MS = 2000

export default function LoginView(container) {
    const saved = loadCredentials() || {}
    // CT-Server 17.1 and later only answer over HTTPS: HTTPS on port 443 unless HTTP was saved
    const ssl  = saved.ssl !== false
    const port = saved.port || (ssl ? 443 : 80)

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
                <input type="number" id="port" value="${port}" placeholder="443" required />
              </div>
            </div>
            <div class="checkbox-row">
              <input type="checkbox" id="ssl" ${ssl ? 'checked' : ''} />
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
            <div class="hint-msg" id="hint-msg" style="display:none"></div>
            <div class="cert-help" id="cert-help" style="display:none">
              <p>The browser may not trust the server's certificate: a CT-Server installs a self-signed one.
                 Browsers report a refused certificate as a network error, so this is a guess.</p>
              <ol>
                <li>Open <a id="cert-link" target="_blank" rel="noopener"></a> in a new tab and accept the
                    browser's warning (Chrome: <em>Advanced → Proceed</em>; Firefox: <em>Advanced → Accept the Risk
                    and Continue</em>; Safari: <em>Show Details → visit this website</em>). That page then shows the
                    server's API versions.</li>
                <li>Come back to this tab: the demo connects as soon as the server answers.</li>
              </ol>
              <div class="cert-status" id="cert-status"></div>
              <button type="button" class="btn btn-sm" id="cert-stop">Stop waiting</button>
            </div>
          </form>
        </div>
      </div>
    `

    const form       = container.querySelector('#login-form')
    const btn        = container.querySelector('#submit-btn')
    const errEl      = container.querySelector('#error-msg')
    const hintEl     = container.querySelector('#hint-msg')
    const certHelp   = container.querySelector('#cert-help')
    const certLink   = container.querySelector('#cert-link')
    const certStatus = container.querySelector('#cert-status')
    const sslInput   = container.querySelector('#ssl')
    const portInput  = container.querySelector('#port')

    // A new submit, "Stop waiting" or leaving the page ends the attempt in progress
    let attempt    = 0
    let retryTimer = null

    function describe(err) {
        // @camtrace/api rejects with an ApiError: err.code is a stable identifier
        // (NETWORK, CERTIFICATE, TIMEOUT, AUTH_FAILED…), err.message a readable description
        return (err?.message || String(err) || 'Connection failed') + (err?.code ? ` [${err.code}]` : '')
    }

    function showError(err, ssl) {
        errEl.textContent   = describe(err)
        errEl.style.display = ''
        // Over HTTP a CT-Server 17.1 redirects the discovery to HTTPS: it fails there (refused
        // certificate) or the login then finds no method usable over HTTP (AUTH_CONFIG with the
        // methods the server offers; without them it is a missing password)
        const code = err?.code
        const httpHint = !ssl && (code === ApiErrorCodes.NETWORK || code === ApiErrorCodes.CERTIFICATE
            || (code === ApiErrorCodes.AUTH_CONFIG && Array.isArray(err.authMethods)))
        hintEl.textContent   = httpHint ? 'A CT-Server 17.1 or later only answers over HTTPS: tick HTTPS / WSS (port 443).' : ''
        hintEl.style.display = httpHint ? '' : 'none'
    }

    function hideMessages() {
        errEl.style.display    = 'none'
        hintEl.style.display   = 'none'
        certHelp.style.display = 'none'
    }

    function setIdle() {
        btn.disabled    = false
        btn.textContent = 'Connect'
    }

    function stopWaiting() {
        attempt++
        clearTimeout(retryTimer)
        retryTimer = null
        certHelp.style.display = 'none'
    }

    // Over HTTPS a browser cannot tell a refused certificate from an unreachable server (NETWORK);
    // CERTIFICATE only comes from Node
    function mayBeCertificate(err, ssl) {
        return ssl && (err?.code === ApiErrorCodes.NETWORK || err?.code === ApiErrorCodes.CERTIFICATE)
    }

    function waitForCertificate(run, params, err) {
        const url = err.url || `https://${params.host}:${params.port}/api/`
        certLink.href        = url
        certLink.textContent = url
        certStatus.textContent = 'Last try ' + new Date().toLocaleTimeString() + ': ' + describe(err)
        certHelp.style.display = ''
        retryTimer = setTimeout(() => discover(run, params), CERT_RETRY_MS)
    }

    async function discover(run, params) {
        let cm
        try {
            cm = await CamtraceApi.loadApis(params.host, params.port, params.ssl)
        } catch (err) {
            if (run !== attempt) return
            if (mayBeCertificate(err, params.ssl)) {
                // The error stays shown: it may not be a certificate at all
                showError(err, params.ssl)
                setIdle()
                waitForCertificate(run, params, err)
                return
            }
            showError(err, params.ssl)
            setIdle()
            return
        }
        if (run !== attempt) return
        hideMessages()
        btn.disabled    = true
        btn.textContent = 'Connecting…'
        await login(run, cm, params)
    }

    async function login(run, cm, { host, port, ssl, user, pass }) {
        try {
            await cm.authenticate({ user, pass })
            const cameras = await cm.cameras()
            if (run !== attempt) return

            state.cm      = cm
            state.cameras = cameras
            saveCredentials({ host, port, ssl, user })
            navigate('/cameras')
        } catch (err) {
            if (run !== attempt) return
            showError(err, ssl)
            setIdle()
        }
    }

    // Port follows the protocol while it is the other one's default
    sslInput.addEventListener('change', () => {
        const value = portInput.value.trim()
        if (sslInput.checked && (value === '80' || value === '')) portInput.value = '443'
        if (!sslInput.checked && (value === '443' || value === '')) portInput.value = '80'
    })

    container.querySelector('#cert-stop').addEventListener('click', () => {
        stopWaiting()
        setIdle()
    })

    form.addEventListener('submit', e => {
        e.preventDefault()
        stopWaiting()
        hideMessages()
        btn.disabled    = true
        btn.textContent = 'Connecting…'

        const params = {
            host: container.querySelector('#host').value.trim(),
            port: parseInt(portInput.value, 10),
            ssl:  sslInput.checked,
            user: container.querySelector('#user').value.trim(),
            pass: container.querySelector('#password').value
        }
        discover(attempt, params)
    })

    return stopWaiting
}
