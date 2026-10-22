import Axios from 'axios'
import BCrypt from 'bcryptjs'
import Utils from 'CMApi/utils'
import Versions from 'CMApi/versions'
import {UsernameToken} from 'wsse'
import { ApiError, ApiErrorCodes, fromAxiosError } from 'CMApi/errors'

const ENDPOINTS_BY_VERSIONS = Versions.loadAllEndpointsInAllVersions()
const API_PREFIX = "/api"
// Per-request HTTP timeout (ms); axios 0.27 defaults to 0 = unlimited
const REQUEST_TIMEOUT_MS = 15000
// The server refuses a WSSE token created more than 2 s in its future or more than 10 s in
// its past. A 401 is retried once when the clock offset read from its Date header (1 s
// resolution) differs by more than this from the offset the request was signed with.
const CLOCK_RETRY_THRESHOLD_MS = 1000
// Clock re-read after a WebSocket failure: short, it delays the reconnection it precedes
const CLOCK_RESYNC_TIMEOUT_MS = 5000
// HTTP Basic on a WebSocket (API 1.2-48): a webview cannot set `Authorization` there, so the
// credentials are offered as the subprotocol list [BASIC_PROTOCOL, BASIC_PROTOCOL_PREFIX + b64url],
// exactly these two entries in this order; the server answers BASIC_PROTOCOL
const BASIC_PROTOCOL = 'camtrace'
const BASIC_PROTOCOL_PREFIX = 'camtrace-basic.'

function authMethods(auth) {
    return (auth && Array.isArray(auth.auth)) ? auth.auth : []
}

function authMethodTypes(auth) {
    return authMethods(auth).map(method => method && method.type).filter(Boolean)
}

// Base64 of a UTF-8 string, without Buffer (the bundle also runs in browsers and webviews)
function utf8Base64(text) {
    let binary = ''
    new TextEncoder().encode(text).forEach(byte => { binary += String.fromCharCode(byte) })
    return btoa(binary)
}

// base64url without padding: '=' and '/' are not allowed in a subprotocol name (SyntaxError)
function base64Url(base64) {
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Resolves to the BCrypt hash of the password with the server's salt, undefined on failure
function hashPassword(pass, salt) {
    return new Promise(resolve => BCrypt.hash(pass, salt, (err, hash) => resolve((!err) ? hash : undefined)))
}

class CMInterface {
    constructor(host, port, ssl, serverVersion, mobile=undefined, timeShift=0, requestTimeout=REQUEST_TIMEOUT_MS) {
        this.host = host
        this.port = port
        this.ssl = ssl
        this.mobile = mobile
        this.timeShift = timeShift
        this.requestTimeout = (typeof requestTimeout === 'number') ? requestTimeout : REQUEST_TIMEOUT_MS
        this.apis = this.buildApis(serverVersion)
        this.currentLoginInfos = undefined
        // One active method: `wsse` ({ username, password: cryptpass }) or `basic` ({ username, credential: base64 of user:pass })
        this.wsse = undefined
        this.basic = undefined
        this.clockSuspect = false
        this.clockResync = undefined
    }
    buildApis(serverVersion) {
        let apis = {}
        let axiosConfig = {
            params: {},
            timeout: this.requestTimeout,
            responseType: 'text',
            headers: {
                'Content-Type': 'text/plain'
            },
            data: {}
        }
        let axios = Axios.create(axiosConfig)
        axios.interceptors.request.use(config => {
            if (this.wsse && !config.anonymous) {
                config.signedTimeShift = this.timeShift
                let authToken = this.buildAuth()
                config.headers['Authorization'] = 'WSSE profile="UsernameToken"'
                config.headers['X-WSSE'] = 'UsernameToken Username="' + authToken.username
                    + '", PasswordDigest="' + authToken.digest
                    + '", Nonce="' + authToken.nonce
                    + '", Created="' + authToken.date + '"'
            } else if (this.basic && !config.anonymous) {
                config.headers['Authorization'] = 'Basic ' + this.basic.credential
            }
            return config
        }, error => Promise.reject(error))
        axios.interceptors.request.use(function(config) {
            if (config.method === 'post' || config.method === 'put') {
              config.headers['Content-Type'] = 'application/json';
            }
            return config;
        });
        // A 401 caused by a clock that moved since the request was signed is retried once, with
        // the offset read from the answer (the request interceptor signs the retry with a new
        // token). Compared with the signing offset, not the current one: another answer or a
        // clock re-read may already have corrected it while this request was in flight.
        // No Date header readable (older server not exposing it): nothing to correct.
        axios.interceptors.response.use(null, (error) => {
            const config = error.config
            if (config && config.url && !config.anonymous && !config.clockRetried && error.response
                    && error.response.status === 401 && this.wsse && error.response.headers && error.response.headers.date) {
                const timeShift = Utils.dateDiff(error.response.headers.date)
                const signedTimeShift = (typeof config.signedTimeShift === 'number') ? config.signedTimeShift : this.timeShift
                if (Math.abs(timeShift - signedTimeShift) > CLOCK_RETRY_THRESHOLD_MS) {
                    this.timeShift = timeShift
                    config.clockRetried = true
                    return axios.request(config)
                }
            }
            return Promise.reject(error)
        })

        Versions.getAllSupportedVersions(serverVersion)
            .filter(version => ENDPOINTS_BY_VERSIONS[version])
            .forEach(version => apis[version] = new ENDPOINTS_BY_VERSIONS[version](axios, this.buildUrl(API_PREFIX + "/" + version)))
        return apis
    }
    api(version) {
        return this.apis[version]
    }
    latestApi() {
        return this.api(Versions.LATEST)
    }
    version() {
        let versions = Object.keys(this.apis)
        return versions[versions.length - 1]
    }
    hasVersion(version) {
        return this.apis[version] !== undefined
    }
    async simpleLogin(user, pass) {
        return (await this.login(user, (await this.getCryptPass(user, pass))))
    }
    // Rejects with an ApiError: AUTH_CONFIG (no WSSE salt / hashing failed; authMethods =
    // the methods offered, e.g. ['basic'] for an account that needs HTTP Basic), AUTH_HTTP, TIMEOUT or
    // NETWORK. The salt lookup is unauthenticated: an unknown user gets a decoy salt from
    // the server and fails later in login() with AUTH_FAILED.
    async getCryptPass(user, pass) {
        let auth
        try {
            auth = (await this.latestApi().nameAuth(user))
        } catch (error) {
            throw fromAxiosError(error, { auth: true })
        }
        let findSalt = authMethods(auth).find(obj => (obj && obj.type === "wsse" && obj.salt !== undefined))
        if (!(findSalt && findSalt.salt)) {
            throw new ApiError(ApiErrorCodes.AUTH_CONFIG, 'Salt not found: no WSSE authentication configured for user "' + user + '"',
                { authMethods: authMethodTypes(auth) })
        }
        let hash = await hashPassword(pass, findSalt.salt)
        if (!(hash && hash.length > 0)) {
            throw new ApiError(ApiErrorCodes.AUTH_CONFIG, 'Hash not found: password hashing failed for user "' + user + '"')
        }
        return hash
    }
    // WSSE login. Rejects with an ApiError: AUTH_FAILED (401 after the clock-drift retry;
    // authMethod 'wsse'; authMethods = the methods the server offers, read again without
    // credentials, when it answers), AUTH_HTTP (other status), TIMEOUT or NETWORK.
    async login(user, cryptpass) {
        this.basic = undefined
        this.wsse = { username: user, password: cryptpass }
        try {
            this.currentLoginInfos = await this.latestApi().login()
        } catch (error) {
            const apiError = fromAxiosError(error, { auth: true })
            if (apiError.code === ApiErrorCodes.AUTH_FAILED) {
                apiError.authMethod = 'wsse'
                // `basic` offered: the account may need HTTP Basic (authenticate() with the password)
                try {
                    apiError.authMethods = authMethodTypes(await this.latestApi().nameAuth(user))
                } catch (ignored) { /* the refusal stands on its own */ }
            }
            throw apiError
        }
        return {
            method: 'wsse',
            cryptpass,
            permissions: this.currentLoginInfos.permissions,
            services: this.currentLoginInfos.services,
            capabilities: this.currentLoginInfos.capabilities
        }
    }
    // HTTP Basic login (17.1): the password goes with every API request (`Authorization: Basic`)
    // and, through webSocketProtocols(), with every WebSocket opening; the server checks a user
    // and password once a minute, and no clock is involved. The WebSockets only take it when
    // basicWebSocket() is true. Rejects with an ApiError like login(); a 401 is AUTH_FAILED with
    // authMethod 'basic'.
    async basicLogin(user, pass) {
        this.wsse = undefined
        this.basic = { username: user, credential: utf8Base64(user + ':' + pass) }
        try {
            this.currentLoginInfos = await this.latestApi().login()
        } catch (error) {
            const apiError = fromAxiosError(error, { auth: true })
            if (apiError.code === ApiErrorCodes.AUTH_FAILED) apiError.authMethod = 'basic'
            throw apiError
        }
        return {
            method: 'basic',
            permissions: this.currentLoginInfos.permissions,
            services: this.currentLoginInfos.services,
            capabilities: this.currentLoginInfos.capabilities
        }
    }
    // The server takes HTTP Basic on the WebSockets of this login (API 1.2-48): announced by
    // GET /users/login when the request reached the appliance over HTTPS
    basicWebSocket() {
        return this.currentLoginInfos?.capabilities?.webSocket?.basicProtocol === true
    }
    // Logs in with the method the server allows, given what the caller kept:
    //  - cryptpass only: WSSE (login()), the methods are not read;
    //  - pass: the first method of GET /users/{name}/auth this client can use, in the server's
    //    order: `basic` over HTTPS when the server also takes it on WebSockets (basicWebSocket(),
    //    read from the Basic login itself), `wsse` when a salt is given.
    // Resolves to the result of basicLogin() or login(): keep `pass` for method 'basic' (it is
    // sent with every request and WebSocket), only `cryptpass` for 'wsse'. Rejects with an
    // ApiError carrying authMethods (the methods offered): AUTH_FAILED (authMethod: the method
    // refused; a Basic refusal is never retried with WSSE), AUTH_CONFIG (no usable method),
    // AUTH_LOCKED, AUTH_UNAVAILABLE…, with basicWebSocket: false when the API accepted Basic
    // but the WebSockets would not.
    async authenticate({ user, pass, cryptpass } = {}) {
        if (!pass) {
            if (!cryptpass) throw new ApiError(ApiErrorCodes.AUTH_CONFIG, 'No password given for user "' + user + '"')
            return await this.login(user, cryptpass)
        }
        let auth
        try {
            auth = await this.latestApi().nameAuth(user)
        } catch (error) {
            throw fromAxiosError(error, { auth: true })
        }
        const offered = authMethodTypes(auth)
        let basicWebSocket = true
        const withContext = apiError => {
            apiError.authMethods = offered
            if (!basicWebSocket) apiError.basicWebSocket = false
            return apiError
        }
        for (const method of authMethods(auth)) {
            if (method && method.type === 'basic' && this.ssl) {
                let account
                try {
                    account = await this.basicLogin(user, pass)
                } catch (error) {
                    throw withContext(error)
                }
                if (this.basicWebSocket()) return account
                // Right password, but the WebSockets would refuse Basic (server before API 1.2-48,
                // or HTTPS ended by a proxy in front of the appliance): next method
                this.basic = undefined
                this.currentLoginInfos = undefined
                basicWebSocket = false
            } else if (method && method.type === 'wsse' && method.salt) {
                const hash = await hashPassword(pass, method.salt)
                if (!(hash && hash.length > 0)) {
                    throw withContext(new ApiError(ApiErrorCodes.AUTH_CONFIG, 'Hash not found: password hashing failed for user "' + user + '"'))
                }
                try {
                    return await this.login(user, hash)
                } catch (error) {
                    throw withContext(error)
                }
            }
        }
        throw withContext(new ApiError(ApiErrorCodes.AUTH_CONFIG, 'No usable authentication method for user "' + user + '" (offered: '
            + (offered.join(', ') || 'none') + (this.ssl ? '' : ', over HTTP') + ')'))
    }
    // 'basic' or 'wsse': the method of the last login (also set by a refused one), undefined before
    authMethod() {
        return this.basic ? 'basic' : (this.wsse ? 'wsse' : undefined)
    }
    // Subprotocols to open a WebSocket with: the HTTP Basic pair after basicLogin(), undefined
    // with WSSE (its credentials go in the URL, see addAuth())
    webSocketProtocols() {
        if (!this.basic) return undefined
        return [BASIC_PROTOCOL, BASIC_PROTOCOL_PREFIX + base64Url(this.basic.credential)]
    }
    // Protocol variant to send as the `_accept` parameter of the stream URLs.
    // HAProxy rewrites it into `Accept: application/vnd.camtrace.<value>`, which is
    // how the server decides what a client can receive:
    //   v1 = base, v1a = +audio, v1b = +H265/shadow frames, v1c = +analytics metadata.
    // An unknown value (e.g. a MIME type) downgrades the connection to v1, so an
    // H265 camera then streams nothing at all.  Returns undefined on servers that
    // predate the field — the stream falls back to v1, which is the correct behaviour.
    streamProtocol() {
        return this.currentLoginInfos?.services?.mobile?.stream_protocol
    }
    buildUrl(href = "") {
        return "http" + ((this.ssl) ? ("s") : ("")) + "://" + this.host + ((this.port) ? (":" + this.port) : ("")) + href
    }
    // A WebSocket built from this interface could not be opened. JS gets no status for a
    // refused upgrade, so a clock that moved since discovery cannot be told apart from a
    // network failure: the next service URL is built after reading the server clock again.
    noteStreamFailure() {
        this.clockSuspect = true
    }
    // The app is back from the background, where the device clock may have been set or
    // corrected: the next service URL is built after reading the server clock again. A
    // refused token costs a counted refusal, and scamd (17.1) then refuses every credential
    // of that name from that address for 10 s, whatever comes.
    noteResume() {
        this.clockSuspect = true
    }
    // Reads the server clock again (anonymous GET /api/). Concurrent calls share one request.
    // Resolves to { ok, previous, timeShift, error? } (offsets in ms); a failure keeps the
    // current offset.
    resyncClock() {
        if (!this.clockResync) {
            this.clockSuspect = false
            const previous = this.timeShift
            this.clockResync = Axios.get(this.buildUrl(API_PREFIX + "/"), {
                timeout: CLOCK_RESYNC_TIMEOUT_MS,
                responseType: 'text',
                headers: { 'Content-Type': 'text/plain' }
            }).then(response => {
                if (!(response.headers && response.headers.date)) throw new Error('no readable Date header')
                this.timeShift = Utils.dateDiff(response.headers.date)
                return { ok: true, previous, timeShift: this.timeShift }
            }).catch(error => ({ ok: false, previous, timeShift: this.timeShift, error: (error && error.message) || String(error) }))
              .then(result => { this.clockResync = undefined; return result })
        }
        return this.clockResync
    }
    buildAuth() {
        let created = new Date(Date.now() - this.timeShift);
        this.wsse.created = created.toISOString();
        let token = new UsernameToken(this.wsse)
        return {
            username: token.getUsername(),
            digest: token.getPasswordDigest(),
            nonce: token.getNonce(),
            date: token.getCreated()
        }
    }
    addAuth(args={}) {
        let authToken = this.buildAuth()
        return {
            ...args,
            _username:      authToken.username,
            _password:      authToken.digest,
            _nonce:         authToken.nonce,
            _created_at:    authToken.date,
        }
    }
}

Utils.requireAll(require.context("./modules/", false, /\.js$/)).forEach(module => {
    Object.assign(CMInterface.prototype, module.default)
})

CMInterface.API_PREFIX = API_PREFIX

export default CMInterface
