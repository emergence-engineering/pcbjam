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
#   ./build-wxuniversal-wasm.sh              # Clean build (default)
#   ./build-wxuniversal-wasm.sh --no-clean   # Incremental build

set -e

# Ensure 'python' command is available (macOS only has python3)
# Homebrew's python libexec has the python -> python3 symlink
if [[ -d "/opt/homebrew/opt/python/libexec/bin" ]]; then
    export PATH="/opt/homebrew/opt/python/libexec/bin:$PATH"
elif [[ -d "/usr/local/opt/python/libexec/bin" ]]; then
    export PATH="/usr/local/opt/python/libexec/bin:$PATH"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/build-wasm/wxwidgets-universal"
WX_SOURCE="$PROJECT_ROOT/wxwidgets"

# Use our config.sub wrapper for autoconf projects
# CONFIG_SHELL is critical: nested configures (pcre, etc.) do SHELL=${CONFIG_SHELL-/bin/sh}
# Without CONFIG_SHELL, nested configures would reset SHELL to /bin/sh and bypass our wrapper
export SHELL="$SCRIPT_DIR/config/config-sub-wrapper.sh"
export CONFIG_SHELL="$SCRIPT_DIR/config/config-sub-wrapper.sh"

# Disable autom4te cache to keep submodules clean
export AUTOM4TE="$SCRIPT_DIR/config/autom4te-wrapper.sh"

# Use JOBS from env.sh if set, otherwise use all available cores
JOBS="${JOBS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)}"

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

# Clean by default, unless --no-clean is passed
if [ "$1" != "--no-clean" ]; then
    echo "Cleaning build directory (use --no-clean to skip)..."
    rm -rf "$BUILD_DIR"
fi

# Create build directory
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Determine if we need to run configure
# Skip configure if:
# 1. Makefile exists (already configured)
# 2. configure.in hasn't changed since last configure
NEEDS_CONFIGURE=0
if [ ! -f "$BUILD_DIR/Makefile" ]; then
    echo "Not configured yet, will run configure..."
    NEEDS_CONFIGURE=1
elif [ "$WX_SOURCE/configure.in" -nt "$BUILD_DIR/Makefile" ]; then
    echo "configure.in changed since last configure, will reconfigure..."
    NEEDS_CONFIGURE=1
elif [ "$WX_SOURCE/configure" -nt "$BUILD_DIR/Makefile" ]; then
    echo "configure script changed, will reconfigure..."
    NEEDS_CONFIGURE=1
else
    echo "Already configured, skipping configure (use clean build to reconfigure)"
fi

if [ $NEEDS_CONFIGURE -eq 1 ]; then
    # Configure with emconfigure
    # Key flags based on wxWidgets-wasm:
    # --host=emscripten          Host system (detected via config.sub)
    # --enable-universal         Use wxUniversal (draws widgets directly)
    # --disable-shared           Build static libraries
    # --with-opengl              Enable OpenGL/WebGL support
    # --enable-exceptions        Enable C++ exceptions (needed for KiCad debug builds)
    # --disable-richtext         Not needed for KiCad, simplifies build
    # --without-libtiff          Avoid external dependencies
    # --disable-xlocale          Browser environment handles locale

    echo ""
    echo "=== Configuring ==="

    # Ensure Emscripten's zlib port is built (works in Docker and on host)
    # This populates the cache sysroot with zlib.h and libz.a
    echo "Building Emscripten zlib port..."
    embuilder build zlib

    # Get Emscripten cache sysroot path (portable across environments)
    EM_CACHE_SYSROOT="$(em-config CACHE)/sysroot"
    echo "Emscripten cache sysroot: $EM_CACHE_SYSROOT"

    # Set flags for Emscripten compatibility
    # Z_HAVE_UNISTD_H ensures zlib includes <unistd.h> for read/write/lseek
    # Include pcre2 headers from the build directory (generated during configure)
    PCRE2_INCLUDE="$BUILD_DIR/3rdparty/pcre/src"

    # Configure debug/release flags based on DEBUG_BUILD environment variable
    if [ "${DEBUG_BUILD:-1}" = "1" ]; then
        WX_DEBUG_FLAGS="-g -O1"
        WX_CONFIGURE_DEBUG="--enable-debug"
        echo "Building wxWidgets in DEBUG mode"
    else
        WX_DEBUG_FLAGS="-O2"
        WX_CONFIGURE_DEBUG=""
        echo "Building wxWidgets in RELEASE mode"
    fi

    # Include emscripten cache sysroot for zlib headers
    export CFLAGS="-DZ_HAVE_UNISTD_H=1 -I$EM_CACHE_SYSROOT/include ${WX_DEBUG_FLAGS} -fexceptions -pthread -matomics -mbulk-memory"
    export CXXFLAGS="-DZ_HAVE_UNISTD_H=1 -I$EM_CACHE_SYSROOT/include -I$PCRE2_INCLUDE ${WX_DEBUG_FLAGS} -fexceptions -pthread -matomics -mbulk-memory"
    export LDFLAGS="-L$EM_CACHE_SYSROOT/lib/wasm32-emscripten"

    emconfigure "$WX_SOURCE/configure" \
        --host=emscripten \
        --without-subdirs \
        --enable-universal \
        --disable-shared \
        --with-opengl \
        --enable-exceptions \
        --disable-richtext \
        --without-libtiff \
        --disable-xlocale \
        --with-cxx=17 \
        --enable-utf8 \
        --with-zlib=sys \
        ${WX_CONFIGURE_DEBUG}

    # Build PCRE first to avoid race condition with parallel builds
    # PCRE headers (pcre2.h) must be generated before regex.cpp compiles
    echo ""
    echo "=== Building PCRE first (dependency) ==="
    emmake make -C 3rdparty/pcre
fi

# Build wxWidgets
echo ""
echo "=== Building wxWidgets (using ${JOBS} parallel jobs) ==="
emmake make -j${JOBS}

# Create library symlinks (remove -emscripten suffix for CMake compatibility)
echo ""
echo "=== Creating library symlinks ==="
cd "$BUILD_DIR/lib"
for lib in *-emscripten.a; do
    # Skip symlinks - only process real files (stub symlinks are handled below)
    if [ -f "$lib" ] && [ ! -L "$lib" ]; then
        newname="${lib/-emscripten/}"
        rm -f "$newname"  # Remove existing symlink/file to avoid conflicts
        ln -sf "$lib" "$newname"
    fi
done

# Create stub libraries for components wx-config reports but we didn't build
# KiCad doesn't use these directly
echo "Creating stub libraries..."
for stub in richtext webview; do
    # Remove any existing symlinks first to avoid "same file" errors
    rm -f "libwx_wasmunivu_${stub}-3.2.a" "libwx_wasmunivu_${stub}-3.2-emscripten.a"
    emar rcs "libwx_wasmunivu_${stub}-3.2.a"
    ln -sf "libwx_wasmunivu_${stub}-3.2.a" "libwx_wasmunivu_${stub}-3.2-emscripten.a"
done

cd "$BUILD_DIR"

echo ""
echo "=== Build complete ==="
ls -lh "$BUILD_DIR"/lib/*.a 2>/dev/null || echo "Libraries built in $BUILD_DIR/lib"
