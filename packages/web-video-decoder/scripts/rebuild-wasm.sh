#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[WASM] Building Docker image and compiling artifacts..."
echo "[WASM] First run: ~15-30 min (FFmpeg compile). Subsequent: fast (Docker cache)."
echo ""

DOCKER_BUILDKIT=1 docker build \
    --target export \
    --output type=local,dest=src/ \
    ffmpeg-wasm/

echo ""
echo "[WASM] Done. Artifacts:"
ls -la src/mp4info.js src/mp4info.wasm src/mp4info.worker.js
echo ""
echo "[WASM] Next: verify in a consuming app (e.g. apps/demo: npm run dev), then commit."
