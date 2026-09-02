import CMDecoder     from '@camtrace/decoder'
import SimpleService from './SimpleService'
import { log }       from './log'

// The `protocol` argument of the open*Service helpers is the value of the `_accept`
// stream parameter: a CamTrace protocol variant (v1, v1a, v1b, v1c), NOT a MIME type.
// Callers that do not force one get the variant the server advertised at login, which
// is what enables H265 delivery (v1b) and audio (v1a+). Passing an unknown value
// downgrades the connection to base v1 and H265 cameras then stream nothing.
function acceptVariant(cmInterface, protocol) {
    return protocol !== undefined ? protocol : cmInterface.streamProtocol?.()
}

export default {
    async openLiveService(cmInterface, streamUrl, protocol, type = undefined, compr = undefined) {
        let accept = acceptVariant(cmInterface, protocol)
        let service = new SimpleService(
            async () => await cmInterface.buildLiveCameraUrl(streamUrl, accept, type, compr),
            new CMDecoder.Live(), true
        )
        await service.connect()
        return service
    },

    async openGroupLiveService(cmInterface, camerasIds, protocol, compr = 0, w = 0, h = 0) {
        let accept = acceptVariant(cmInterface, protocol)
        let service = new SimpleService(
            async () => await cmInterface.buildGroupLiveCameraUrl(camerasIds, accept, compr, w, h),
            new CMDecoder.Live(), true
        )
        await service.connect()
        return service
    },

    async openControlService(cmInterface) {
        let service = new SimpleService(
            async () => await cmInterface.buildControlUrl(),
            new CMDecoder.Control()
        )
        try {
            await service.connect()
            service.cmDecoder.wsseLogin(...Object.values(cmInterface.buildAuth()))
        } catch (err) {
            // The control channel is optional for the streaming layer: the service is
            // returned unconnected (check service.ws.isOpened) so the caller decides.
            log('error', 'control channel connection failed', { error: err && err.message })
        }
        return service
    },

    async openControlRecordService(cmInterface, cameraId, playerIdCb) {
        let service = new SimpleService(
            async () => await cmInterface.buildReplayCameraControlUrl(cameraId),
            new CMDecoder.Record.Control(), false, true
        )
        await service.connect()
        service.cmDecoder.on('id', playerId => playerIdCb(service, playerId))
        service.cmDecoder.createPlayer()
    },

    async openVideoRecordService(cmInterface, playerId, protocol) {
        let accept = acceptVariant(cmInterface, protocol)
        let service = new SimpleService(
            async () => await cmInterface.buildReplayCameraVideoUrl(playerId, accept),
            new CMDecoder.Record.Video(), true, true
        )
        await service.connect()
        return service
    }
}
