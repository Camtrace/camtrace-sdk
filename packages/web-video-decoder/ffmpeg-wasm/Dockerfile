# ---------------------------------------------------------------------------
# Stage `src`: obtain the FFmpeg source tree.
# The private monorepo vendors the official release tarball next to this file
# (offline, reproducible build); the public SDK export ships this toolchain
# without the 13 MB tarball, in which case it is downloaded from ffmpeg.org.
# Either way the archive must match the official release checksum.
# Kept in its own stage so that editing the wrapper or the Makefile does not
# invalidate the (long) FFmpeg compile layers of the `build` stage.
# ---------------------------------------------------------------------------
FROM emscripten/emsdk:3.1.51 AS src

ARG FFMPEG_VERSION=7.1
ARG FFMPEG_SHA256=fd59e6160476095082e94150ada5a6032d7dcc282fe38ce682a00c18e7820528

COPY . /ctx
RUN if [ -f /ctx/ffmpeg-${FFMPEG_VERSION}.tar.bz2 ]; then \
		cp /ctx/ffmpeg-${FFMPEG_VERSION}.tar.bz2 /tmp/; \
	else \
		curl -fsSL -o /tmp/ffmpeg-${FFMPEG_VERSION}.tar.bz2 \
			https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.bz2; \
	fi && \
	echo "${FFMPEG_SHA256}  /tmp/ffmpeg-${FFMPEG_VERSION}.tar.bz2" | sha256sum -c - && \
	mkdir -p /src && tar xjf /tmp/ffmpeg-${FFMPEG_VERSION}.tar.bz2 -C /src && \
	rm -rf /ctx /tmp/ffmpeg-${FFMPEG_VERSION}.tar.bz2

# ---------------------------------------------------------------------------
# Stage `build`: compile FFmpeg with emscripten, then the wrapper.
# ---------------------------------------------------------------------------
FROM emscripten/emsdk:3.1.51 AS build

ARG FFMPEG_VERSION=7.1
ARG PREFIX=/opt/ffmpeg
ARG MAKEFLAGS="-j4"

# Build dependencies.
RUN apt-get update && apt-get install -y autoconf libtool build-essential

# FFmpeg source tree from the `src` stage (unmodified official release).
COPY --from=src /src/ffmpeg-${FFMPEG_VERSION} /tmp/ffmpeg-${FFMPEG_VERSION}

# Workaround: FFmpeg 7.x configure misdetects emcc as MSVC because emcc -?
# returns 0 (success). The clang detection branch requires -? to FAIL, but emcc
# treats -? as help. This makes configure fall through to the MSVC branch
# (which checks: clang in -v output AND -? succeeds). The wrapper intercepts -?
# and returns 1 so probe_cc correctly identifies emcc as clang.
RUN printf '#!/bin/bash\nif [ "$1" = "-?" ]; then exit 1; fi\nexec emcc "$@"\n' > /usr/local/bin/emcc-wrap && \
	chmod +x /usr/local/bin/emcc-wrap && \
	printf '#!/bin/bash\nif [ "$1" = "-?" ]; then exit 1; fi\nexec em++ "$@"\n' > /usr/local/bin/em++-wrap && \
	chmod +x /usr/local/bin/em++-wrap

# Configure flags: -pthread replaces deprecated -s USE_PTHREADS=1 in emsdk 3.x.
# INITIAL_MEMORY is only needed at final link (Makefile), not during FFmpeg build.
ARG CFLAGS="-pthread -O3 -I${PREFIX}/include"
ARG LDFLAGS="$CFLAGS -L${PREFIX}/lib"

# Configure and build FFmpeg with emscripten.
# Disable all programs and only enable features we will use.
# https://github.com/FFmpeg/FFmpeg/blob/master/configure
RUN cd /tmp/ffmpeg-${FFMPEG_VERSION} && \
	emconfigure ./configure \
	--prefix=${PREFIX} \
	--target-os=none \
	--arch=x86_32 \
	--enable-cross-compile \
	--disable-debug \
	--disable-x86asm \
	--disable-inline-asm \
	--disable-stripping \
	--disable-programs \
	--disable-doc \
	--disable-runtime-cpudetect \
	--disable-all \
	--enable-avcodec \
	--enable-avformat \
	--enable-avfilter \
	--enable-avdevice \
	--enable-avutil \
	--enable-swresample \
	--enable-swscale \
	--enable-filters \
	--enable-protocol=file \
	--enable-decoder=h264,hevc,mpeg4,aac,pcm_s16le \
	--enable-demuxer=mov,matroska \
	--enable-muxer=mp4 \
	--extra-cflags="$CFLAGS" \
	--extra-cxxflags="$CFLAGS" \
	--extra-ldflags="$LDFLAGS" \
	--nm="/emsdk/upstream/bin/llvm-nm" \
	--ar=emar \
	--as=/emsdk/upstream/bin/llvm-as \
	--ranlib=/emsdk/upstream/bin/llvm-ranlib \
	--cc=emcc-wrap \
	--cxx=em++-wrap \
	--objcc=emcc-wrap \
	--dep-cc=emcc-wrap

RUN cd /tmp/ffmpeg-${FFMPEG_VERSION} && \
	emmake make -j4 && \
	emmake make install

COPY ./src/mp4info-wrapper.cpp /build/src/mp4info-wrapper.cpp
COPY ./Makefile /build/Makefile

WORKDIR /build

RUN make

# Export stage: docker build --target export -o <dest> extracts just the artifacts.
FROM scratch AS export
COPY --from=build /build/dist/mp4info.js        /
COPY --from=build /build/dist/mp4info.wasm      /
COPY --from=build /build/dist/mp4info.worker.js /
