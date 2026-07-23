import Utils from './utils'

const V1  = "v1"
const V11 = "v1.1"
const V12 = "v1.2"

//Order important !
const SUPPORTEDS = [V1, V11, V12]

const LATEST     = SUPPORTEDS[SUPPORTEDS.length - 1]
const TOO_OLD    = [V1, V11]

export default {
    V1,
    V11,
    V12,

    LATEST,

    isSupported(version) {
        return SUPPORTEDS.indexOf(version) !== -1
    },
    isTooOldVersion(version) {
        return TOO_OLD.indexOf(version) !== -1
    },
    getAllSupportedVersions(version) {
        return SUPPORTEDS.slice(0, SUPPORTEDS.indexOf(version) + 1)
    },
    loadAllEndpointsInAllVersions() {
        let endpointsModulesContext = require.context("./endpoints/", false, /\.js$/)
        let endpointsModules = endpointsModulesContext.keys().map(filename => {
            return {
                version: filename.replace('./', '').replace('.js', ''),
                ...endpointsModulesContext(filename)
            }
        })
        let loadedVersions = {}
        SUPPORTEDS.forEach(version => {
            let finded = endpointsModules.find(endpointsVersion => {
                return (version === endpointsVersion.version)
            })
            if (finded) {
                loadedVersions[version] = finded.default
            }
        })
        return loadedVersions
    }
}