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

# Start container if not running
docker compose -f docker/docker-compose.yml up -d

# Run build command (without asyncify - handled on host due to memory requirements)
docker compose -f docker/docker-compose.yml exec kicad-wasm-builder \
    /workspace/scripts/kicad/build-pcbnew.sh "$@"

# Copy output to host-accessible directory
echo "Copying build output to ./output/..."
docker compose -f docker/docker-compose.yml exec kicad-wasm-builder \
    bash -c "mkdir -p /workspace/output && cp /workspace/build-wasm/kicad-pcbnew/pcbnew/pcbnew.{js,wasm,wasm.map,worker.js} /workspace/output/ 2>/dev/null || cp /workspace/build-wasm/kicad-pcbnew/pcbnew/pcbnew.{js,wasm} /workspace/output/"

# Apply asyncify transformation on host
# This is done on the host because wasm-opt --asyncify needs significant RAM
./scripts/common/apply-asyncify.sh output/pcbnew.wasm output/pcbnew.wasm

echo ""
echo "Build complete. Output files in ./output/"
ls -lh output/
