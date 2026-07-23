import UcFirst from 'ucfirst'
import EventEmitter from 'event-emitter-es6'
//require('buffer')

// 50Mo
const MAX_INTERNAL_BUFFER_SIZE = (1000 * 1000 * 50)

// Without the type byte
export const CAMTRACE_PCK_HEADER_SIZE = 4

export class CMDecoder extends EventEmitter {
  constructor(pckNames) {
    super()
    this.pckNames = pckNames
    this.internalBuffer = Buffer.allocUnsafe(0)
    this.usedBytes = 0
    this.currentPck = {}
    this.currentPckRaw = []
  }
  write(data) {
    this.decode(data)
  }
  decode(data) {
    if (this.internalBuffer.length < MAX_INTERNAL_BUFFER_SIZE) {
      var tmpBuf = Buffer.from(data);
      this.internalBuffer = Buffer.concat([this.internalBuffer, tmpBuf], (this.internalBuffer.length + tmpBuf.length))
    } else {
        console.error("Internal buffer full (Stream stuck ?)")
    }
    this.parseData()
  }
  parseData() {
    this.needDatas(5, datas => { // PCK type + data length
      let pckType = datas.readUInt8(0)
      let pckName = this.pckNames[pckType]
      if (pckName) {
        let rawLen = datas.readUInt32BE(1)
        this.needDatas(rawLen, datas => {
          let handlerName = "handle" + UcFirst(pckName)
          this.currentPckRaw = datas
          this.currentPck = {}
          this.currentPck.type = pckType
          this.currentPck.name = pckName
          this.currentPck.rawLen = rawLen
          if (typeof this[handlerName] === 'function' && (this.currentPck = this[handlerName]())) {
            this.commitUsedBytes()
            this.emit('packet', this.currentPck)
            this.parseData()
          } else {
            console.error("Handler not found for " + pckName + " packet")
            this.skipBytes(rawLen)
          }
        })
      } else {
        console.error("Packet type not found " + pckType)
        this.skipBytes(rawLen)
      }
    })
  }
  skipBytes(count=1) {
    this.usedBytes += count
    this.commitUsedBytes()
  }
  needDatas(size, cb=undefined) {
    if ((this.internalBuffer.length - this.usedBytes) >= size) {
      let cutedData = Buffer.allocUnsafe(size)
      this.internalBuffer.copy(cutedData, 0, this.usedBytes, this.usedBytes + size)
      this.usedBytes += size
      if (cb) {
        cb(cutedData)
      }
      return cutedData
    } else {
      this.rollbackUsedBytes()
    }
  }
  rollbackUsedBytes() {
      this.usedBytes = 0
  }
  commitUsedBytes() {
    this.internalBuffer = this.internalBuffer.slice(this.usedBytes)
    this.usedBytes = 0
  }
  reset() {
    this.usedBytes = 0    
    this.internalBuffer = Buffer.allocUnsafe(0)
  }
  readDataPacket(headerCb=undefined) {
    let sizeHeader = (headerCb) ? (headerCb(this.currentPckRaw, this.currentPck)) : (0)
    this.currentPck.data = Buffer.allocUnsafe(this.currentPck.rawLen - sizeHeader)
    this.currentPckRaw.copy(this.currentPck.data, 0, sizeHeader, this.currentPck.rawLen)
    return this.currentPck
  }
  sendData(data) {
    if (this.onData) {
      data = this.onData(data)
    }
    this.emit('send', data)
  }
}
