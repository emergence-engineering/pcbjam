#!/bin/bash
#
# KiCad Wasm Port - Build Script
#
# This script builds KiCad with optional dependencies disabled.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
KICAD_DIR="$PROJECT_ROOT/kicad"
BUILD_DIR="$PROJECT_ROOT/build"
CMAKE_MODULE_PATH="$PROJECT_ROOT/cmake"
STUBS_DIR="$PROJECT_ROOT/stubs/include"

# Default options
USE_CURL="${KICAD_USE_CURL:-OFF}"
USE_GIT="${KICAD_USE_GIT:-OFF}"
USE_OCC="${KICAD_USE_OCC:-OFF}"
USE_NGSPICE="${KICAD_USE_NGSPICE:-OFF}"
BUILD_TYPE="${CMAKE_BUILD_TYPE:-Release}"
PARALLEL_JOBS="${PARALLEL_JOBS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)}"

show_help() {
    echo "KiCad Wasm Port - Build Script"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --with-curl         Enable CURL (network features)"
    echo "  --with-git          Enable libgit2 (git integration)"
    echo "  --with-occ          Enable OpenCASCADE (STEP/3D)"
    echo "  --with-ngspice      Enable ngspice (SPICE simulation)"
    echo "  --debug             Build in Debug mode"
    echo "  --clean             Clean build directory first"
    echo "  -j N                Number of parallel jobs (default: $PARALLEL_JOBS)"
    echo "  --configure-only    Only run cmake, don't build"
    echo "  -h, --help          Show this help"
    echo ""
    echo "Environment variables:"
    echo "  KICAD_USE_CURL=ON|OFF      (default: OFF)"
    echo "  KICAD_USE_GIT=ON|OFF       (default: OFF)"
    echo "  KICAD_USE_OCC=ON|OFF       (default: OFF)"
    echo "  KICAD_USE_NGSPICE=ON|OFF   (default: OFF)"
    echo "  CMAKE_BUILD_TYPE=Release|Debug"
    echo ""
}

CLEAN_BUILD=0
CONFIGURE_ONLY=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --with-curl)
            USE_CURL=ON
            shift
            ;;
        --with-git)
            USE_GIT=ON
            shift
            ;;
        --with-occ)
            USE_OCC=ON
            shift
            ;;
        --with-ngspice)
            USE_NGSPICE=ON
            shift
            ;;
        --debug)
            BUILD_TYPE=Debug
            shift
            ;;
        --clean)
            CLEAN_BUILD=1
            shift
            ;;
        -j)
            PARALLEL_JOBS="$2"
            shift 2
            ;;
        --configure-only)
            CONFIGURE_ONLY=1
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

echo "=== KiCad Wasm Port - Build ==="
echo ""
echo "Configuration:"
echo "  Build type:    $BUILD_TYPE"
echo "  CURL:          $USE_CURL"
echo "  Git:           $USE_GIT"
echo "  OpenCASCADE:   $USE_OCC"
echo "  ngspice:       $USE_NGSPICE"
echo "  Parallel jobs: $PARALLEL_JOBS"
echo ""

# Check if kicad exists
if [ ! -f "$KICAD_DIR/CMakeLists.txt" ]; then
    echo "Error: KiCad source not found at $KICAD_DIR"
    echo "Run: git submodule update --init --recursive"
    exit 1
fi

# Clean if requested
if [ $CLEAN_BUILD -eq 1 ] && [ -d "$BUILD_DIR" ]; then
    echo "Cleaning build directory..."
    rm -rf "$BUILD_DIR"
fi

# Create build directory
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Additional include paths for stubs
EXTRA_INCLUDES=""
if [ "$USE_CURL" = "OFF" ] || [ "$USE_GIT" = "OFF" ]; then
    EXTRA_INCLUDES="-DCMAKE_CXX_FLAGS=-I$STUBS_DIR"
fi

# Configure
echo "Running CMake..."
cmake "$KICAD_DIR" \
    -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \
    -DCMAKE_MODULE_PATH="$CMAKE_MODULE_PATH" \
    -DKICAD_USE_CURL="$USE_CURL" \
    -DKICAD_USE_GIT="$USE_GIT" \
    -DKICAD_USE_OCC="$USE_OCC" \
    -DKICAD_USE_NGSPICE="$USE_NGSPICE" \
    -DKICAD_SCRIPTING_WXPYTHON=OFF \
    -DKICAD_BUILD_QA_TESTS=OFF \
    -DKICAD_BUILD_I18N=OFF \
    $EXTRA_INCLUDES

if [ $CONFIGURE_ONLY -eq 1 ]; then
    echo ""
    echo "Configuration complete. Run 'make -j$PARALLEL_JOBS' in $BUILD_DIR to build."
    exit 0
fi

# Build
echo ""
echo "Building..."
cmake --build . --parallel "$PARALLEL_JOBS"

echo ""
echo "=== Build Complete ==="
echo ""
echo "Binaries are in: $BUILD_DIR"
