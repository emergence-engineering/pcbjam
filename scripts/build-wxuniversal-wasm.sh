#!/bin/bash
# Build wxWidgets with wxUniversal for WebAssembly
# This builds the GUI-enabled wxWidgets needed for KiCad
#
# Prerequisites:
# - Emscripten SDK installed and activated
# - autoconf (for regenerating configure from configure.in)
#
# To regenerate Makefile.in from bakefiles (after modifying files.bkl):
#   cd wxwidgets/build/bakefiles
#   docker run --rm -v "$(pwd)/../..":"$(pwd)/../.." -w "$(pwd)" \
#     ghcr.io/vslavik/bakefile:0.2 bakefile_gen
#
# Usage:
#   ./build-wxuniversal-wasm.sh           # Build (incremental)
#   ./build-wxuniversal-wasm.sh --clean   # Clean build

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/build-wasm/wxwidgets-universal"
WX_SOURCE="$PROJECT_ROOT/wxwidgets"

echo "=== Building wxWidgets wxUniversal for WASM ==="
echo "Project root: $PROJECT_ROOT"
echo "Build dir: $BUILD_DIR"
echo "wxWidgets source: $WX_SOURCE"

# Verify we're in the right place
if [ ! -f "$WX_SOURCE/configure.in" ]; then
    echo "ERROR: wxWidgets source not found at $WX_SOURCE"
    echo "Make sure the wxwidgets submodule is initialized"
    exit 1
fi

# Regenerate configure if configure.in is newer
if [ "$WX_SOURCE/configure.in" -nt "$WX_SOURCE/configure" ]; then
    echo "configure.in is newer than configure, regenerating..."
    (cd "$WX_SOURCE" && autoconf)
fi

# Clean if requested
if [ "$1" = "--clean" ]; then
    echo "Cleaning build directory..."
    rm -rf "$BUILD_DIR"
fi

# Create build directory
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Configure with emconfigure
# Key flags based on wxWidgets-wasm:
# --host=emscripten          Host system (detected via config.sub)
# --enable-universal         Use wxUniversal (draws widgets directly)
# --disable-shared           Build static libraries
# --with-opengl              Enable OpenGL/WebGL support
# --disable-exceptions       Emscripten doesn't support C++ exceptions well
# --disable-richtext         Not needed for KiCad, simplifies build
# --without-libtiff          Avoid external dependencies
# --disable-xlocale          Browser environment handles locale

echo ""
echo "=== Configuring ==="

# Set flags for Emscripten compatibility
# Z_HAVE_UNISTD_H ensures zlib includes <unistd.h> for read/write/lseek
# Include pcre2 headers from the build directory (generated during configure)
PCRE2_INCLUDE="$BUILD_DIR/3rdparty/pcre/src"
export CFLAGS="-DZ_HAVE_UNISTD_H=1"
export CXXFLAGS="-DZ_HAVE_UNISTD_H=1 -I$PCRE2_INCLUDE"

emconfigure "$WX_SOURCE/configure" \
    --host=emscripten \
    --enable-universal \
    --disable-shared \
    --with-opengl \
    --disable-exceptions \
    --disable-richtext \
    --without-libtiff \
    --disable-xlocale \
    --with-cxx=17 \
    --enable-utf8

# Build PCRE first to avoid race condition with parallel builds
# PCRE headers (pcre2.h) must be generated before regex.cpp compiles
echo ""
echo "=== Building PCRE first (dependency) ==="
emmake make -C 3rdparty/pcre

# Build wxWidgets
echo ""
echo "=== Building wxWidgets ==="
emmake make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu)

echo ""
echo "=== Build complete ==="
ls -lh "$BUILD_DIR"/lib/*.a 2>/dev/null || echo "Libraries built in $BUILD_DIR/lib"
