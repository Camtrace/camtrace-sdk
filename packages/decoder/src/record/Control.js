import CMStringDecoder from 'CMDecoder/StringDecoder'

export default class extends CMStringDecoder {
    constructor() {
        super("\0")
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
    goto(goto) {
        this.sendData("goto " + goto)
    }
    time(time) {
        this.sendData("time " + time)
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
