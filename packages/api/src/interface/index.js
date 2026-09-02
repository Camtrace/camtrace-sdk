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
        this.wsse = undefined
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
            if (this.wsse) {
                let authToken = this.buildAuth()
                config.headers['Authorization'] = 'WSSE profile="UsernameToken"'
                config.headers['X-WSSE'] = 'UsernameToken Username="' + authToken.username
                    + '", PasswordDigest="' + authToken.digest
                    + '", Nonce="' + authToken.nonce
                    + '", Created="' + authToken.date + '"'
            }
            return config
        }, error => Promise.reject(error))
        axios.interceptors.request.use(function(config) {
            if (config.method === 'post' || config.method === 'put') {
              config.headers['Content-Type'] = 'application/json';
            }
            return config;
        });
        axios.interceptors.response.use(null, (error) => {
            if (error.config && error.config.url && error.response && error.response.status === 401 && this.wsse) {
                let timeShift = Utils.dateDiff(error.response.headers.date)
                if (Math.abs(timeShift - this.timeShift) > 5000) {
                    this.timeShift = timeShift;
                    let authToken = this.buildAuth()
                    error.config.headers['Authorization'] = 'WSSE profile="UsernameToken"'
                    error.config.headers['X-WSSE'] = 'UsernameToken Username="' + authToken.username
                        + '", PasswordDigest="' + authToken.digest
                        + '", Nonce="' + authToken.nonce
                        + '", Created="' + authToken.date + '"'
                    return axios.request(error.config);
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
    // Rejects with an ApiError: AUTH_CONFIG (no WSSE salt / hashing failed), AUTH_HTTP,
    // TIMEOUT or NETWORK. The salt lookup is unauthenticated: an unknown user gets a
    // decoy salt from the server and fails later in login() with AUTH_FAILED.
    async getCryptPass(user, pass) {
        let auth
        try {
            auth = (await this.latestApi().nameAuth(user))
        } catch (error) {
            throw fromAxiosError(error, { auth: true })
        }
        let methods = (auth && Array.isArray(auth.auth)) ? auth.auth : []
        let findSalt = methods.find(obj => (obj && obj.type === "wsse" && obj.salt !== undefined))
        if (!(findSalt && findSalt.salt)) {
            throw new ApiError(ApiErrorCodes.AUTH_CONFIG, 'Salt not found: no WSSE authentication configured for user "' + user + '"')
        }
        let hash = (await (new Promise((resolve, reject) => BCrypt.hash(pass, findSalt.salt, (err, hash) => ((!err) ? (resolve(hash)) : (resolve(undefined)))))))
        if (!(hash && hash.length > 0)) {
            throw new ApiError(ApiErrorCodes.AUTH_CONFIG, 'Hash not found: password hashing failed for user "' + user + '"')
        }
        return hash
    }
    // Rejects with an ApiError: AUTH_FAILED (401 after the clock-drift retry), AUTH_HTTP
    // (other status), TIMEOUT or NETWORK.
    async login(user, cryptpass) {
        this.wsse = { username: user, password: cryptpass }
        try {
            this.currentLoginInfos = await this.latestApi().login()
        } catch (error) {
            throw fromAxiosError(error, { auth: true })
        }
        return {
            cryptpass,
            permissions: this.currentLoginInfos.permissions,
            services: this.currentLoginInfos.services
        }
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
