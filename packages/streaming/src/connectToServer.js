import CamtraceApi from '@camtrace/api'
import services    from './services'

export const CTRL_CONNECT_RETRY_INTERVAL = 5000

// Pure function equivalent of the ServerInit Vue mixin's connectToServer method.
// Returns { cmInterface, cmUser, cmCtrl, cmCameras }.
// The optional appVersion string is sent as a query param to identify the client.
export async function connectToServer(server, { appVersion = '' } = {}) {
    const cmInterface = await CamtraceApi.loadApis(server.host, server.port, server.ssl, appVersion)
    const cmUser      = await cmInterface.login(server.user, server.cryptpass)
    const cmCtrl      = await services.openControlService(cmInterface)
    const cmCameras   = await cmInterface.cameras()
    return { cmInterface, cmUser, cmCtrl, cmCameras }
}
