import EventEmitter from 'event-emitter-es6'

// 50Mo
const MAX_INTERNAL_BUFFER_SIZE = (1000 * 1000 * 50)

export default class CMStringDecoder extends EventEmitter {
  constructor(delimiterChar) {
    super()
    this.delimiterChar = delimiterChar
    this.internalBuffer = ""
    this.messageBuffer = []
    this.messageIt = undefined
  }
  write(data) {
    this.decode(data)
  }
  decode(data) {
    if (this.internalBuffer.length < MAX_INTERNAL_BUFFER_SIZE) {
      this.internalBuffer += data.toString("ascii")
    } else {
      console.error("Internal buffer full (Stream stuck ?)")
    }
    this.parseData()
  }
  parseData() {
    this.onCommand(this.internalBuffer.trim())
    this.internalBuffer = ""
  }
  onCommand(command) {
    let args = command.split(" ");
    let cmd = args.splice(0, 2);
    
    switch (cmd[1]) {
      case 'activetour-updated':
      case 'presets-updated':
      case 'tours-updated':
        let camId = args.shift();
        this.emit(cmd[0], [cmd[1], camId, args.join()]);
        break;
      default:
        args = (args.length == 0) ? (cmd[1]) : ([cmd[1]].concat(args));
        this.emit(cmd[0], args);
    }
  }
  sendData(data) {
    // Todo : supprimer ce système de queue dès que scamd gèrera plusieurs commandes dans une même trame
    this.messageBuffer.push(data)
    if (this.messageIt == undefined) {
      this.emit('send', this.messageBuffer.shift() + this.delimiterChar)
      this.messageIt = setInterval(() => {
        let msg = this.messageBuffer.shift()
        if (typeof msg == 'undefined') {
          clearInterval(this.messageIt)  
          this.messageIt = undefined  
        } else {
          this.emit('send', msg + this.delimiterChar)
        }
      }, 150)
    }
    //this.emit('send', data + this.delimiterChar)
  }
}
