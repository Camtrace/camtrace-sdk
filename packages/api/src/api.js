import 'es6-promise/auto'
import 'isomorphic-fetch'

import CMInterface from 'CMApi/interface'
import Versions from 'CMApi/versions'
import Utils from 'CMApi/utils'
import { ApiError, ApiErrorCodes, fromFetchError } from 'CMApi/errors'

// Default timeout of the discovery request (GET /api/) and, unless overridden, of every
// HTTP request made by the returned CMInterface. Without it a silently dropped connection
// (filtered IP, captive portal) leaves the caller waiting for the OS TCP timeout.
export const DISCOVER_TIMEOUT_MS = 15000

const CamtraceApi = {
    ApiError,
    ApiErrorCodes,
    DISCOVER_TIMEOUT_MS,

    // options.timeout (ms): discovery timeout and default request timeout of the CMInterface.
    // Rejects with an ApiError (see errors.js) — never with a plain string or a raw fetch error.
    async loadApis(host, port, ssl, mobile = "on", options = {}) {
        const timeout = (typeof options.timeout === 'number') ? options.timeout : DISCOVER_TIMEOUT_MS
        const baseUrl = "http" + ((ssl) ? ("s") : ("")) + "://" + host + ((port) ? (":" + port) : (""))
        const url = baseUrl + CMInterface.API_PREFIX + "/"

        const controller = (typeof AbortController !== 'undefined' && timeout > 0) ? new AbortController() : undefined
        const timer = controller ? setTimeout(() => controller.abort(), timeout) : undefined
        const startedAt = Date.now()
        let apiResponse
        let apiData
        try {
            try {
                apiResponse = await fetch(url, {
                    method: 'GET',
                    headers: { "Content-Type": "text/plain" },
                    signal: controller ? controller.signal : undefined
                })
            } catch (error) {
                throw fromFetchError(error, url, timeout, Date.now() - startedAt)
            }
            if (!apiResponse.ok) {
                throw new ApiError(ApiErrorCodes.HTTP_ERROR,
                    'HTTP ' + apiResponse.status + (apiResponse.statusText ? ' ' + apiResponse.statusText : '') + ' on ' + url,
                    { httpStatus: apiResponse.status })
            }
            try {
                apiData = await apiResponse.json()
            } catch (error) {
                if (error && error.name === 'AbortError') throw fromFetchError(error, url, timeout)
                throw new ApiError(ApiErrorCodes.BAD_RESPONSE,
                    'Invalid API discovery response from ' + url + ' (not JSON): is this a CamTrace server?', { cause: error })
            }
        } finally {
            if (timer) clearTimeout(timer)
        }

        const latest = apiData && apiData.versions && apiData.versions.latest
        if (typeof latest !== 'string') {
            throw new ApiError(ApiErrorCodes.BAD_RESPONSE,
                'Invalid API discovery response from ' + url + ' (no versions.latest): is this a CamTrace server?')
        }
        // Calculate time difference between server time and local time in order to avoid authentication (WSSE) failure
        const timeShift = Utils.dateDiff(apiResponse.headers.get('Date'))
        if (!Versions.isSupported(latest)) {
            throw new ApiError(ApiErrorCodes.VERSION_UNSUPPORTED, 'Not compatible version (API version error): ' + latest)
        }
        if (Versions.isTooOldVersion(latest)) {
            throw new ApiError(ApiErrorCodes.VERSION_TOO_OLD, 'Server API version too old: ' + latest)
        }
        return new CMInterface(host, port, ssl, latest, mobile, timeShift, timeout)
    }
}

export { ApiError, ApiErrorCodes }
export default CamtraceApi
