// Typed errors thrown by @camtrace/api.
//
// Every failure of loadApis(), authenticate(), simpleLogin(), login(), basicLogin() and
// getCryptPass() is an ApiError:
//   err.code        one of ApiErrorCodes (stable identifiers, safe to switch on)
//   err.message     human-readable English text (unchanged contract for err.message users)
//   err.httpStatus  HTTP status for HTTP_ERROR / AUTH_HTTP / AUTH_FAILED / AUTH_LOCKED / AUTH_UNAVAILABLE
//   err.cause       the original error (fetch TypeError, AbortError, axios error…)
//   err.url         loadApis(): the discovery URL (https://host:port/api/), the page a user opens
//                   to accept a self-signed certificate in a browser
//   err.authMethods AUTH_CONFIG / AUTH_FAILED (and every authenticate() refusal): the method
//                   types the server offers for the user, in its order (e.g. ['basic', 'wsse']),
//                   when they could be read
//   err.authMethod  AUTH_FAILED: the method refused, 'wsse' or 'basic'
//   err.basicWebSocket  authenticate(): false when the API accepted HTTP Basic but the server
//                   does not take it on WebSockets (before API 1.2-48, or HTTPS ended by a
//                   proxy in front of the appliance); absent otherwise
//
// The other endpoints (cameras(), license(), …) still reject with the raw axios error.

export const ApiErrorCodes = Object.freeze({
    NETWORK:             'NETWORK',              // DNS, connection refused, TLS, offline… (in a browser, also a refused certificate: browsers do not tell why)
    CERTIFICATE:         'CERTIFICATE',          // Node only: server certificate refused (self-signed, unknown CA, expired, not issued for this host)
    TIMEOUT:            'TIMEOUT',              // no answer within the timeout
    BAD_RESPONSE:        'BAD_RESPONSE',         // not JSON / unexpected JSON (wrong port, proxy, captive portal)
    HTTP_ERROR:          'HTTP_ERROR',           // non-2xx status on discovery (httpStatus)
    VERSION_TOO_OLD:     'VERSION_TOO_OLD',      // server API v1 / v1.1
    VERSION_UNSUPPORTED: 'VERSION_UNSUPPORTED',  // unknown API version
    AUTH_FAILED:         'AUTH_FAILED',          // 401 (after the WSSE clock-drift retry): wrong user or password
    AUTH_LOCKED:         'AUTH_LOCKED',          // 429 (17.1): too many failed logins for the user or from this address; password not checked
    AUTH_UNAVAILABLE:    'AUTH_UNAVAILABLE',     // 503 (17.1): password not checked (the user's directory could not be reached, or the server's authentication service did not answer or failed)
    AUTH_HTTP:           'AUTH_HTTP',            // other HTTP status during authentication (httpStatus)
    AUTH_CONFIG:         'AUTH_CONFIG'           // no WSSE salt / hash could not be computed / no method usable (authenticate())
})

export class ApiError extends Error {
    constructor(code, message, options = {}) {
        super(message)
        this.name = 'ApiError'
        this.code = code
        this.httpStatus = options.httpStatus
        this.cause = options.cause
        if (options.url) this.url = options.url
        if (options.authMethods) this.authMethods = options.authMethods
    }

    toString() {
        return this.name + ' [' + this.code + (this.httpStatus ? ' ' + this.httpStatus : '') + ']: ' + this.message
    }
}

ApiError.Codes = ApiErrorCodes

function describe(error) {
    if (!error) return String(error)
    return error.message || String(error)
}

// A network failure that took at least this long is reported as TIMEOUT: some platforms
// (Android WebView) give up on a silently dropped TCP connection on their own, a few
// seconds before our abort timer, with a generic "Failed to fetch".
export const SLOW_NETWORK_FAILURE_MS = 10000

// Node's TLS verification codes of a refused server certificate (undici puts the TLS error in
// error.cause, node-fetch and axios on the error itself). Browsers give no cause: there a refused
// certificate stays NETWORK.
const CERTIFICATE_ERROR_CODES = new Set([
    'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_UNTRUSTED', 'CERT_REJECTED',
    'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'CERT_REVOKED', 'CERT_SIGNATURE_FAILURE', 'INVALID_CA',
    'INVALID_PURPOSE', 'CERT_CHAIN_TOO_LONG', 'PATH_LENGTH_EXCEEDED', 'HOSTNAME_MISMATCH',
    'ERR_TLS_CERT_ALTNAME_INVALID'
])

// The error carrying a certificate refusal code, on the error or in its causes; undefined otherwise
export function certificateError(error) {
    for (let current = error, depth = 0; current && depth < 4; current = current.cause, depth++) {
        if (typeof current.code === 'string' && CERTIFICATE_ERROR_CODES.has(current.code)) return current
    }
    return undefined
}

// fetch() rejection during discovery → ApiError (elapsedMs: time since the request started)
export function fromFetchError(error, url, timeout, elapsedMs = 0) {
    if (error instanceof ApiError) return error
    if (error && error.name === 'AbortError') {
        return new ApiError(ApiErrorCodes.TIMEOUT, 'Connection to ' + url + ' timed out after ' + timeout + ' ms', { cause: error, url })
    }
    const refused = certificateError(error)
    if (refused) {
        return new ApiError(ApiErrorCodes.CERTIFICATE, 'Certificate of ' + url + ' refused (' + refused.code + '): ' + describe(refused), { cause: error, url })
    }
    if (elapsedMs >= SLOW_NETWORK_FAILURE_MS) {
        return new ApiError(ApiErrorCodes.TIMEOUT, 'Connection to ' + url + ' failed after ' + Math.round(elapsedMs) + ' ms (network timeout): ' + describe(error), { cause: error, url })
    }
    return new ApiError(ApiErrorCodes.NETWORK, 'Cannot reach ' + url + ': ' + describe(error), { cause: error, url })
}

// axios rejection during authentication → ApiError
export function fromAxiosError(error, options = {}) {
    if (error instanceof ApiError) return error
    const auth = !!options.auth
    const url = error && error.config && error.config.url
    if (error && error.response) {
        const status = error.response.status
        const statusText = error.response.statusText ? ' ' + error.response.statusText : ''
        if (auth && status === 401) {
            return new ApiError(ApiErrorCodes.AUTH_FAILED, 'Authentication failed (HTTP 401): wrong user name or password',
                { httpStatus: status, cause: error })
        }
        // From 17.1 the server says when it did not check the password: until then both were
        // answered 401. Neither is a verdict on the credentials (no new password to ask for).
        if (auth && status === 429) {
            return new ApiError(ApiErrorCodes.AUTH_LOCKED, 'Authentication refused (HTTP 429): too many failed logins for this user or from this address, password not checked',
                { httpStatus: status, cause: error })
        }
        if (auth && status === 503) {
            return new ApiError(ApiErrorCodes.AUTH_UNAVAILABLE, 'Authentication refused (HTTP 503): the password could not be checked (the user\'s directory could not be reached, or the server\'s authentication service did not answer or failed)',
                { httpStatus: status, cause: error })
        }
        return new ApiError(auth ? ApiErrorCodes.AUTH_HTTP : ApiErrorCodes.HTTP_ERROR,
            'HTTP ' + status + statusText + (url ? ' on ' + url : ''), { httpStatus: status, cause: error })
    }
    if (error && error.code === 'ECONNABORTED') {
        return new ApiError(ApiErrorCodes.TIMEOUT, 'Request timed out' + (url ? ' on ' + url : '') + ': ' + describe(error), { cause: error })
    }
    const refused = certificateError(error)
    if (refused) {
        return new ApiError(ApiErrorCodes.CERTIFICATE, 'Certificate of the server' + (url ? ' (' + url + ')' : '') + ' refused (' + refused.code + '): ' + describe(refused), { cause: error })
    }
    return new ApiError(ApiErrorCodes.NETWORK, 'Cannot reach server' + (url ? ' (' + url + ')' : '') + ': ' + describe(error), { cause: error })
}
