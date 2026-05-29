#!/bin/bash
# Copies KiCad WASM build output to test directory
#
# Priority: Use local output/ directory (populated by docker/build.sh)
# Fallback: Copy from Docker volume directly
#
# Copies whichever editors are present (pcbnew, eeschema).

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
KICAD_TEST="$PROJECT_ROOT/tests/apps/kicad"
OUTPUT_DIR="$PROJECT_ROOT/output"

mkdir -p "$KICAD_TEST"

# Copy one editor's artifacts (js, wasm, optional debug/map/worker). Returns 0
# if the editor was present, 1 if neither output/ nor the docker volume has it.
copy_app() {
    local app="$1"

    if [ -f "$OUTPUT_DIR/${app}.js" ] && [ -f "$OUTPUT_DIR/${app}.wasm" ]; then
        echo "Copying ${app} WASM files from output directory..."
        cp "$OUTPUT_DIR/${app}.js" "$KICAD_TEST/"
        cp "$OUTPUT_DIR/${app}.wasm" "$KICAD_TEST/"
        cp "$OUTPUT_DIR/${app}.wasm.map" "$KICAD_TEST/" 2>/dev/null || true
        cp "$OUTPUT_DIR/${app}.worker.js" "$KICAD_TEST/" 2>/dev/null || true
        cp "$OUTPUT_DIR/images.tar.gz" "$KICAD_TEST/" 2>/dev/null || true
        return 0
    fi

    echo "Output ${app} not found locally, trying Docker volume..."
    if docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
         kicad-wasm-builder:/workspace/build-wasm/kicad-${app}/${app}/${app}.js "$KICAD_TEST/" 2>/dev/null \
       && docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
         kicad-wasm-builder:/workspace/build-wasm/kicad-${app}/${app}/${app}.wasm "$KICAD_TEST/" 2>/dev/null; then
        docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
            kicad-wasm-builder:/workspace/build-wasm/kicad-${app}/${app}/${app}.wasm.map "$KICAD_TEST/" 2>/dev/null || true
        docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
            kicad-wasm-builder:/workspace/build-wasm/kicad-${app}/${app}/${app}.worker.js "$KICAD_TEST/" 2>/dev/null || true
        docker compose -f "$PROJECT_ROOT/docker/docker-compose.yml" cp \
            kicad-wasm-builder:/workspace/build-wasm/kicad-${app}/resources/images.tar.gz "$KICAD_TEST/" 2>/dev/null || true
        return 0
    fi

    echo "  (no ${app} artifacts found — skipping)"
    return 1
}

found_any=0
copy_app pcbnew && found_any=1
copy_app eeschema && found_any=1

if [ "$found_any" -eq 0 ]; then
    echo "Error: neither pcbnew nor eeschema artifacts found in output/ or docker volume" >&2
    exit 1
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
