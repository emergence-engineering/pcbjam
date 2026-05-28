#!/bin/bash
# Build KiCad PCB Calculator WASM inside Docker, then apply asyncify on host.
# Mirrors docker/build.sh; differences:
#   - calls scripts/kicad/build-calculator.sh inside the container
#   - copies pcb_calculator.* from build-wasm/kicad-calculator and renames to
#     calculator.* on the host (keeps the kicad-fork patch minimal)
#   - runs host-side passes against output/calculator.{js,wasm}

# Redirect all output to a log file (re-execs script with redirection)
source "$(dirname "$0")/../scripts/common/logging.sh"

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

# Sync source code to container volume (same flake-tolerant retry as build.sh).
echo "Syncing source code to container..."
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

# Run build inside container.
docker compose -f docker/docker-compose.yml exec -e EMSDK=/emsdk kicad-wasm-builder \
    /workspace/scripts/kicad/build-calculator.sh "${ARGS[@]}"

# Copy outputs. Artifacts are named calculator.* directly thanks to the
# OUTPUT_NAME calculator property we set on the pcb_calculator target for
# EMSCRIPTEN builds (kicad/pcb_calculator/CMakeLists.txt).
echo "Copying build output to ./output/..."
docker compose -f docker/docker-compose.yml exec kicad-wasm-builder \
    bash -c '
        set -e
        mkdir -p /workspace/output
        SRC=/workspace/build-wasm/kicad-calculator/pcb_calculator
        cp "$SRC/calculator.js"   /workspace/output/calculator.js
        cp "$SRC/calculator.wasm" /workspace/output/calculator.wasm
        [ -f "$SRC/calculator.worker.js" ]        && cp "$SRC/calculator.worker.js"        /workspace/output/calculator.worker.js        || true
        [ -f "$SRC/calculator.wasm.map" ]         && cp "$SRC/calculator.wasm.map"         /workspace/output/calculator.wasm.map         || true
        [ -f "$SRC/calculator.wasm.debug.wasm" ]  && cp "$SRC/calculator.wasm.debug.wasm"  /workspace/output/calculator.wasm.debug.wasm  || true
        cp /workspace/build-wasm/kicad-calculator/resources/images.tar.gz /workspace/output/images.tar.gz 2>/dev/null || true
        cp /workspace/build-wasm/wxwidgets/build/wasm/wx.js               /workspace/output/wx.js          2>/dev/null || true
    '

# Inject dynCall shims into the JS loader (fixes Emscripten 4.x dynCall_* errors).
./scripts/common/inject-dyncall-shims.sh output/calculator.js

# Run wasm-emscripten-finalize on host (memory-intensive, skipped inside Docker).
./scripts/common/apply-finalize.sh output/calculator.wasm output/calculator.wasm

# Run wasm-opt --asyncify on host (~20-30GB RAM).
./scripts/common/apply-asyncify.sh output/calculator.wasm output/calculator.wasm

echo ""
echo "Build complete. Output files in ./output/"
ls -lh output/
