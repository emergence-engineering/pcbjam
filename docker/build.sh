#!/bin/bash
# Build KiCad WASM inside Docker container, then apply asyncify on host
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

# Sync source code to container volume (fixes macOS Docker timestamp issues)
# rsync -a preserves host timestamps, but make needs container timestamps to
# correctly detect changes against cached object files. We touch transferred
# files to set their mtime to container's current time.
echo "Syncing source code to container..."
docker compose -f docker/docker-compose.yml exec kicad-wasm-builder \
    bash -c 'rsync -ai --delete --exclude="build-wasm" --exclude="output" /workspace-host/ /workspace/ | \
        grep "^>f" | \
        sed "s/^[^ ]* //" | \
        while read f; do touch "/workspace/$f" 2>/dev/null; done'

# Run build command (without asyncify - handled on host due to memory requirements)
docker compose -f docker/docker-compose.yml exec kicad-wasm-builder \
    /workspace/scripts/kicad/build-pcbnew.sh "${ARGS[@]}"

# Copy output to host-accessible directory
# Note: pcbnew.wasm.debug.wasm contains DWARF debug info (generated with -gseparate-dwarf)
echo "Copying build output to ./output/..."
docker compose -f docker/docker-compose.yml exec kicad-wasm-builder \
    bash -c "mkdir -p /workspace/output && \
        cp /workspace/build-wasm/kicad-pcbnew/pcbnew/pcbnew.{js,wasm,wasm.debug.wasm,wasm.map,worker.js} /workspace/output/ 2>/dev/null || \
        cp /workspace/build-wasm/kicad-pcbnew/pcbnew/pcbnew.{js,wasm} /workspace/output/; \
        cp /workspace/build-wasm/kicad-pcbnew/resources/images.tar.gz /workspace/output/ 2>/dev/null || true"

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
