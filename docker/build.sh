#!/bin/bash
# Build KiCad WASM inside Docker container, then apply asyncify on host

# Redirect all output to a log file (re-execs script with redirection)
source "$(dirname "$0")/../scripts/common/logging.sh"
#
# The build is split into two phases:
# 1. Docker: Compile KiCad to WASM (without asyncify)
# 2. Host: Apply asyncify transformation (uses Binaryen v121)
#
# Binaryen is downloaded automatically - no prerequisites needed.

set -e

cd "$(dirname "$0")/.."

# Use branch name as Docker Compose project name for isolated containers/volumes
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD | tr '/' '-' | tr '[:upper:]' '[:lower:]')
export COMPOSE_PROJECT_NAME="kicad-wasm-${BRANCH_NAME}"
echo "Using Docker project: ${COMPOSE_PROJECT_NAME}"

# Add -j 10 by default if no -j flag is given
ARGS=("$@")
if [[ ! " ${ARGS[*]} " =~ " -j " ]]; then
    ARGS+=("-j" "10")
fi

# Start container if not running
docker compose -f docker/docker-compose.yml up -d

# Sync source code to container volume (fixes macOS Docker VirtioFS issues)
# Use --checksum to only transfer files with different CONTENT, not timestamps.
# This avoids the timestamp mismatch cycle that caused full rebuilds every time.
# Transferred files get current container time, so make detects them correctly.
echo "Syncing source code to container..."
# rsync into the macOS-backed volume intermittently hits transient VirtioFS glitches:
# temp-file rename failures (exit 23) or vanished-source files (exit 24, harmless).
# --inplace avoids the temp-file+rename pattern that triggers exit 23; retry up to 3x
# for any residual flakiness (--checksum makes each retry skip already-synced files).
sync_rc=0
for sync_attempt in 1 2 3; do
    if docker compose -f docker/docker-compose.yml exec kicad-wasm-builder \
        rsync -r --delete --checksum --inplace \
            --exclude="build-wasm" \
            --exclude="output" \
            --exclude=".git" \
            --exclude="logs" \
            --exclude=".idea" \
            --exclude="node_modules" \
            --exclude="tools/emsdk" \
            /workspace-host/ /workspace/
    then
        sync_rc=0
    else
        sync_rc=$?
    fi
    { [ $sync_rc -eq 0 ] || [ $sync_rc -eq 24 ]; } && break
    echo "rsync attempt ${sync_attempt} failed (exit ${sync_rc}); retrying in 2s..."
    sleep 2
done
if [ $sync_rc -ne 0 ] && [ $sync_rc -ne 24 ]; then
    echo "ERROR: source sync failed after retries (exit ${sync_rc})"; exit 1
fi

# Run build command (without asyncify - handled on host due to memory requirements)
# -e EMSDK=/emsdk: `docker compose exec` bypasses the entrypoint that sources
# emsdk_env.sh, so the build shell would lack emcc/embuilder on PATH. Setting
# EMSDK lets scripts/common/env.sh source /emsdk/emsdk_env.sh and activate the toolchain.
docker compose -f docker/docker-compose.yml exec -e EMSDK=/emsdk kicad-wasm-builder \
    /workspace/scripts/kicad/build-pcbnew.sh "${ARGS[@]}"

# Copy output to host-accessible directory
# Note: pcbnew.wasm.debug.wasm contains DWARF debug info (generated with -gseparate-dwarf)
echo "Copying build output to ./output/..."
docker compose -f docker/docker-compose.yml exec kicad-wasm-builder \
    bash -c "mkdir -p /workspace/output && \
        cp /workspace/build-wasm/kicad-pcbnew/pcbnew/pcbnew.{js,wasm,wasm.debug.wasm,wasm.map,worker.js} /workspace/output/ 2>/dev/null || \
        cp /workspace/build-wasm/kicad-pcbnew/pcbnew/pcbnew.{js,wasm} /workspace/output/; \
        cp /workspace/build-wasm/kicad-pcbnew/resources/images.tar.gz /workspace/output/ 2>/dev/null || true; \
        cp /workspace/build-wasm/wxwidgets/build/wasm/wx.js /workspace/output/ 2>/dev/null || true"

# Inject dynCall shims into pcbnew.js
# This fixes "dynCall_* is not defined" errors in Emscripten 4.x
./scripts/common/inject-dyncall-shims.sh output/pcbnew.js

# Apply wasm-emscripten-finalize on host (skipped in Docker due to memory limits)
# This is done on the host because finalize with DWARF needs significant RAM
./scripts/common/apply-finalize.sh output/pcbnew.wasm output/pcbnew.wasm

# Apply asyncify transformation on host
# This is done on the host because wasm-opt --asyncify needs significant RAM
./scripts/common/apply-asyncify.sh output/pcbnew.wasm output/pcbnew.wasm

echo ""
echo "Build complete. Output files in ./output/"
ls -lh output/
