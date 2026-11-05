import CMStringDecoder from 'CMDecoder/StringDecoder'

const keyWords = key => !key ? "" : key === 'nearest' ? " key nearest" : " key"

// Record player control channel. Commands go out at once, one per WebSocket message and without the trailing
// \0 of the other text channels: scamd ends each WebSocket message with a \0 of its own and stops parsing at an
// empty command, so a command read in the same batch as the previous one ("cmd\0\0cmd\0\0") was lost. The
// 150 ms queue of CMStringDecoder worked around it, too slowly to follow a finger on the timeline (Issue #287).
export default class extends CMStringDecoder {
    constructor() {
        super()
        // Words of the server's `capabilities` line, sent once when the channel opens (e.g. timems)
        this.capabilities = []
        this.on('capabilities', args => { this.capabilities = [].concat(args) })
    }
    sendData(data) {
        this.emit('send', data)
    }
    createPlayer() {
        this.sendData("CTL")
    }
    sync(syncEnabled=true) {
        this.sendData("sync " + ((syncEnabled) ? ("1") : ("0")))
    }
    init(barName, cameraId, startTime, endTime, barSize, currentTime) {
        this.sendData("init " + Object.values(arguments).join(" "))
    }
    type(barName, currentTime) {
        this.sendData("type " + Object.values(arguments).join(" "))
    }
    freq(freq) {
        this.sendData("freq " + freq)
    }
    step(step) {
        this.sendData("step " + step)
    }
    // Positioning: an exact seek, or with `key` ('start' or true: the keyframe opening the position's GOP, 'nearest':
    // the nearest keyframe) that keyframe alone, on servers that list keyseek in their capabilities
    goto(goto, key) {
        this.sendData("goto " + goto + keyWords(key))
    }
    // Unix seconds
    time(time, key) {
        this.sendData("time " + time + keyWords(key))
    }
    // Unix milliseconds, on servers that list timems in their capabilities
    timems(ms, key) {
        this.sendData("timems " + ms + keyWords(key))
    }
    // Seek to a Unix time in milliseconds: timems when the server lists it, time otherwise; `key` only where the
    // server lists keyseek (an exact seek elsewhere)
    seekTime(ms, key) {
        if (!this.capabilities.includes('keyseek')) key = undefined
        if (this.capabilities.includes('timems')) this.timems(Math.round(ms), key)
        else this.time(Math.floor(ms / 1000), key)
    }
    playForward() {
        this.sendData("play forw")
    }
    playBackward() {
        this.sendData("play back")
    }
    playNext() {
        this.sendData("play next")
    }
    playPrev() {
        this.sendData("play prev")
    }
    stop() {
        this.sendData("play stop")
    }
}
