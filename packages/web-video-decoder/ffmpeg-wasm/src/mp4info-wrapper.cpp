#include <emscripten.h>
#include <emscripten/bind.h>
#include <inttypes.h>

#include <string>
#include <cstdio>
#include <vector>

using namespace emscripten;

#define CAMTRACE_VIDEO_TYPE_H265 53
#define CAMTRACE_VIDEO_TYPE_H264 72
#define CAMTRACE_VIDEO_TYPE_MPEG4 77

#define CAMTRACE_PACKET_TYPE_CODECPARAMS 83

extern "C"
{
#include <libavformat/avformat.h>
#include <libavutil/imgutils.h>
#include <libavcodec/avcodec.h>
#include <libswscale/swscale.h>
};

// av_err2str uses C99 compound literals, invalid in C++
static char _av_err_buf[AV_ERROR_MAX_STRING_SIZE];
#define av_err2str_cpp(errnum) av_make_error_string(_av_err_buf, AV_ERROR_MAX_STRING_SIZE, errnum)

typedef struct DecoderInfo
{
  int errorCode;
  std::string errorText;
} DecoderInfo;

static AVCodecContext *pCodecContext = NULL;
struct SwsContext *pSwsContext = NULL;
unsigned char *pExtraData = NULL;
int extraDataLen = 0;
int currentVideoType = 0;

int destroyDecoder()
{
  int ret = 0;
  if (pSwsContext)
  {
      sws_freeContext(pSwsContext);
      pSwsContext = NULL;
      ret++;
  }

  if (pCodecContext)
  {
      avcodec_free_context(&pCodecContext);
      ret++;
  }

  if (pExtraData)
  {
      free(pExtraData);
      pExtraData = NULL;
      ret++;
  }
  extraDataLen = 0;

  currentVideoType = 0;
  return ret;
}

int createDecoder(int type)
{
  const AVCodec *pDecoder = NULL;

  switch (type) {
    case CAMTRACE_VIDEO_TYPE_H264:
        pDecoder = avcodec_find_decoder(AV_CODEC_ID_H264);
        break;

    case CAMTRACE_VIDEO_TYPE_H265:
        pDecoder = avcodec_find_decoder(AV_CODEC_ID_HEVC);
        break;

    case CAMTRACE_VIDEO_TYPE_MPEG4:
        pDecoder = avcodec_find_decoder(AV_CODEC_ID_MPEG4);
        break;

    default:
        return (-1);
  }

  currentVideoType = type;

  if (pCodecContext)
  {
      avcodec_free_context(&pCodecContext);
  }

  pCodecContext = avcodec_alloc_context3(pDecoder);
  if (!pCodecContext) {
      return (-1);
  }
  if (pExtraData && extraDataLen > 0) {
      pCodecContext->extradata = (uint8_t *)av_mallocz(extraDataLen + AV_INPUT_BUFFER_PADDING_SIZE);
      if (pCodecContext->extradata) {
          memcpy(pCodecContext->extradata, pExtraData, extraDataLen);
          pCodecContext->extradata_size = extraDataLen;
      }
  }

  pCodecContext->pix_fmt = AV_PIX_FMT_YUV420P;

  if (avcodec_open2(pCodecContext, pDecoder, NULL) < 0) {
    avcodec_free_context(&pCodecContext);
    return (-1);
  }

  return (0);
}

DecoderInfo decodeFrame(int type, std::string data, int outWidth, int outHeight, bool scale, emscripten::val cb)
{
  uint8_t *frame;

  DecoderInfo f = {
      .errorCode = 0,
      .errorText = ""
  };

  int rWidth = outWidth;
  int rHeight = outHeight;

  int size = data.length();

  if (type == CAMTRACE_PACKET_TYPE_CODECPARAMS) {
      if (pExtraData) {
          free(pExtraData);
          pExtraData = NULL;
      }
      extraDataLen = 0;

      pExtraData = static_cast<unsigned char*>(malloc(size));
      memcpy(pExtraData, data.c_str(), size);
      extraDataLen = size;
      if (createDecoder(currentVideoType) < 0) {
        f.errorCode = -1;
        return f;
      }
      
      // dump_buffer(pExtraData, extraDataLen);
      return f;
  }

  AVPacket *pAvPacket = av_packet_alloc();
  if (!pAvPacket) {
    f.errorCode = -1;
    f.errorText = "cannot allocate AVPacket";
    return f;
  }

  pAvPacket->size = size;
  pAvPacket->data = (unsigned char *)data.c_str();
  pAvPacket->pts = pAvPacket->dts = AV_NOPTS_VALUE;

  if (!pCodecContext) {
    f.errorCode = -1;
    f.errorText = "no codec context";
    return f;
  }

  int ret = avcodec_send_packet(pCodecContext, pAvPacket);
  if (ret < 0) {
    f.errorCode = -1;
    char buff[255];
    snprintf(buff, sizeof(buff), "send packet to decoder error %d : %s", ret, av_err2str_cpp(ret));
    f.errorText = buff;
    return f;
  }
  
  AVFrame *decoderFrame = av_frame_alloc();
  if (!decoderFrame) {
    av_packet_free(&pAvPacket);
    f.errorCode = -1;
    f.errorText = "cannot allocate AVFrame";
    return f;
  }
  do {
    ret = avcodec_receive_frame(pCodecContext, decoderFrame);
    if (ret == AVERROR_EOF) {
      avcodec_flush_buffers(pCodecContext);
      break;
    }
    if (ret < 0)
      break;

    av_frame_apply_cropping(decoderFrame, 0);
    AVFrame *pRGBFrame = av_frame_alloc();
    if (!pRGBFrame) {
        av_frame_unref(decoderFrame);
        continue;
    }

    if (pCodecContext->width > 0 && pCodecContext->height > 0 && scale) {
      float sr = static_cast<float>(outWidth) / static_cast<float>(outHeight);
      float r = static_cast<float>(pCodecContext->width) / static_cast<float>(pCodecContext->height);
      if (r >= sr) {
        rHeight = static_cast<int>(round(outHeight / (r / sr)));
      } else {
        rWidth = static_cast<int>(round(outWidth * (r / sr)));
      }
    }

    enum AVPixelFormat output_pix_fmt = AV_PIX_FMT_RGBA;
    pSwsContext = sws_getCachedContext(pSwsContext, pCodecContext->width, pCodecContext->height, pCodecContext->pix_fmt,
                                           rWidth, rHeight, output_pix_fmt, SWS_FAST_BILINEAR, NULL, NULL, NULL);
    av_image_alloc(pRGBFrame->data, pRGBFrame->linesize, rWidth, rHeight, output_pix_fmt, 4);
    if (pSwsContext && pRGBFrame->data[0] != NULL)
      sws_scale(pSwsContext, (const uint8_t *const *)decoderFrame->data, decoderFrame->linesize, 0, pCodecContext->height, pRGBFrame->data, pRGBFrame->linesize);

    pRGBFrame->width = rWidth;
    pRGBFrame->height = rHeight;

    int frameSize = pRGBFrame->linesize[0] * rHeight;
    //frame = static_cast<uint8_t *>(malloc(frameSize));
    //memcpy(frame, pRGBFrame->data[0], frameSize);

    cb(val(typed_memory_view(frameSize, pRGBFrame->data[0]/*frame*/)), pRGBFrame->linesize[0] / 4, rHeight);
  
    av_freep(&pRGBFrame->data[0]);
    av_frame_free(&pRGBFrame);
    av_frame_unref(decoderFrame);

  } while (ret == 0);

  av_frame_free(&decoderFrame);
  av_packet_free(&pAvPacket);

  return f;
}

EMSCRIPTEN_BINDINGS(decoder_functions)
{
  emscripten::value_object<DecoderInfo>("DecoderInfo")
      .field("errorCode", &DecoderInfo::errorCode)
      .field("errorText", &DecoderInfo::errorText);

  function("createDecoder", &createDecoder);
  function("destroyDecoder", &destroyDecoder);
  function("decodeFrame", &decodeFrame);
}