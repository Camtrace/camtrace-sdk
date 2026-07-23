import RefImageNotFound from 'base64-loader!Resources/images/ref.jpg'
import Utils from 'CMApi/utils'

const IMAGE_REF_MIMETYPE = 'image/jpeg'
    //First = Better quality
const STREAMS_QUALITYS = ['hd', 'md', 'ld']
const STREAM_REPLAY = 'rp'
const STREAM_ALARM = 'al'

export default {
    async cameras() {
        var cameras = (await this.latestApi().cameras()).cameras
        cameras.forEach((camera, id) => {
            let streams = {}
            STREAMS_QUALITYS.forEach(prefix => {
                let stream = this.buildStream(camera, prefix)
                if (stream) {
                    streams[prefix] = stream
                }
            })
            cameras[id].formatedStreams = streams
        }) 
        return cameras
    },
    async camera(id) {
        return (await this.latestApi().camera(id))
    },
    async cameraImageRef(id) {
        try {
            return URL.createObjectURL(await this.latestApi().cameraRef(id))
        } catch (error) {
            console.log(error)
            return URL.createObjectURL(Utils.b64ToBlob(RefImageNotFound, IMAGE_REF_MIMETYPE))            
        }
    },
    buildStream(camera, prefix) {
        let stream = {
            encoding: camera[prefix + "Encoding"] || "H264",
            width: camera[prefix + "Width"],
            height: camera[prefix + "Height"],
            url: camera[prefix + "Stream"]
        }
        return (((!stream.encoding) || (!stream.url)) ? (undefined) : (stream))
    },
    async cameraLiveStreams(id) {
        let camera = await this.camera(id)
        let streams = {}
        STREAMS_QUALITYS.forEach(prefix => {
            let stream = this.buildStream(camera, prefix)
            if (stream) {
                streams[prefix] = stream
            }
        })
        if (Object.keys(streams).length === 0) {
            throw "No streams"
        }
        return streams
    },
    async cameraAlarmStream(id) {
        let stream = this.buildStream((await this.camera(id)), STREAM_ALARM)
        if (stream) {
            return stream
        } else {
            throw "No stream"
        }
    },
    async cameraReplayStream(id) {
        let stream = this.buildStream((await this.camera(id)), STREAM_REPLAY)
        if (stream) {
            return stream
        } else {
            throw "No stream"
        }
    },
    async alarms(params) {
        return await this.latestApi().alarms(params)
    },
    async cameraAlarms(id, params) {
        return await this.latestApi().cameraAlarms(id, params)
    },
    async cameraAlarmSnaphot(idAlarm) {
        try {
            return URL.createObjectURL((await this.latestApi().alarmSnapshot(idAlarm)))
        } catch (error) {
            console.log(error)
            return (await URL.createObjectURL(Utils.b64ToBlob(RefImageNotFound, IMAGE_REF_MIMETYPE)))
        }
    },
    async cameraAlarmThumbnail(idAlarm,w,h) {
        try {
            return URL.createObjectURL((await this.latestApi().alarmThumbnail(idAlarm,w,h)))
        } catch (error) {
            console.log(error)
            return (await URL.createObjectURL(Utils.b64ToBlob(RefImageNotFound, IMAGE_REF_MIMETYPE)))
        }
    },
    async takeSnapshot(cameraId, time) {
        return (await this.latestApi().takeSnapshot(cameraId, {snapshot: {cameraId, comment: "", id: 0, time}})).snapshot
    },
    async snapshot(id) {
        try {
            return URL.createObjectURL((await this.latestApi().snapshot(id)))
        } catch (error) {
            console.log(error)
            return (await URL.createObjectURL(Utils.b64ToBlob(RefImageNotFound, IMAGE_REF_MIMETYPE)))
        }
    },
    async setSnapshotComment(snapshotId, comment) {
        return (await this.latestApi().updateSnapshot(snapshotId, {snapshot: {comment}})).snapshot
    },
    async protectRecord(cameraId, from, to, comment, type) {
        return (await this.latestApi().protectRecord({precord: {cameraId, from, to, comment, type}})).precord
    }
}