import CMStringDecoder from 'CMDecoder/StringDecoder'

export default class extends CMStringDecoder {
  constructor() {
      super("\n")
      //this.ptzMoves = ["top", "right", "down", "up"]
  }
  wsseLogin(username, digest, nonce, created) {
    this.sendData("login wsse " + Object.values(arguments).join(" "))
  }
  forceRecord(cameraId,force) {
    this.sendData("force " + (force ? "" : "-") + cameraId)
  }
  ackAlarm(cameraId) {
    this.sendData("acquit " + cameraId)
  }

  ptzPreset(cameraId, presetId) {
    //console.log("ptzd preset " + Object.values(arguments).join(" "));
    this.sendData("ptzd preset " + Object.values(arguments).join(" "))
  }
  ptzArea(cameraId, x0, y0, x1, y1, width, height) {
    //console.log("ptzd area " + Object.values(arguments).join(" "));
    this.sendData("ptzd area " + Object.values(arguments).join(" "))
  }
  ptzCenter(cameraId, x, y, width, height) {
    //console.log("ptzd center " + Object.values(arguments).join(" "))
    this.sendData("ptzd center " + Object.values(arguments).join(" "))
  }
  ptzCptm(cameraId, x, y) {
    //console.log("ptzd cptm " + Object.values(arguments).join(" "))
    this.sendData("ptzd cptm " + Object.values(arguments).join(" "))
  }
  ptzCzm(cameraId, level) {
    //console.log("ptzd czm " + Object.values(arguments).join(" "))
    this.sendData("ptzd czm " + Object.values(arguments).join(" "))
  }
  ptz(cameraId, to) {
    this.sendData("ptzd ptz " + to)
  }
  ptzGuardTour(cameraId, activeTour, tourId) {
    //console.log("ptzd guardtour " + [cameraId, activeTour + "_" + tourId].join(" "));
    this.sendData("ptzd guardtour " + [cameraId, activeTour + "_" + tourId].join(" "))
  }
  ptzTourStart(cameraId, tourId) {
    //console.log("ptzd tourstart " + Object.values(arguments).join(" "));
    this.sendData("ptzd tourstart " + Object.values(arguments).join(" "))
  }
  ptzTourStop(cameraId) {
    //console.log("ptzd tourstop " + Object.values(arguments).join(" "));
    this.sendData("ptzd tourstop " + Object.values(arguments).join(" "))
  }
  ptzZoom(cameraId, level) {
    this.sendData("ptzd zoom " + Object.values(arguments).join(" "))
  }
  ptzZoomOut(cameraId) {
    this.sendData("ptzd ptz " + cameraId + " out")
  }
  ptzContinuousMove(cameraId, streamId, ptSpace, x, y, zSpace, z) {
    let args = {cameraId:cameraId,...streamId != undefined && {streamId:streamId}, ...ptSpace != undefined && {ptSpace:ptSpace}, ...x != undefined && {x:x}, ...y != undefined && {y:y}, ...zSpace != undefined && {zSpace:zSpace}, ...z != undefined&& {z:z}};
    //console.log("ptzd continuousmove " + JSON.stringify(args));
    this.sendData("ptzd continuousmove " + JSON.stringify(args))
  }
}
