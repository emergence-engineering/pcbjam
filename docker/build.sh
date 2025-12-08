#!/bin/bash
# Build KiCad WASM inside Docker container
set -e

cd "$(dirname "$0")/.."

# Start container if not running
docker compose -f docker/docker-compose.yml up -d

# Run build command
docker compose -f docker/docker-compose.yml exec kicad-wasm-builder \
    /workspace/scripts/kicad/build-pcbnew.sh "$@"

# Copy output to host-accessible directory
echo "Copying build output to ./output/..."
docker compose -f docker/docker-compose.yml exec kicad-wasm-builder \
    bash -c "mkdir -p /workspace/output && cp -r /workspace/build-wasm/kicad-pcbnew/bin/* /workspace/output/ 2>/dev/null || true"

echo "Build complete. Output files in ./output/"
