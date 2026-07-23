import 'es6-promise/auto'
import 'isomorphic-fetch'

import CMInterface from 'CMApi/interface'
import Versions from 'CMApi/versions'
import Utils from 'CMApi/utils'

export default {
    async loadApis(host, port, ssl, mobile="on") {
        let baseUrl = "http" + ((ssl) ? ("s") : ("")) + "://" + host + ((port) ? (":" + port) : (""))
        let discoverApiRequest = new Request(baseUrl + CMInterface.API_PREFIX + "/", {
            method: 'GET',
            headers: new Headers({ "Content-Type": "text/plain" })
        })
        let apiResponse = (await fetch(discoverApiRequest))
        let apiData = (await apiResponse.json())
    let version = ((Versions.isSupported(apiData.versions.latest)) ? (apiData.versions.latest) : (undefined))
    // Calculate time difference between server time and local time in order to avoid authentication (WSSE) failure
    let timeShift = Utils.dateDiff(apiResponse.headers.get('Date'))
        if (version) {
            if (!Versions.isTooOldVersion(version)) {
                return new CMInterface(host, port, ssl, version, mobile, timeShift)
            } else {
                throw "Server API version too old"
            }
        } else {
            throw "Not compatbile version (API version error)"
        }
    }
}
