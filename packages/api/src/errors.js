// Typed errors thrown by @camtrace/api.
//
// Every failure of loadApis(), simpleLogin(), login() and getCryptPass() is an ApiError:
//   err.code        one of ApiErrorCodes (stable identifiers, safe to switch on)
//   err.message     human-readable English text (unchanged contract for err.message users)
//   err.httpStatus  HTTP status for HTTP_ERROR / AUTH_HTTP / AUTH_FAILED
//   err.cause       the original error (fetch TypeError, AbortError, axios error…)
//
// The other endpoints (cameras(), license(), …) still reject with the raw axios error.

export const ApiErrorCodes = Object.freeze({
    NETWORK:             'NETWORK',              // DNS, connection refused, TLS, offline…
    TIMEOUT:             'TIMEOUT',              // no answer within the timeout
    BAD_RESPONSE:        'BAD_RESPONSE',         // not JSON / unexpected JSON (wrong port, proxy, captive portal)
    HTTP_ERROR:          'HTTP_ERROR',           // non-2xx status on discovery (httpStatus)
    VERSION_TOO_OLD:     'VERSION_TOO_OLD',      // server API v1 / v1.1
    VERSION_UNSUPPORTED: 'VERSION_UNSUPPORTED',  // unknown API version
    AUTH_FAILED:         'AUTH_FAILED',          // 401 after the WSSE clock-drift retry: wrong user or password
    AUTH_HTTP:           'AUTH_HTTP',            // other HTTP status during authentication (httpStatus)
    AUTH_CONFIG:         'AUTH_CONFIG'           // no WSSE salt / hash could not be computed
})

export class ApiError extends Error {
    constructor(code, message, options = {}) {
        super(message)
        this.name = 'ApiError'
        this.code = code
        this.httpStatus = options.httpStatus
        this.cause = options.cause
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

// fetch() rejection during discovery → ApiError (elapsedMs: time since the request started)
export function fromFetchError(error, url, timeout, elapsedMs = 0) {
    if (error instanceof ApiError) return error
    if (error && error.name === 'AbortError') {
        return new ApiError(ApiErrorCodes.TIMEOUT, 'Connection to ' + url + ' timed out after ' + timeout + ' ms', { cause: error })
    }
    if (elapsedMs >= SLOW_NETWORK_FAILURE_MS) {
        return new ApiError(ApiErrorCodes.TIMEOUT, 'Connection to ' + url + ' failed after ' + Math.round(elapsedMs) + ' ms (network timeout): ' + describe(error), { cause: error })
    }
    return new ApiError(ApiErrorCodes.NETWORK, 'Cannot reach ' + url + ': ' + describe(error), { cause: error })
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
        return new ApiError(auth ? ApiErrorCodes.AUTH_HTTP : ApiErrorCodes.HTTP_ERROR,
            'HTTP ' + status + statusText + (url ? ' on ' + url : ''), { httpStatus: status, cause: error })
    }
    if (error && error.code === 'ECONNABORTED') {
        return new ApiError(ApiErrorCodes.TIMEOUT, 'Request timed out' + (url ? ' on ' + url : '') + ': ' + describe(error), { cause: error })
    }
    return new ApiError(ApiErrorCodes.NETWORK, 'Cannot reach server' + (url ? ' (' + url + ')' : '') + ': ' + describe(error), { cause: error })
}
