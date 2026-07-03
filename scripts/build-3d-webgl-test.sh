#!/bin/bash
#
# Build script for the 3D-renderer WebGL test harness (WASM).
#
# Builds the shared 3D scenarios (tests/3d-regression/scenarios) + real KiCad
# 3D-viewer TUs against the wasm/gl1 GL1->WebGL2 emulation layer (the
# OpenGL->WebGL port). Output: tests/apps/3d-webgl/.
#
# Requires the wxWidgets WASM build (scripts/build-wx-wasm.sh) and the sysroot
# headers (boost/glm) in build-wasm/sysroot.
#
# Usage:
#   ./scripts/build-3d-webgl-test.sh              # Clean build (default)
#   ./scripts/build-3d-webgl-test.sh --no-clean   # Incremental build
#   ./scripts/build-3d-webgl-test.sh --debug      # Debug build with source maps
#
# Modeled on scripts/build-gal-webgl-test.sh (no shader-generation step — the
# gl1 shim's FFP uber-shader lives inline in wasm/gl1/src/gl1_shaders.cpp).
#

source "$(dirname "$0")/common/logging.sh"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

JOBS="${JOBS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)}"

QUIET=1 source "$SCRIPT_DIR/common/env.sh"

TEST_DIR="$PROJECT_ROOT/tests/3d-regression/wasm"
OUTPUT_DIR="$PROJECT_ROOT/tests/apps/3d-webgl"

echo "Building 3D WebGL Test (red-state harness)..."
echo "  Test dir: $TEST_DIR"
echo "  Output dir: $OUTPUT_DIR"

if ! command -v em++ &> /dev/null; then
    echo "ERROR: em++ not found. Run: ./scripts/setup-emsdk.sh"
    exit 1
fi

if [ ! -x "$PROJECT_ROOT/build-wasm/wxwidgets/wx-config" ]; then
    echo "ERROR: wxWidgets WASM build missing. Run: ./scripts/build-wx-wasm.sh"
    exit 1
fi

echo "  Emscripten: $(em++ --version 2>&1 | head -1)"

DEBUG_BUILD=0
CLEAN_BUILD=1

for arg in "$@"; do
    case "$arg" in
        --debug) DEBUG_BUILD=1 ;;
        --no-clean) CLEAN_BUILD=0 ;;
    esac
done

cd "$TEST_DIR"

if [ "$CLEAN_BUILD" = "1" ]; then
    make clean || true
fi

rm -f "$OUTPUT_DIR"/*.js "$OUTPUT_DIR"/*.wasm

if [ "$DEBUG_BUILD" = "1" ]; then
    make -j"$JOBS" DEBUG=1
else
    make -j"$JOBS"
fi

echo "Build successful: $OUTPUT_DIR/3d_webgl_test.{js,wasm,html}"
echo "Serve with: cd tests && npm run serve  ->  /3d-webgl/3d_webgl_test.html"
