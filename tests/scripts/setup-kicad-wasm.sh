#!/bin/bash
# Copies KiCad WASM build output to test directory
#
# Priority: Use local output/ directory (populated by docker/build.sh)
# Fallback: Copy from Docker volume directly

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
KICAD_TEST="$PROJECT_ROOT/tests/apps/kicad"
OUTPUT_DIR="$PROJECT_ROOT/output"

mkdir -p "$KICAD_TEST"

# Check if output directory has the build files
if [ -f "$OUTPUT_DIR/pcbnew.js" ] && [ -f "$OUTPUT_DIR/pcbnew.wasm" ]; then
    echo "Copying KiCad WASM files from output directory..."
    cp "$OUTPUT_DIR/pcbnew.js" "$KICAD_TEST/"
    cp "$OUTPUT_DIR/pcbnew.wasm" "$KICAD_TEST/"
    # Source map for debug symbols (optional)
    cp "$OUTPUT_DIR/pcbnew.wasm.map" "$KICAD_TEST/" 2>/dev/null || true
    # Worker file for pthreads (optional)
    cp "$OUTPUT_DIR/pcbnew.worker.js" "$KICAD_TEST/" 2>/dev/null || true
    # Bitmap resources for KiCad icons (optional)
    cp "$OUTPUT_DIR/images.tar.gz" "$KICAD_TEST/" 2>/dev/null || true
else
    echo "Output directory not found, copying from Docker build..."
    docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
      kicad-wasm-builder:/workspace/build-wasm/kicad-pcbnew/pcbnew/pcbnew.js "$KICAD_TEST/"
    docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
      kicad-wasm-builder:/workspace/build-wasm/kicad-pcbnew/pcbnew/pcbnew.wasm "$KICAD_TEST/"
    # Source map for debug symbols (optional)
    docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
      kicad-wasm-builder:/workspace/build-wasm/kicad-pcbnew/pcbnew/pcbnew.wasm.map "$KICAD_TEST/" 2>/dev/null || true
    # Worker file for pthreads (optional)
    docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
      kicad-wasm-builder:/workspace/build-wasm/kicad-pcbnew/pcbnew/pcbnew.worker.js "$KICAD_TEST/" 2>/dev/null || true
    # Bitmap resources for KiCad icons (optional)
    docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
      kicad-wasm-builder:/workspace/build-wasm/kicad-pcbnew/resources/images.tar.gz "$KICAD_TEST/" 2>/dev/null || true
fi

# wxWidgets WASM JavaScript glue code (defines JS functions called from WASM)
echo "Copying wxWidgets WASM glue code..."
if [ -f "$OUTPUT_DIR/wx.js" ]; then
    cp "$OUTPUT_DIR/wx.js" "$KICAD_TEST/"
else
    if docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
      kicad-wasm-builder:/workspace/build-wasm/wxwidgets/build/wasm/wx.js "$KICAD_TEST/" 2>/dev/null; then
        :
    else
        cp "$PROJECT_ROOT/wxwidgets/build/wasm/wx.js" "$KICAD_TEST/"
    fi
fi

echo "KiCad WASM files copied to $KICAD_TEST"
ls -lh "$KICAD_TEST"
