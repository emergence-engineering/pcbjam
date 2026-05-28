#!/bin/bash
# Copy PCB Calculator WASM build output to the test directory.
# Mirrors setup-kicad-wasm.sh; differences:
#   - copies calculator.{js,wasm,wasm.map,worker.js} instead of pcbnew.*
#
# Priority: use local output/ (populated by docker/build-calculator.sh).
# Fallback: copy from the Docker volume directly.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
KICAD_TEST="$PROJECT_ROOT/tests/apps/kicad"
OUTPUT_DIR="$PROJECT_ROOT/output"

mkdir -p "$KICAD_TEST"

if [ -f "$OUTPUT_DIR/calculator.js" ] && [ -f "$OUTPUT_DIR/calculator.wasm" ]; then
    echo "Copying Calculator WASM files from output directory..."
    cp "$OUTPUT_DIR/calculator.js" "$KICAD_TEST/"
    cp "$OUTPUT_DIR/calculator.wasm" "$KICAD_TEST/"
    # Source map for debug symbols (optional)
    cp "$OUTPUT_DIR/calculator.wasm.map" "$KICAD_TEST/" 2>/dev/null || true
    # Worker file for pthreads (optional)
    cp "$OUTPUT_DIR/calculator.worker.js" "$KICAD_TEST/" 2>/dev/null || true
    # Bitmap resources for KiCad icons (shared with pcbnew; optional)
    cp "$OUTPUT_DIR/images.tar.gz" "$KICAD_TEST/" 2>/dev/null || true
else
    echo "Output directory not found, copying from Docker build..."
    SRC=/workspace/build-wasm/kicad-calculator/pcb_calculator
    docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
      "kicad-wasm-builder:${SRC}/pcb_calculator.js" "$KICAD_TEST/calculator.js"
    docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
      "kicad-wasm-builder:${SRC}/pcb_calculator.wasm" "$KICAD_TEST/calculator.wasm"
    # Optional artifacts (best-effort).
    docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
      "kicad-wasm-builder:${SRC}/pcb_calculator.wasm.map" "$KICAD_TEST/calculator.wasm.map" 2>/dev/null || true
    docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
      "kicad-wasm-builder:${SRC}/pcb_calculator.worker.js" "$KICAD_TEST/calculator.worker.js" 2>/dev/null || true
    docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
      kicad-wasm-builder:/workspace/build-wasm/kicad-calculator/resources/images.tar.gz "$KICAD_TEST/" 2>/dev/null || true
fi

# wxWidgets WASM glue code (shared with pcbnew).
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

echo "Calculator WASM files copied to $KICAD_TEST"
ls -lh "$KICAD_TEST"
