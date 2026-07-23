import {CMDecoder, CAMTRACE_PCK_HEADER_SIZE} from 'CMDecoder/Decoder'
import CMBase46 from '../CMBase46'

const CAMTRACE_TYPE_ICON        = 73 // I
const CAMTRACE_TYPE_JPEG        = 74 // J
const CAMTRACE_TYPE_H264        = 72 // H
const CAMTRACE_TYPE_H265        = 53 // 5
const CAMTRACE_TYPE_MPEG4       = 77 // M
const CAMTRACE_TYPE_AUDIO       = 65 // A
const CAMTRACE_TYPE_OPTION      = 79 // O
const CAMTRACE_TYPE_STATUS      = 83 // S
const CAMTRACE_TYPE_QUIT        = 81 // Q
const CAMTRACE_TYPE_METADATA    = 88 // X
const CAMTRACE_TYPE_BOUNDINGBOX = 68 // D

const CAMTRACE_AUDIO_PCMA       = 100
const CAMTRACE_AUDIO_PCMU       = 101
const CAMTRACE_AUDIO_G726_16    = 102
const CAMTRACE_AUDIO_G726_24    = 103
const CAMTRACE_AUDIO_G726_32    = 104
const CAMTRACE_AUDIO_G726_40    = 105
const CAMTRACE_AUDIO_AAC        = 106

const H264_SUBTYPE_FAKE_SPSPPS  = 83 // S
const H264_SUBTYPE_DESC         = 72 // H

const H264_SUBTYPE_REFERENCABLE = 73 // I
const H264_SUBTYPE_DROPABLE     = 80 // P
const H264_SUBTYPE_FLUSH        = 79 // O

const AUDIO_SUBTYPE_DESC        = 83 // S
const AUDIO_SUBTYPE_FRAME       = 65 // A

// Codecs the mobile native pipeline can decode. G.726 (102-105) is parsed but
// flagged unsupported (no MediaCodec/AudioToolbox decoder — see audio plan).
const SUPPORTED_AUDIO_CODECS = [CAMTRACE_AUDIO_PCMA, CAMTRACE_AUDIO_PCMU, CAMTRACE_AUDIO_AAC]

let audioCodecNames = {}
audioCodecNames[CAMTRACE_AUDIO_PCMA]    = "pcma"
audioCodecNames[CAMTRACE_AUDIO_PCMU]    = "pcmu"
audioCodecNames[CAMTRACE_AUDIO_G726_16] = "g726-16"
audioCodecNames[CAMTRACE_AUDIO_G726_24] = "g726-24"
audioCodecNames[CAMTRACE_AUDIO_G726_32] = "g726-32"
audioCodecNames[CAMTRACE_AUDIO_G726_40] = "g726-40"
audioCodecNames[CAMTRACE_AUDIO_AAC]     = "aac"

let pckNames = {}
pckNames[CAMTRACE_TYPE_ICON]        = "icon"
pckNames[CAMTRACE_TYPE_JPEG]        = "jpeg"
pckNames[CAMTRACE_TYPE_H264]        = "h264"
pckNames[CAMTRACE_TYPE_H265]        = "h265"
pckNames[CAMTRACE_TYPE_MPEG4]       = "mpeg4"
pckNames[CAMTRACE_TYPE_AUDIO]       = "audio"
pckNames[CAMTRACE_TYPE_OPTION]      = "opt"
pckNames[CAMTRACE_TYPE_STATUS]      = "status"
pckNames[CAMTRACE_TYPE_QUIT]        = "quit"
pckNames[CAMTRACE_TYPE_METADATA]    = "metadata"
pckNames[CAMTRACE_TYPE_BOUNDINGBOX] = "boundingbox"

let pckHeadersSize = {}
pckHeadersSize[CAMTRACE_TYPE_ICON]        = CAMTRACE_PCK_HEADER_SIZE
pckHeadersSize[CAMTRACE_TYPE_JPEG]        = CAMTRACE_PCK_HEADER_SIZE
pckHeadersSize[CAMTRACE_TYPE_H264]        = CAMTRACE_PCK_HEADER_SIZE + 9
pckHeadersSize[CAMTRACE_TYPE_H265]        = CAMTRACE_PCK_HEADER_SIZE + 9
pckHeadersSize[CAMTRACE_TYPE_MPEG4]       = CAMTRACE_PCK_HEADER_SIZE + 9
pckHeadersSize[CAMTRACE_TYPE_AUDIO]       = CAMTRACE_PCK_HEADER_SIZE
pckHeadersSize[CAMTRACE_TYPE_OPTION]      = CAMTRACE_PCK_HEADER_SIZE
pckHeadersSize[CAMTRACE_TYPE_STATUS]      = CAMTRACE_PCK_HEADER_SIZE
pckHeadersSize[CAMTRACE_TYPE_QUIT]        = CAMTRACE_PCK_HEADER_SIZE
pckHeadersSize[CAMTRACE_TYPE_METADATA]    = CAMTRACE_PCK_HEADER_SIZE
pckHeadersSize[CAMTRACE_TYPE_BOUNDINGBOX] = CAMTRACE_PCK_HEADER_SIZE

export default class extends CMDecoder {
  constructor(childPckNames={}, childPckHeadersSize={}) {
    super(Object.assign(pckNames, childPckNames), Object.assign(pckHeadersSize, childPckHeadersSize))
  }
  isVideoPck() {
    return [CAMTRACE_TYPE_JPEG, CAMTRACE_TYPE_H264, CAMTRACE_TYPE_H265, CAMTRACE_TYPE_MPEG4].indexOf(this.currentPck.type) !== -1
  }
  isH265Pck() {
    return this.currentPck.type === CAMTRACE_TYPE_H265
  }
  isH264Pck() {
    return this.currentPck.type === CAMTRACE_TYPE_H264
  }
  isRawH264Pck() {
    return [H264_SUBTYPE_FAKE_SPSPPS, H264_SUBTYPE_REFERENCABLE, H264_SUBTYPE_DROPABLE, H264_SUBTYPE_FLUSH].indexOf(this.currentPck.subtype) !== -1
  }
  isMjpegPck() {
    return this.currentPck.type === CAMTRACE_TYPE_JPEG
  }
  isAudioPck() {
    return this.currentPck.type === CAMTRACE_TYPE_AUDIO
  }
  /*
  ** ===========================================================================
  ** Handlers
  ** ===========================================================================
  */
  handleIcon() {
    return this.readDataPacket()
  }
  handleStatus() {
    return this.readDataPacket()
  }
  handleOpt() {
    return this.readDataPacket()
  }
  handleJpeg() {
    return this.readDataPacket()
  }

  handleQuit() {
    return this.readDataPacket()
  }

  // Audio packets (type 65 'A'), same wire format as the desktop client
  // (camtrace-client CamtraceVideoSource):
  //   desc  (subtype 'S'): codec(1) + channels(1) + frequency(4BE)
  //   frame (subtype 'A'): tvSec(4BE) + tvUsec(4BE) + compressed payload
  handleAudio() {
    let pck = this.readDataPacket((rawPck, pck) => {
      pck.subtype = rawPck.readUInt8(0)
      if (pck.subtype === AUDIO_SUBTYPE_DESC) {
        pck.streamDesc = true
        pck.codec = rawPck.readUInt8(1)
        pck.channels = rawPck.readUInt8(2)
        pck.frequency = rawPck.readUInt32BE(3)
        pck.codecName = audioCodecNames[pck.codec]
        pck.unsupported = SUPPORTED_AUDIO_CODECS.indexOf(pck.codec) === -1
        return 7
      }
      if (pck.subtype !== AUDIO_SUBTYPE_FRAME) {
        // Unknown subtype: consume the packet without emitting bogus fields,
        // consumers must only act on streamDesc or timestamped frames.
        pck.unknownSubtype = true
        return 1
      }
      pck.tvSet = rawPck.readUInt32BE(1)
      pck.tvUset = rawPck.readUInt32BE(5)
      pck.time = pck.tvSet * 1000000 + pck.tvUset
      return 9
    })

    this._logAudioBaseline(pck)
    return pck
  }

  // Baseline diagnostics (audio plan P0): inventory codecs and frame cadence
  // without flooding the console — desc always logged, frames every 100.
  _logAudioBaseline(pck) {
    if (pck.streamDesc) {
      this._audioFrameCount = 0
      this._audioFrameBytes = 0
      this._audioFirstFrameAt = 0
      console.log("Audio: description codec=" + (pck.codecName || pck.codec)
        + " channels=" + pck.channels + " frequency=" + pck.frequency
        + (pck.unsupported ? " (UNSUPPORTED)" : ""))
    } else if (pck.unknownSubtype) {
      console.error("Audio: unknown subtype " + pck.subtype + ", packet ignored")
    } else {
      this._audioFrameCount = (this._audioFrameCount || 0) + 1
      this._audioFrameBytes = (this._audioFrameBytes || 0) + pck.data.length
      if (this._audioFrameCount === 1) {
        this._audioFirstFrameAt = Date.now()
        console.log("Audio: first frame time=" + pck.time + " size=" + pck.data.length)
      } else if (this._audioFrameCount % 100 === 0) {
        let elapsed = (Date.now() - this._audioFirstFrameAt) / 1000
        console.log("Audio: " + this._audioFrameCount + " frames, mean size="
          + Math.round(this._audioFrameBytes / this._audioFrameCount) + "B, rate="
          + (elapsed > 0 ? (this._audioFrameCount / elapsed).toFixed(1) : "?") + " frames/s")
      }
    }
  }

  _handleCommonVP() {
    let pck = this.readDataPacket((rawPck, pck) => {
      pck.subtype = rawPck.readUInt8(0)
      if (pck.subtype === H264_SUBTYPE_DESC) {
        pck.width = rawPck.readUInt32BE(1)
        pck.height = rawPck.readUInt32BE(5)
        pck.fps = rawPck.readUInt32BE(9)
        pck.streamDesc = true
        return 13
      } else if (pck.subtype === H264_SUBTYPE_FAKE_SPSPPS) {
        return 1
      }
      pck.tvSet = rawPck.readUInt32BE(1)
      pck.tvUset = rawPck.readUInt32BE(5)
      pck.time = pck.tvSet * 1000000 + pck.tvUset
      return 9
    })
    return pck;
  }

  handleMpeg4() {
    let pck = this._handleCommonVP()

    if (pck.subtype === H264_SUBTYPE_FAKE_SPSPPS) {
      let asString = (String.fromCharCode(...new Uint8Array(pck.data)))

      // The server sends a hex-encoded string, often null-terminated (C-string).
      // Strip trailing null bytes before computing the byte count so the formula
      // works whether or not the terminator is present.
      let hexStr = asString.replace(/\x00+$/, '')

      // The server always emits 2 hex chars per byte ({:02X}), so odd length is
      // never expected. Reject explicitly rather than silently dropping the last nibble.
      if (hexStr.length % 2 !== 0) {
        console.error(`MPEG4 CSD: odd hex length (${hexStr.length}), discarding`)
        return pck
      }

      var parseGeneralConfigStr = {
        configStr : hexStr,
        pos : 0,
        getNibble : function () {
          let c = this.configStr.charCodeAt(this.pos);
          if (c >= '0'.charCodeAt(0) && c <= '9'.charCodeAt(0))
            return (c - '0'.charCodeAt(0));
          else if (c >= 'A'.charCodeAt(0) && c <= 'F'.charCodeAt(0))
            return (10 + c - 'A'.charCodeAt(0));
          else if (c >= 'a'.charCodeAt(0) && c <= 'f'.charCodeAt(0))
            return (10 + c - 'a'.charCodeAt(0));
          return false;
        },
        getByte : function () {
          let firstNibble = this.getNibble();
          if (firstNibble === false) {
            return false;
          }
          this.pos++;
          let secondNibble = this.getNibble();
          if (secondNibble === false)
            return false;
          this.pos++;
          return ((firstNibble << 4) | secondNibble);
        }
      }

      let configSize = hexStr.length / 2
      let config = new Uint8Array(configSize)
      let i
      for (i = 0; i < configSize; ++i) {
        let byte = parseGeneralConfigStr.getByte()
        if (byte === false) {
          console.error(`MPEG4 CSD: hex decode failed at byte ${i}/${configSize}`)
          break
        }
        config[i] = byte
      }

      if (i === configSize) {
        pck.data = config
      } else {
        console.error(`MPEG4 CSD: incomplete decode (${i}/${configSize} bytes), discarding`)
      }
    }

    return pck
  }

  handleH264() {
    let pck = this._handleCommonVP()

    if (pck.subtype === H264_SUBTYPE_FAKE_SPSPPS) { // Fun part ლ(ಠ_ಠლ)
      let asString = (String.fromCharCode(...new Uint8Array(pck.data)))
      let spsAndPpsSizesAsBase46 = asString.split(",")
      let sps = CMBase46.decode(spsAndPpsSizesAsBase46[0])
      let pps = CMBase46.decode(spsAndPpsSizesAsBase46[1])
      pck.data = Buffer.concat([
        new Buffer([0, 0, 0, 1]), // NAL header
        sps,
        new Buffer([0, 0, 0, 1]), // NAL header
        pps
      ])
    }

    return pck
  }

  handleH265() {
    let pck = this._handleCommonVP();

    if (pck.subtype === H264_SUBTYPE_FAKE_SPSPPS) { // Fun part ლ(ಠ_ಠლ)
        let asString = (String.fromCharCode(...new Uint8Array(pck.data)))
        let vpsSpsAndPpsSizesAsBase46 = asString.split(",")
        if (vpsSpsAndPpsSizesAsBase46.length >= 3) {
        let vps = CMBase46.decode(vpsSpsAndPpsSizesAsBase46[0])
        let sps = CMBase46.decode(vpsSpsAndPpsSizesAsBase46[1])
        let pps = CMBase46.decode(vpsSpsAndPpsSizesAsBase46[2])
        pck.data = Buffer.concat([
          new Buffer([0, 0, 0, 1]), // NAL header
          vps,
          new Buffer([0, 0, 0, 1]), // NAL header
          sps,
          new Buffer([0, 0, 0, 1]), // NAL header
          pps
        ])
      }
    }
    
    return pck
  }
}
