#!/bin/bash
# Build KiCad core library for WebAssembly
# This builds kimath, sexpr, and core utilities with wxBase

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/build-wasm/core"
CORE_SOURCE="$PROJECT_ROOT/core"

echo "=== Building KiCad Core for WASM ==="
echo "Project root: $PROJECT_ROOT"
echo "Build dir: $BUILD_DIR"
echo "Core source: $CORE_SOURCE"

# Verify core source exists
if [ ! -f "$CORE_SOURCE/CMakeLists.txt" ]; then
    echo "ERROR: Core source not found at $CORE_SOURCE"
    exit 1
fi

# Verify wxBase was built
if [ ! -f "$PROJECT_ROOT/build-wasm/wxwidgets/lib/libwx_baseu-3.2-Emscripten.a" ]; then
    echo "ERROR: wxBase not built. Run scripts/build-wxbase-wasm.sh first"
    exit 1
fi

# Clean if requested (must be before mkdir to properly reset CMake cache)
if [ "$1" = "--clean" ]; then
    echo "Cleaning build directory..."
    rm -rf "$BUILD_DIR"
fi

# Create build directory
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Configure with emcmake
echo ""
echo "=== Configuring ==="
emcmake cmake "$CORE_SOURCE" \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_TESTS=OFF

# Build
echo ""
echo "=== Building ==="
emmake make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu)

echo ""
echo "=== Build complete ==="
ls -lh "$BUILD_DIR"/*.a 2>/dev/null || echo "Libraries built in $BUILD_DIR"
