import CMDecoder     from '@camtrace/decoder'
import SimpleService from './SimpleService'

export default {
    async openLiveService(cmInterface, streamUrl, protocol, type = undefined, compr = undefined) {
        let service = new SimpleService(
            async () => await cmInterface.buildLiveCameraUrl(streamUrl, protocol, type, compr),
            new CMDecoder.Live(), true
        )
        await service.connect()
        return service
    },

    async openGroupLiveService(cmInterface, camerasIds, protocol, compr = 0, w = 0, h = 0) {
        let service = new SimpleService(
            async () => await cmInterface.buildGroupLiveCameraUrl(camerasIds, protocol, compr, w, h),
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
            console.log("can't connect to control channel")
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
        let service = new SimpleService(
            async () => await cmInterface.buildReplayCameraVideoUrl(playerId, protocol),
            new CMDecoder.Record.Video(), true, true
        )
        await service.connect()
        return service
    }
}
