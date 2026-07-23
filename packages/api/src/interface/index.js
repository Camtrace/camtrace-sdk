import Axios from 'axios'
import BCrypt from 'bcryptjs'
import Utils from 'CMApi/utils'
import Versions from 'CMApi/versions'
import {UsernameToken} from 'wsse'

const ENDPOINTS_BY_VERSIONS = Versions.loadAllEndpointsInAllVersions()
const API_PREFIX = "/api"

class CMInterface {
    constructor(host, port, ssl, serverVersion, mobile=undefined, timeShift=0) {
        this.host = host
        this.port = port
        this.ssl = ssl
        this.mobile = mobile
        this.timeShift = timeShift
        this.apis = this.buildApis(serverVersion)
        this.currentLoginInfos = undefined
        this.wsse = undefined
    }
    buildApis(serverVersion) {
        let apis = {}
        let axiosConfig = {
            params: {},
            responseType: 'text',
            headers: {
                'Content-Type': 'text/plain'
            },
            data: {}
        }
        let axios = Axios.create(axiosConfig)
        axios.interceptors.request.use(config => {
            if (this.wsse) {
                let authToken = this.buildAuth()
                config.headers['Authorization'] = 'WSSE profile="UsernameToken"'
                config.headers['X-WSSE'] = 'UsernameToken Username="' + authToken.username
                    + '", PasswordDigest="' + authToken.digest
                    + '", Nonce="' + authToken.nonce
                    + '", Created="' + authToken.date + '"'
            }
            return config
        }, error => Promise.reject(error))
        axios.interceptors.request.use(function(config) {
            if (config.method === 'post' || config.method === 'put') {
              config.headers['Content-Type'] = 'application/json';
            }
            return config;
        });
        axios.interceptors.response.use(null, (error) => {
            if (error.config && error.config.url && error.response && error.response.status === 401 && this.wsse) {
                let timeShift = Utils.dateDiff(error.response.headers.date)
                if (Math.abs(timeShift - this.timeShift) > 5000) {
                    this.timeShift = timeShift;
                    let authToken = this.buildAuth()
                    error.config.headers['Authorization'] = 'WSSE profile="UsernameToken"'
                    error.config.headers['X-WSSE'] = 'UsernameToken Username="' + authToken.username
                        + '", PasswordDigest="' + authToken.digest
                        + '", Nonce="' + authToken.nonce
                        + '", Created="' + authToken.date + '"'
                    return axios.request(error.config);
                }
            }
            return Promise.reject(error)
        })

        Versions.getAllSupportedVersions(serverVersion)
            .filter(version => ENDPOINTS_BY_VERSIONS[version])
            .forEach(version => apis[version] = new ENDPOINTS_BY_VERSIONS[version](axios, this.buildUrl(API_PREFIX + "/" + version)))
        return apis
    }
    api(version) {
        return this.apis[version]
    }
    latestApi() {
        return this.api(Versions.LATEST)
    }
    version() {
        let versions = Object.keys(this.apis)
        return versions[versions.length - 1]
    }
    hasVersion(version) {
        return this.apis[version] !== undefined
    }
    async simpleLogin(user, pass) {
        return (await this.login(user, (await this.getCryptPass(user, pass))))
    }
    async getCryptPass(user, pass) {
        let auth = (await this.latestApi().nameAuth(user))
        let findSalt = auth.auth.find(obj => (obj.type === "wsse" && obj.salt !== undefined))
        if (findSalt && findSalt.salt) {
            let hash = (await (new Promise((resolve, reject) => BCrypt.hash(pass, findSalt.salt, (err, hash) => ((!err) ? (resolve(hash)) : (resolve(undefined)))))))
            if (hash && hash.length > 0) {
                return hash
            } else {
                throw "Hash not found !"                
            }
        } else {
            throw "Salt not found !"
        }
    }
    async login(user, cryptpass) {
        this.wsse = { username: user, password: cryptpass }
        this.currentLoginInfos = await this.latestApi().login()
        return {
            cryptpass,
            permissions: this.currentLoginInfos.permissions,
            services: this.currentLoginInfos.services
        }
    }
    buildUrl(href = "") {
        return "http" + ((this.ssl) ? ("s") : ("")) + "://" + this.host + ((this.port) ? (":" + this.port) : ("")) + href
    }
    buildAuth() {
        let created = new Date(Date.now() - this.timeShift);
        this.wsse.created = created.toISOString();
        let token = new UsernameToken(this.wsse)
        return {
            username: token.getUsername(),
            digest: token.getPasswordDigest(),
            nonce: token.getNonce(),
            date: token.getCreated()
        }
    }
    addAuth(args={}) {
        let authToken = this.buildAuth()
        return {
            ...args,
            _username:      authToken.username,
            _password:      authToken.digest,
            _nonce:         authToken.nonce,
            _created_at:    authToken.date,
        }
    }
}

Utils.requireAll(require.context("./modules/", false, /\.js$/)).forEach(module => {
    Object.assign(CMInterface.prototype, module.default)
})

CMInterface.API_PREFIX = API_PREFIX

export default CMInterface
