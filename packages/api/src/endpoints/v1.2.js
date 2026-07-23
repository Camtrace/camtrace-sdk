export default class {
    constructor(http, prefix) {
        this.http = http
        this.prefix = prefix
    }
    async license() {
        return (await this.http.get(this.prefix + "/license")).data
    }
    async sysinfo() {
        return (await this.http.get(this.prefix + "/sysinfo")).data
    }
    async health() {
        return (await this.http.get(this.prefix + "/health")).data
    }
    async exturls() {
        return (await this.http.get(this.prefix + "/exturls")).data
    }
    async exturl(id) {
        return (await this.http.get(this.prefix + "/exturls/" + id)).data
    }
    async exturlTrigger(id) {
        return (await this.http.get(this.prefix + "/exturls/" + id + "/trigger")).data
    }
    async cameras() {
        return (await this.http.get(this.prefix + "/cameras")).data
    }
    async camera(id) {
        return (await this.http.get(this.prefix + "/cameras/" + id)).data
    }
    async cameraRef(id) {
        return (await this.http.get(this.prefix + "/cameras/" + id + "/ref.jpg", { responseType: 'blob' })).data
    }
    async alarms(params) {
        return (await this.http.get(this.prefix + "/cameras/alarms", { params })).data
    }
    async cameraAlarms(id, params) {
        return (await this.http.get(this.prefix + "/cameras/" + id + "/alarms", { params })).data
    }
    async alarmThumbnail(id,w,h) {
        if (typeof w == "undefined")
            w = 50;
        if (typeof h == "undefined")
            h = w;   
        return (await this.http.get(this.prefix + "/cameras/alarms/" + id + ".jpg", {params: {w,h}, responseType: 'blob' })).data 
    }
    async alarmSnapshot(id) {
        return (await this.http.get(this.prefix + "/cameras/alarms/" + id + ".jpg", { responseType: 'blob' })).data
    }
    async groups() {
        return (await this.http.get(this.prefix + "/groups")).data
    }
    async group(id) {
        return (await this.http.get(this.prefix + "/groups/" + id)).data
    }
    async nameAuth(name) {
        return (await this.http.get(this.prefix + "/users/" + name + "/auth")).data
    }
    async login() {
        return (await this.http.get(this.prefix + "/users/login")).data
    }
    async takeSnapshot(cameraId, data) {
        return (await this.http.post(this.prefix + "/snapshots", data)).data
    }
    async snapshot(id) {
        return (await this.http.get(this.prefix + "/snapshots/" + id + ".jpg", { responseType: 'blob' })).data
    }
    async updateSnapshot(id, data) {
        return (await this.http.put(this.prefix + "/snapshots/" + id, data)).data
    }
    async protectRecord(data) {
        return (await this.http.post(this.prefix + "/precords", data)).data
    }
}