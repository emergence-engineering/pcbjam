#!/bin/bash
# Build wxBase (non-GUI wxWidgets) for WebAssembly
# This builds only the base utilities needed by KiCad core (wxString, wxFile, etc.)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/build-wasm/wxwidgets"
WX_SOURCE="$PROJECT_ROOT/wxwidgets"

echo "=== Building wxBase for WASM ==="
echo "Project root: $PROJECT_ROOT"
echo "Build dir: $BUILD_DIR"
echo "wxWidgets source: $WX_SOURCE"

# Verify we're in the right place
if [ ! -f "$WX_SOURCE/CMakeLists.txt" ]; then
    echo "ERROR: wxWidgets source not found at $WX_SOURCE"
    echo "Make sure the wxwidgets submodule is initialized"
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
# Disable all GUI and most optional features - we only need wxBase utilities
# Note: zlib/expat "builtin" versions use POSIX file descriptors not available in WASM,
# so we disable them. We'll use Emscripten's ports if compression is needed.
emcmake cmake "$WX_SOURCE" \
    -DwxUSE_GUI=OFF \
    -DwxBUILD_SHARED=OFF \
    -DwxBUILD_SAMPLES=OFF \
    -DwxBUILD_TESTS=OFF \
    -DwxBUILD_DEMOS=OFF \
    -DwxBUILD_BENCHMARKS=OFF \
    -DwxUSE_REGEX=OFF \
    -DwxUSE_ZLIB=OFF \
    -DwxUSE_EXPAT=OFF \
    -DwxUSE_LIBJPEG=OFF \
    -DwxUSE_LIBPNG=OFF \
    -DwxUSE_LIBTIFF=OFF \
    -DwxUSE_WEBREQUEST=OFF \
    -DwxUSE_SECRETSTORE=OFF \
    -DwxUSE_LIBSDL=OFF \
    -DwxUSE_LIBMSPACK=OFF \
    -DwxUSE_FSWATCHER=OFF \
    -DwxUSE_XLOCALE=OFF \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5

# Build
echo ""
echo "=== Building ==="
emmake make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu)

echo ""
echo "=== Build complete ==="
ls -lh "$BUILD_DIR"/lib/*.a 2>/dev/null || echo "Libraries built in $BUILD_DIR"