#!/bin/bash
# Open interactive shell in build container for debugging
set -e

cd "$(dirname "$0")/.."

# Start container if not running
docker compose -f docker/docker-compose.yml up -d

# Open interactive shell
docker compose -f docker/docker-compose.yml exec kicad-wasm-builder bash
