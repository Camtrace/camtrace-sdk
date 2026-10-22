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

// A WebSocket that cannot be opened, or that resumes after the app was in the background,
// marks the interface: its next URL is built after the server clock has been read again (a
// refused WSSE token gives JS no status to go on, and costs a counted refusal).
// After an HTTP Basic login the subprotocols carry the credentials (none with WSSE).
function serviceOptions(cmInterface) {
    return {
        onOpenFailed: () => cmInterface.noteStreamFailure?.(),
        beforeResume: () => cmInterface.noteResume?.(),
        protocols: () => cmInterface.webSocketProtocols?.()
    }
}

// scamd (17.1) refuses every credential of a name from an address for 10 s after a refused
// one, whatever comes: a login sent again sooner is refused unasked.
const RELOGIN_DELAY_MS = 11000
// The offset must have moved by more than this for a refused login to be sent again
const RELOGIN_MIN_SHIFT_MS = 1000

export default {
    async openLiveService(cmInterface, streamUrl, protocol, type = undefined, compr = undefined) {
        let accept = acceptVariant(cmInterface, protocol)
        let service = new SimpleService(
            async () => await cmInterface.buildLiveCameraUrl(streamUrl, accept, type, compr),
            new CMDecoder.Live(), true, false, serviceOptions(cmInterface)
        )
        await service.connect()
        return service
    },

    async openGroupLiveService(cmInterface, camerasIds, protocol, compr = 0, w = 0, h = 0) {
        let accept = acceptVariant(cmInterface, protocol)
        let service = new SimpleService(
            async () => await cmInterface.buildGroupLiveCameraUrl(camerasIds, accept, compr, w, h),
            new CMDecoder.Live(), true, false, serviceOptions(cmInterface)
        )
        await service.connect()
        return service
    },

    // The control channel opens even when the token of its URL is refused (a clock that moved
    // since discovery): the session then stays unauthenticated and silent. So the login line
    // is sent on every open (reconnections and resume included) and its answer is read:
    // `nologin` → the server clock is read again and, only when the offset moved, the line is
    // sent once more on the same connection once the server's 10 s pause is over, never more
    // (a wrong password must not feed the server's brute-force limiter).
    // HTTP Basic: the opening authenticates the channel and the historic login line only reads
    // the verdict; `nologin` (password changed, directory unreachable) is not retried.
    async openControlService(cmInterface) {
        let relogged = false
        let opens = 0
        const basic = () => cmInterface.authMethod?.() === 'basic'
        const login = () => basic()
            ? service.cmDecoder.legacyLogin(cmInterface.basic.username)
            : service.cmDecoder.wsseLogin(...Object.values(cmInterface.buildAuth()))
        const service = new SimpleService(
            async () => await cmInterface.buildControlUrl(),
            new CMDecoder.Control(), false, false,
            { ...serviceOptions(cmInterface), onOpen: () => { opens++; relogged = false; login() } }
        )
        service.cmDecoder.on('nologin', async () => {
            if (relogged || basic()) {
                log('error', 'control channel login refused')
                return
            }
            relogged = true
            const open = opens
            log('warn', 'control channel login refused: reading the server clock again')
            const clock = await cmInterface.resyncClock?.()
            if (!clock) return login()
            const moved = clock.ok && Math.abs(clock.timeShift - clock.previous) > RELOGIN_MIN_SHIFT_MS
            log(moved ? 'info' : 'warn', 'server clock read again', { ...clock, relogin: moved ? RELOGIN_DELAY_MS : false })
            if (!moved) return
            await new Promise(resolve => setTimeout(resolve, RELOGIN_DELAY_MS))
            if (open === opens && service.ws.isOpened) login()
        })
        try {
            await service.connect()
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
            new CMDecoder.Record.Control(), false, true, serviceOptions(cmInterface)
        )
        await service.connect()
        service.cmDecoder.on('id', playerId => playerIdCb(service, playerId))
        service.cmDecoder.createPlayer()
    },

    async openVideoRecordService(cmInterface, playerId, protocol) {
        let accept = acceptVariant(cmInterface, protocol)
        let service = new SimpleService(
            async () => await cmInterface.buildReplayCameraVideoUrl(playerId, accept),
            new CMDecoder.Record.Video(), true, true, serviceOptions(cmInterface)
        )
        await service.connect()
        return service
    }
}
