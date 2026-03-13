#!/bin/bash
#
# Build script for the WebGL GAL test harness (WASM)
#
# This builds a WASM module that renders GAL test scenarios using WebGL,
# allowing comparison against native OpenGL rendering.
#
# Uses a Makefile with direct em++ calls (like build-wasm-test.sh)
# to avoid emcmake Python 3.10+ requirement.
#
# Usage:
#   ./scripts/build-gal-webgl-test.sh              # Clean build (default)
#   ./scripts/build-gal-webgl-test.sh --no-clean   # Incremental build
#   ./scripts/build-gal-webgl-test.sh --debug      # Debug build with source maps
#

# Redirect all output to a log file (re-execs script with redirection)
source "$(dirname "$0")/common/logging.sh"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source common environment (sets up local emsdk)
QUIET=1 source "$SCRIPT_DIR/common/env.sh"

TEST_DIR="$PROJECT_ROOT/tests/gal-regression/wasm"
OUTPUT_DIR="$PROJECT_ROOT/tests/apps/gal-webgl"

echo "Building GAL WebGL Test..."
echo "  Test dir: $TEST_DIR"
echo "  Output dir: $OUTPUT_DIR"
echo "  EMSDK_PYTHON: ${EMSDK_PYTHON:-NOT SET}"
echo "  clang: $(which clang)"

# Verify em++ is available
if ! command -v em++ &> /dev/null; then
    echo "ERROR: em++ not found. Run: ./scripts/setup-emsdk.sh"
    exit 1
fi

echo "  Emscripten: $(em++ --version 2>&1 | head -1)"

# Parse arguments
# Default: clean build to avoid stale object file issues (header deps not tracked in old builds)
DEBUG_BUILD=0
CLEAN_BUILD=1

for arg in "$@"; do
    if [ "$arg" = "--debug" ]; then
        DEBUG_BUILD=1
    elif [ "$arg" = "--no-clean" ]; then
        CLEAN_BUILD=0
    fi
done

# Build using Makefile (compiles WebGL sources directly from kicad/)
cd "$TEST_DIR"

if [ "$CLEAN_BUILD" = "1" ]; then
    echo ""
    echo "Cleaning..."
    make clean 2>/dev/null || true
fi

# Always remove output files to ensure linker flags changes take effect
# (Makefile only tracks object file dependencies, not linker flag changes)
rm -f "$OUTPUT_DIR"/*.js "$OUTPUT_DIR"/*.wasm 2>/dev/null || true

# Generate shaders (converts GLSL 1.20 to GLSL ES 3.00)
# TODO: Eventually these should come from KiCad's build
echo ""
echo "Generating WebGL shaders..."
python3 generate_shaders.py

echo ""
echo "Building..."
if [ "$DEBUG_BUILD" = "1" ]; then
    make DEBUG=1
else
    make
fi

echo ""
echo "Build successful!"
echo ""
echo "Files in $OUTPUT_DIR:"
ls -lh "$OUTPUT_DIR"
echo ""
echo "To test locally:"
echo "  cd $PROJECT_ROOT/tests"
echo "  npx serve apps"
echo "  # Open http://localhost:3000/gal-webgl/gal_webgl_test.html"
