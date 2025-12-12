#!/bin/bash
# Copies KiCad WASM build output from Docker volume to test directory

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
KICAD_TEST="$PROJECT_ROOT/tests/wasm-app/kicad"

mkdir -p "$KICAD_TEST"

echo "Copying KiCad WASM files from Docker build..."
docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
  kicad-wasm-builder:/workspace/build-wasm/kicad-pcbnew/pcbnew/pcbnew.js "$KICAD_TEST/"
docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
  kicad-wasm-builder:/workspace/build-wasm/kicad-pcbnew/pcbnew/pcbnew.wasm "$KICAD_TEST/"

# Worker file for pthreads (if exists)
docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
  kicad-wasm-builder:/workspace/build-wasm/kicad-pcbnew/pcbnew/pcbnew.worker.js "$KICAD_TEST/" 2>/dev/null || true

# wxWidgets WASM JavaScript glue code (defines JS functions called from WASM)
echo "Copying wxWidgets WASM glue code..."
cp "$PROJECT_ROOT/wxwidgets/build/wasm/wx.js" "$KICAD_TEST/"

echo "KiCad WASM files copied to $KICAD_TEST"
ls -lh "$KICAD_TEST"
