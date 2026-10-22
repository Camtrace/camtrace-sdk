export default {
    async buildServiceUrl(serviceName, args={}, override={}) {
        // after a WebSocket failure (noteStreamFailure): the token is dated with a fresh offset.
        // HTTP Basic dates nothing.
        if (this.clockSuspect && !this.basic) await this.resyncClock()
        let service = {...this.currentLoginInfos.services[serviceName], ...override};
        // HTTP Basic: the credentials go in the subprotocols (webSocketProtocols()), none in the
        // URL (the server refuses WSSE parameters beside them)
        let finalArgs = this.basic ? { ...args } : this.addAuth(args)
        if (this.mobile) {
            finalArgs._mobile = this.mobile
        }
        // Values are NOT URL-encoded, on purpose: haproxy copies _username/_password/_nonce/
        // _created_at verbatim into the X-WSSE header, and only recent scamd versions also
        // accept the decoded form. Encoding the base64 digest ('+', '/', '=') breaks the rest.
        let strArgs = Object.keys(finalArgs).map(key => key + "=" + (finalArgs[key])).join("&")
        return service.scheme + "://" + this.host + ((parseInt(service.port) != 0) ? (":" + service.port) : (":" + this.port)) + service.url + (service.url.indexOf("?") >= 0 ? "&" : "?") + strArgs
    },
    // Build url with auth parameters for connecting to a specific live camera stream on the camtrace server
    async buildLiveCameraUrl(streamUrl, accept=undefined, type=undefined, compr=undefined) {
        let args = {}
        if (typeof accept != 'undefined')
            args = { ...args, _accept: accept }
        if (typeof type != 'undefined') {
            args = { ...args, type }
            if (typeof compr != 'undefined')
                args = { ...args, compr }    
        }
        return this.buildServiceUrl("live", args, {url: streamUrl})
    },
    // Build url with auth parameters for connecting to a specific MJPEG mosaic cameras streams on the camtrace server
    async buildGroupLiveCameraUrl(camerasId, accept=undefined, compr=0, vw=0, vh=0, cols=0, rows=0,) {
        let args = { ids: camerasId.join(","), cols, rows, vw, vh, compr };
        if (typeof accept != 'undefined')
            args = { ...args, _accept: accept };
        return this.buildServiceUrl("live_mosaic", args)
    },
    // Build url with auth parameters for connecting to a specific camera player stream (replay) on the camtrace server
    async buildReplayCameraControlUrl(cameraId) {
        return this.buildServiceUrl("player_control", { id: cameraId })
    },
    // Build url with auth parameters for connecting to a specific camera player control channel on the camtrace server
    async buildReplayCameraVideoUrl(playerId, accept=undefined) {
        let args = {id: playerId}
        if (typeof accept != 'undefined')
            args = { ...args, _accept: accept }
        return this.buildServiceUrl("player_video", args)
    },
    // Build url with auth parameters for connecting to the control channel on the camtrace server
    async buildControlUrl() {
        return this.buildServiceUrl("control")
    }
}
