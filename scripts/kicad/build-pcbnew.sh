#!/bin/bash
# Build KiCad PCBnew for WebAssembly
# This builds the PCB editor as a standalone WASM application
#
# Usage:
#   ./scripts/kicad/build-pcbnew.sh [options]
#
# Options:
#   --no-clean    Skip cleaning the build directory (default: clean before build)
#   --skip-deps   Skip building dependencies
#   --debug       Build with debug symbols

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../common/env.sh"
source "${SCRIPT_DIR}/../common/versions.sh"
source "${SCRIPT_DIR}/../common/functions.sh"

KICAD_DIR="${PROJECT_ROOT}/kicad"
KICAD_BUILD="${BUILD_ROOT}/kicad-pcbnew"
KICAD_STAMP="${BUILD_ROOT}/stamps/kicad-pcbnew.stamp"
WASM_LAYER="${PROJECT_ROOT}/wasm"
WX_BUILD="${BUILD_ROOT}/wxwidgets-universal"

# Parse arguments - clean by default
NO_CLEAN=0
SKIP_DEPS=0
DEBUG=0
for arg in "$@"; do
    case $arg in
        --no-clean)
            NO_CLEAN=1
            ;;
        --skip-deps)
            SKIP_DEPS=1
            ;;
        --debug)
            DEBUG=1
            ;;
    esac
done

# Step 1: Clean build directory (default behavior)
if [ $NO_CLEAN -eq 0 ]; then
    log_info "Cleaning KiCad PCBnew build directory..."
    rm -rf "${KICAD_BUILD}" "${KICAD_STAMP}"
else
    log_info "Skipping clean (--no-clean specified)"
fi

# Step 2: Build dependencies
if [ $SKIP_DEPS -eq 0 ]; then
    log_info "Building dependencies..."
    "${SCRIPT_DIR}/../deps/build-all-deps.sh" --all
else
    log_info "Skipping dependencies (--skip-deps specified)"
fi

# Step 3: Check if already built (only relevant with --no-clean)
if [ $NO_CLEAN -eq 1 ] && check_stamp "${KICAD_STAMP}"; then
    log_info "KiCad PCBnew already built, skipping..."
    exit 0
fi

# Step 4: Verify wxWidgets is built
if [ ! -f "${WX_BUILD}/lib/libwx_baseu-3.2.a" ]; then
    log_error "wxWidgets not found. Please build wxWidgets first with:"
    log_error "  ./scripts/build-wxuniversal-wasm.sh"
    exit 1
fi

log_info "Building KiCad PCBnew ${KICAD_VERSION} for WASM..."

# Step 5: Set build type
if [ $DEBUG -eq 1 ]; then
    BUILD_TYPE="Debug"
    EXTRA_FLAGS="-g -O0"
else
    BUILD_TYPE="Release"
    EXTRA_FLAGS="-O2"
fi

# Step 6: Create build directory
mkdir -p "${KICAD_BUILD}"
cd "${KICAD_BUILD}"

# Step 7: Configure KiCad with CMake
# We use CMAKE_MODULE_PATH to inject our compatibility layer
log_info "Configuring KiCad with CMake..."
emcmake cmake "${KICAD_DIR}" \
    -DCMAKE_BUILD_TYPE=${BUILD_TYPE} \
    -DCMAKE_INSTALL_PREFIX="${SYSROOT}" \
    -DCMAKE_MODULE_PATH="${WASM_LAYER}/cmake" \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
    -DCMAKE_CXX_FLAGS="${EXTRA_FLAGS} -pthread -DKICAD_USE_PLATFORM_WASM=1 -I${SYSROOT}/include" \
    -DCMAKE_C_FLAGS="${EXTRA_FLAGS} -pthread -I${SYSROOT}/include" \
    -DCMAKE_EXE_LINKER_FLAGS="-pthread -sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=65536 -sUSE_PTHREADS=1 -sPTHREAD_POOL_SIZE=4 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=256MB -sMAXIMUM_MEMORY=4GB -L${SYSROOT}/lib" \
    -DCMAKE_PREFIX_PATH="${SYSROOT};${WX_BUILD}" \
    -DwxWidgets_CONFIG_EXECUTABLE="${WX_BUILD}/wx-config" \
    \
    -DKICAD_BUILD_QA_TESTS=OFF \
    -DKICAD_SCRIPTING=OFF \
    -DKICAD_SCRIPTING_PYTHON3=OFF \
    -DKICAD_SCRIPTING_WXPYTHON=OFF \
    -DKICAD_SPICE=OFF \
    -DKICAD_USE_OCC=OFF \
    -DKICAD_USE_EGL=OFF \
    -DKICAD_USE_BUNDLED_GLEW=ON \
    \
    -DZSTD_ROOT="${SYSROOT}" \
    -DZSTD_INCLUDE_DIR="${SYSROOT}/include" \
    -DZSTD_LIBRARY="${SYSROOT}/lib/libzstd.a" \
    -DGLM_INCLUDE_DIR="${SYSROOT}/include" \
    \
    -DBUILD_GITHUB_PLUGIN=OFF \
    -DKICAD_PCM=OFF

# Step 8: Build pcbnew target
log_info "Building pcbnew..."
JOBS=${JOBS:-$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)}
emmake make -j${JOBS} pcbnew

# Step 9: Create stamp file
create_stamp "${KICAD_STAMP}"
log_info "KiCad PCBnew build complete!"
log_info "Output: ${KICAD_BUILD}/pcbnew/pcbnew.js"
