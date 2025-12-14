#!/bin/bash
# Build KiCad PCBnew for WebAssembly
# This builds the PCB editor as a standalone WASM application
#
# Usage:
#   ./scripts/kicad/build-pcbnew.sh [options]
#
# Options:
#   --clean       Full clean rebuild (dependencies + KiCad)
#   --no-clean    Skip cleaning the build directory (default: clean KiCad only)
#   --skip-deps   Skip building dependencies
#   --debug       Build with debug symbols (default)
#   --release     Build optimized without debug symbols
#   -j N          Parallel compilation jobs (default: 1)

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

# Parse arguments - clean KiCad by default
NO_CLEAN=0
FULL_CLEAN=0
SKIP_DEPS=0
DEBUG=0
while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            FULL_CLEAN=1
            shift
            ;;
        --no-clean)
            NO_CLEAN=1
            shift
            ;;
        --skip-deps)
            SKIP_DEPS=1
            shift
            ;;
        --debug)
            DEBUG=1
            shift
            ;;
        --release)
            DEBUG_BUILD=0
            export DEBUG_BUILD
            shift
            ;;
        -j)
            export JOBS="$2"
            shift 2
            ;;
        -j*)
            export JOBS="${1#-j}"
            shift
            ;;
        *)
            shift
            ;;
    esac
done

log_info "Using ${JOBS} parallel jobs"

# Step 1: Clean build directories
if [ $FULL_CLEAN -eq 1 ]; then
    log_info "Full clean: removing all stamps and build directories..."
    rm -rf "${STAMPS_DIR}"/*
    rm -rf "${BUILD_ROOT}/deps"/*
    rm -rf "${BUILD_ROOT}/wxwidgets-universal"
    rm -rf "${BUILD_ROOT}/stubs"
    rm -rf "${KICAD_BUILD}"
    rm -rf "${SYSROOT}"/*
elif [ $NO_CLEAN -eq 0 ]; then
    log_info "Cleaning KiCad PCBnew build directory..."
    rm -rf "${KICAD_BUILD}" "${KICAD_STAMP}"
else
    log_info "Skipping clean (--no-clean specified)"
fi

# Step 2: Build dependencies
# Note: --with-occ for OpenCASCADE, but NOT ngspice since KICAD_SPICE=OFF
if [ $SKIP_DEPS -eq 0 ]; then
    log_info "Building dependencies..."
    "${SCRIPT_DIR}/../deps/build-all-deps.sh" --with-occ
else
    log_info "Skipping dependencies (--skip-deps specified)"
fi

# Step 3: Check if already built (only relevant with --no-clean)
if [ $NO_CLEAN -eq 1 ] && check_stamp "${KICAD_STAMP}"; then
    log_info "KiCad PCBnew already built, skipping..."
    exit 0
fi

# Step 4: Build wxWidgets if not present
WXWIDGETS_STAMP="${BUILD_ROOT}/stamps/wxwidgets.stamp"
if [ ! -f "${WX_BUILD}/lib/libwx_baseu-3.2.a" ]; then
    log_info "Building wxWidgets..."
    "${SCRIPT_DIR}/../build-wxuniversal-wasm.sh" --no-clean
    # Create stamp after successful build
    touch "${WXWIDGETS_STAMP}"
elif [ ! -f "${WXWIDGETS_STAMP}" ]; then
    # Library exists but no stamp - create one
    touch "${WXWIDGETS_STAMP}"
fi

log_info "Building KiCad PCBnew ${KICAD_VERSION} for WASM..."

# Step 5: Set build type
# Use environment DEBUG_BUILD if set, otherwise check local --debug flag
# -fexceptions is required because wxWidgets is built with exceptions enabled
# -matomics -mbulk-memory are required for shared memory (pthreads)
# NOTE: We use -O1 for debug builds because -O0 produces WASM with too many
# locals for V8/Chrome to compile (error: "local count too large").
# -O1 keeps debug info but optimizes enough to stay under V8's limits.
if [ "${DEBUG_BUILD:-0}" = "1" ] || [ $DEBUG -eq 1 ]; then
    BUILD_TYPE="Debug"
    EXTRA_FLAGS="-g -O1 -fexceptions -matomics -mbulk-memory"
    # -O0 at link time skips wasm-opt (which can OOM on large WASM with debug symbols)
    LINKER_DEBUG_FLAGS="-O0 -g -gsource-map -fexceptions"
    log_info "Building KiCad in DEBUG mode (with source maps, -O1 for WASM compatibility)"
else
    BUILD_TYPE="Release"
    EXTRA_FLAGS="-O2 -fexceptions -matomics -mbulk-memory"
    # -O0 at link time skips wasm-opt (which can OOM on large WASM files)
    # Compilation is still -O2 for optimized code, but we skip post-link wasm-opt
    LINKER_DEBUG_FLAGS="-O0 -fexceptions"
    log_info "Building KiCad in RELEASE mode (skipping wasm-opt due to memory limits)"
fi

# Step 6: Create build directory
mkdir -p "${KICAD_BUILD}"
cd "${KICAD_BUILD}"

# Step 6.1: Build stub libraries for missing symbols
STUBS_DIR="${PROJECT_ROOT}/wasm/stubs"
STUBS_BUILD="${BUILD_ROOT}/stubs"
mkdir -p "${STUBS_BUILD}"

log_info "Building stub libraries..."
# Compile libgit2 stub
emcc -c "${STUBS_DIR}/libgit2_stub.c" -o "${STUBS_BUILD}/libgit2_stub.o"
emar rcs "${STUBS_BUILD}/libgit2_stub.a" "${STUBS_BUILD}/libgit2_stub.o"

# Compile curl stub
emcc -c "${STUBS_DIR}/curl_stub.c" -o "${STUBS_BUILD}/curl_stub.o"
emar rcs "${STUBS_BUILD}/libcurl_stub.a" "${STUBS_BUILD}/curl_stub.o"

log_info "Stub libraries built"

# Step 6.2: Replace Emscripten's wasm-opt with stub to bypass asyncify transformation
# This allows Emscripten to generate JS with Asyncify runtime, but we run the real
# wasm-opt --asyncify on the host where more RAM is available (needs 50GB+ for KiCad)
EMSDK_WASM_OPT="/emsdk/upstream/bin/wasm-opt"
if [ -f "${EMSDK_WASM_OPT}" ] && [ ! -f "${EMSDK_WASM_OPT}.real" ]; then
    log_info "Backing up real wasm-opt..."
    mv "${EMSDK_WASM_OPT}" "${EMSDK_WASM_OPT}.real"
fi
# Always copy the latest stub (in case it was updated)
cp "${STUBS_DIR}/wasm-opt-stub.sh" "${EMSDK_WASM_OPT}"
chmod +x "${EMSDK_WASM_OPT}"
log_info "wasm-opt stub installed (asyncify will run on host)"

# Step 6.5: Verify WASM support is in KiCad fork
# The kicad submodule should already have WASM port detection and kiplatform support
KICAD_CMAKE="${KICAD_DIR}/CMakeLists.txt"
if ! grep -q "msw|qt|gtk|osx|wasm" "${KICAD_CMAKE}"; then
    log_error "KiCad fork is missing WASM port detection support."
    log_error "Please ensure the kicad submodule has WASM modifications."
    exit 1
fi
KIPLATFORM_CMAKE="${KICAD_DIR}/libs/kiplatform/CMakeLists.txt"
if ! grep -q "KICAD_WX_PORT STREQUAL wasm" "${KIPLATFORM_CMAKE}"; then
    log_error "KiCad fork is missing kiplatform WASM support."
    log_error "Please ensure the kicad submodule has WASM modifications."
    exit 1
fi
log_info "KiCad WASM support verified"

# Step 7: Configure KiCad with CMake
# We use CMAKE_MODULE_PATH to inject our compatibility layer
log_info "Configuring KiCad with CMake..."
emcmake cmake "${KICAD_DIR}" \
    -DCMAKE_BUILD_TYPE=${BUILD_TYPE} \
    -DCMAKE_INSTALL_PREFIX="${SYSROOT}" \
    -DCMAKE_MODULE_PATH="${WASM_LAYER}/cmake" \
    -DSYSROOT="${SYSROOT}" \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
    -DCMAKE_CXX_FLAGS="${EXTRA_FLAGS} -pthread -sUSE_ZLIB=1 -DKICAD_USE_PLATFORM_WASM=1 -I${SYSROOT}/include" \
    -DCMAKE_C_FLAGS="${EXTRA_FLAGS} -pthread -sUSE_ZLIB=1 -I${SYSROOT}/include" \
    -DCMAKE_EXE_LINKER_FLAGS="${LINKER_DEBUG_FLAGS} -pthread -sUSE_ZLIB=1 -sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=65536 -sUSE_PTHREADS=1 -sPTHREAD_POOL_SIZE=4 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=256MB -sMAXIMUM_MEMORY=4GB -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8'] -L${SYSROOT}/lib ${STUBS_BUILD}/libgit2_stub.a ${STUBS_BUILD}/libcurl_stub.a" \
    -DCMAKE_PREFIX_PATH="${SYSROOT};${WX_BUILD}" \
    -DwxWidgets_CONFIG_EXECUTABLE="${WX_BUILD}/wx-config" \
    \
    -DKICAD_BUILD_QA_TESTS=OFF \
    -DKICAD_SPICE=OFF \
    -DKICAD_USE_EGL=OFF \
    -DKICAD_USE_BUNDLED_GLEW=ON \
    \
    -DZSTD_ROOT="${SYSROOT}" \
    -DZSTD_INCLUDE_DIR="${SYSROOT}/include" \
    -DZSTD_LIBRARY="${SYSROOT}/lib/libzstd.a" \
    -DGLM_INCLUDE_DIR="${SYSROOT}/include" \
    -DBOOST_ROOT="${SYSROOT}" \
    -DBoost_INCLUDE_DIR="${SYSROOT}/include" \
    -DBoost_LIBRARY_DIR="${SYSROOT}/lib" \
    -DBoost_NO_SYSTEM_PATHS=ON \
    -DBoost_NO_BOOST_CMAKE=ON \
    -DFREETYPE_INCLUDE_DIR_ft2build="${SYSROOT}/include/freetype2" \
    -DFREETYPE_INCLUDE_DIR_freetype2="${SYSROOT}/include/freetype2" \
    -DFREETYPE_LIBRARY="${SYSROOT}/lib/libfreetype.a" \
    -DHarfBuzz_INCLUDE_DIR="${SYSROOT}/include/harfbuzz" \
    -DHarfBuzz_LIBRARY="${SYSROOT}/lib/libharfbuzz.a" \
    -DOCC_INCLUDE_DIR="${SYSROOT}/include/opencascade" \
    -DOCC_LIBRARY_DIR="${SYSROOT}/lib" \
    -DProtobuf_INCLUDE_DIR="${SYSROOT}/include" \
    -DProtobuf_LIBRARY="${SYSROOT}/lib/libprotobuf.a" \
    -DProtobuf_LITE_LIBRARY="${SYSROOT}/lib/libprotobuf-lite.a" \
    -DODBC_CONFIG:STRING="stub-for-wasm" \
    -DODBCLIB:STRING="" \
    -DODBC_CFLAGS:STRING="" \
    -DODBC_LINK_FLAGS:STRING="" \
    -DODBC_LIBRARIES:STRING="" \
    \
    -DBUILD_GITHUB_PLUGIN=OFF \
    -DKICAD_PCM=OFF

# Step 8: Build pcbnew target
log_info "Building pcbnew..."
# JOBS is set in env.sh (default: 1 for sequential builds, use -j N to override)
emmake make -j${JOBS} pcbnew

# Step 9: Create stamp file
create_stamp "${KICAD_STAMP}"
log_info "KiCad PCBnew build complete!"
log_info "Output: ${KICAD_BUILD}/pcbnew/pcbnew.js"
