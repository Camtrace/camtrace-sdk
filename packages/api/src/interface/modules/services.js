export default {
    async buildServiceUrl(serviceName, args={}, override={}) {
        let service = {...this.currentLoginInfos.services[serviceName], ...override};
        let finalArgs = this.addAuth(args)
        if (this.mobile) {
            finalArgs._mobile = this.mobile
        }
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
