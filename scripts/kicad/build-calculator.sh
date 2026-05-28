#!/bin/bash
# Build KiCad PCB Calculator for WebAssembly.
# This builds the standalone pcb_calculator app as a single WASM binary.
#
# Mirrors scripts/kicad/build-pcbnew.sh almost verbatim; differences:
#   - separate build tree: build-wasm/kicad-calculator
#   - no pcbnew_scripting_stub (calculator doesn't link scripting)
#   - embind compiles wasm/bindings/calculator_embind.cpp
#   - final make target is `pcb_calculator` (single binary, no kiface MODULE,
#     enabled by the EMSCRIPTEN branch we added to pcb_calculator/CMakeLists.txt)
#
# Usage:
#   ./scripts/kicad/build-calculator.sh [options]
#
# Options (same as build-pcbnew.sh):
#   --full        Full clean rebuild (dependencies + KiCad)
#   --clean-kicad Clean only KiCad-calculator build directory (not deps)
#   --build-deps  Build dependencies (default: skip)
#   --debug       Build with debug symbols (default)
#   --release     Build optimized without debug symbols
#   -j N          Parallel compilation jobs (default: 1)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../common/env.sh"
source "${SCRIPT_DIR}/../common/versions.sh"
source "${SCRIPT_DIR}/../common/functions.sh"

KICAD_DIR="${PROJECT_ROOT}/kicad"
KICAD_BUILD="${BUILD_ROOT}/kicad-calculator"
KICAD_STAMP="${BUILD_ROOT}/stamps/kicad-calculator.stamp"
WASM_LAYER="${PROJECT_ROOT}/wasm"
WX_BUILD="${BUILD_ROOT}/wxwidgets-universal"

# Parse arguments - incremental build by default (optimized for development)
NO_CLEAN=1
FULL_CLEAN=0
SKIP_DEPS=1
DEBUG=0
DIAG_LIST=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --full)
            FULL_CLEAN=1
            NO_CLEAN=0
            SKIP_DEPS=0
            shift
            ;;
        --clean-kicad)
            NO_CLEAN=0
            shift
            ;;
        --build-deps)
            SKIP_DEPS=0
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
        --diag=*)
            DIAG_LIST="${1#--diag=}"
            shift
            ;;
        --diag)
            DIAG_LIST="$2"
            shift 2
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

# Diagnostic preprocessor defines (same as build-pcbnew.sh)
DIAG_DEFINES=""
if [ -n "${DIAG_LIST}" ]; then
    IFS=',' read -ra _diag_cats <<< "${DIAG_LIST}"
    for _cat in "${_diag_cats[@]}"; do
        case "${_cat}" in
            gal)       DIAG_DEFINES="${DIAG_DEFINES} -DKICAD_DIAG_GAL=1" ;;
            coroutine) DIAG_DEFINES="${DIAG_DEFINES} -DKICAD_DIAG_COROUTINE=1" ;;
            ctor)      DIAG_DEFINES="${DIAG_DEFINES} -DKICAD_DIAG_CTOR=1" ;;
            all)       DIAG_DEFINES="${DIAG_DEFINES} -DKICAD_DIAG_GAL=1 -DKICAD_DIAG_COROUTINE=1 -DKICAD_DIAG_CTOR=1" ;;
            "")        ;;
            *)         log_warn "Unknown --diag category: '${_cat}' (valid: gal, coroutine, ctor, all)" ;;
        esac
    done
    log_info "Diagnostic logging enabled:${DIAG_DEFINES}"
fi

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
    log_info "Cleaning KiCad Calculator build directory..."
    rm -rf "${KICAD_BUILD}" "${KICAD_STAMP}"
else
    log_info "Incremental build (use --clean-kicad or --full to clean)"
fi

# Step 2: Build dependencies (shared sysroot with pcbnew)
if [ $SKIP_DEPS -eq 0 ]; then
    log_info "Building dependencies..."
    "${SCRIPT_DIR}/../deps/build-all-deps.sh" --with-occ
else
    log_info "Skipping dependencies (use --build-deps or --full to build)"
fi

# Step 4: Build wxWidgets (shared with pcbnew)
log_info "Building wxWidgets..."
"${SCRIPT_DIR}/../build-wxuniversal-wasm.sh" --no-clean

log_info "Building KiCad PCB Calculator ${KICAD_VERSION} for WASM..."

# Step 5: Set build type (same flags as pcbnew)
if [ "${DEBUG_BUILD:-0}" = "1" ] || [ $DEBUG -eq 1 ]; then
    BUILD_TYPE="Debug"
    EXTRA_FLAGS="-g -O1 -fexceptions -matomics -mbulk-memory"
    LINKER_DEBUG_FLAGS="-O1 -g -gseparate-dwarf -fexceptions"
    log_info "Building Calculator in DEBUG mode (separate DWARF for smaller main binary)"
else
    BUILD_TYPE="Release"
    EXTRA_FLAGS="-O2 -fexceptions -matomics -mbulk-memory"
    LINKER_DEBUG_FLAGS="-O0 -fexceptions"
    log_info "Building Calculator in RELEASE mode (skipping wasm-opt due to memory limits)"
fi

# Step 6: Create build directory
mkdir -p "${KICAD_BUILD}"
cd "${KICAD_BUILD}"

# Step 6.1: Build stub libraries the calculator links against.
# pcbnew_scripting_stub is omitted — calculator doesn't link scripting.
STUBS_DIR="${PROJECT_ROOT}/wasm/stubs"
STUBS_BUILD="${BUILD_ROOT}/stubs"
mkdir -p "${STUBS_BUILD}"

log_info "Building stub libraries..."
# libgit2 stub: single_top.cpp calls git_libgit2_init / git_libgit2_shutdown.
emcc -c "${STUBS_DIR}/libgit2_stub.c" -o "${STUBS_BUILD}/libgit2_stub.o"
emar rcs "${STUBS_BUILD}/libgit2_stub.a" "${STUBS_BUILD}/libgit2_stub.o"

# curl stub: referenced by common/.
emcc -c "${STUBS_DIR}/curl_stub.c" -o "${STUBS_BUILD}/curl_stub.o"
emar rcs "${STUBS_BUILD}/libcurl_stub.a" "${STUBS_BUILD}/curl_stub.o"

# NNG stub: required because KICAD_IPC_API=ON. Sockets don't work in WASM.
emcc -c -I"${STUBS_DIR}" "${STUBS_DIR}/nng_stub.c" -o "${STUBS_BUILD}/nng_stub.o"
emar rcs "${STUBS_BUILD}/libnng_stub.a" "${STUBS_BUILD}/nng_stub.o"

log_info "Stub libraries built"

# Step 6.2: Swap EMSDK wasm-opt for stub (real one runs on host post-build).
if [ -z "${EMSDK}" ]; then
    log_error "EMSDK environment variable is not set."
    exit 1
fi
EMSDK_WASM_OPT="${EMSDK}/upstream/bin/wasm-opt"
if [ -f "${EMSDK_WASM_OPT}" ] && [ ! -f "${EMSDK_WASM_OPT}.real" ]; then
    log_info "Backing up real wasm-opt..."
    mv "${EMSDK_WASM_OPT}" "${EMSDK_WASM_OPT}.real"
fi
cp "${STUBS_DIR}/wasm-opt-stub.sh" "${EMSDK_WASM_OPT}"
chmod +x "${EMSDK_WASM_OPT}"
log_info "wasm-opt stub installed (asyncify will run on host)"

# Step 6.3: Swap wasm-emscripten-finalize for stub (real one runs on host).
EMSDK_FINALIZE="${EMSDK}/upstream/bin/wasm-emscripten-finalize"
if [ -f "${EMSDK_FINALIZE}" ] && [ ! -f "${EMSDK_FINALIZE}.real" ]; then
    log_info "Backing up real wasm-emscripten-finalize..."
    mv "${EMSDK_FINALIZE}" "${EMSDK_FINALIZE}.real"
fi
cp "${STUBS_DIR}/wasm-emscripten-finalize-stub.sh" "${EMSDK_FINALIZE}"
chmod +x "${EMSDK_FINALIZE}"
log_info "wasm-emscripten-finalize stub installed (finalize will run on host)"

# Step 6.5: Verify WASM support is in KiCad fork
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

# Step 7: Configure with CMake
log_info "Configuring KiCad Calculator with CMake..."

CCACHE_OPTS=""
if command -v ccache &> /dev/null; then
    CCACHE_OPTS="-DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache"
    log_info "Using ccache for compilation"
fi

emcmake cmake "${KICAD_DIR}" \
    ${CCACHE_OPTS} \
    -DCMAKE_BUILD_TYPE=${BUILD_TYPE} \
    -DCMAKE_INSTALL_PREFIX="${SYSROOT}" \
    -DCMAKE_MODULE_PATH="${WASM_LAYER}/cmake" \
    -DSYSROOT="${SYSROOT}" \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
    -DCMAKE_CXX_FLAGS="${EXTRA_FLAGS} -pthread -sUSE_ZLIB=1 -DKICAD_USE_PLATFORM_WASM=1${DIAG_DEFINES} -I${SYSROOT}/include -I${STUBS_DIR}" \
    -DCMAKE_C_FLAGS="${EXTRA_FLAGS} -pthread -sUSE_ZLIB=1 -I${SYSROOT}/include -I${STUBS_DIR}" \
    -DCMAKE_EXE_LINKER_FLAGS="${LINKER_DEBUG_FLAGS} -pthread -sUSE_ZLIB=1 -sASYNCIFY=1 -sDYNCALLS=1 -sASYNCIFY_STACK_SIZE=65536 -sUSE_PTHREADS=1 -sPTHREAD_POOL_SIZE='navigator.hardwareConcurrency' -sPTHREAD_POOL_SIZE_STRICT=0 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=256MB -sMAXIMUM_MEMORY=4GB -sMAX_WEBGL_VERSION=2 -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8','dynCall'] -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE=['\$dynCall'] --bind -L${SYSROOT}/lib ${STUBS_BUILD}/libgit2_stub.a ${STUBS_BUILD}/libcurl_stub.a ${STUBS_BUILD}/libnng_stub.a ${STUBS_BUILD}/calculator_embind.o" \
    -DCMAKE_PREFIX_PATH="${SYSROOT};${WX_BUILD}" \
    -DwxWidgets_CONFIG_EXECUTABLE="${WX_BUILD}/wx-config" \
    \
    -DKICAD_BUILD_QA_TESTS=OFF \
    -DKICAD_SPICE=OFF \
    -DKICAD_USE_EGL=OFF \
    -DKICAD_USE_BUNDLED_GLEW=ON \
    -DKICAD_BUILD_3D_VIEWER_WASM=OFF \
    -DKICAD_IPC_API=ON \
    \
    -DZSTD_ROOT="${SYSROOT}" \
    -DZSTD_INCLUDE_DIR="${SYSROOT}/include" \
    -DZSTD_LIBRARY="${SYSROOT}/lib/libzstd.a" \
    -DGLM_INCLUDE_DIR="${SYSROOT}/include" \
    -DGLM_VERSION="0.9.9.8" \
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
    -DProtobuf_PROTOC_EXECUTABLE="${SYSROOT}/bin/protoc" \
    -DODBC_CONFIG:STRING="stub-for-wasm" \
    -DODBCLIB:STRING="" \
    -DODBC_CFLAGS:STRING="" \
    -DODBC_LINK_FLAGS:STRING="" \
    -DODBC_LIBRARIES:STRING="" \
    \
    -DBUILD_GITHUB_PLUGIN=OFF \
    -DKICAD_PCM=OFF \
    \
    -DHAVE_STRCASECMP=1 \
    -DHAVE_STRNCASECMP=1

# Step 7.1: Compile Embind bindings (after CMake so config.h exists).
EMBIND_SRC="${PROJECT_ROOT}/wasm/bindings/calculator_embind.cpp"
if [ -f "$EMBIND_SRC" ]; then
    log_info "Compiling Embind bindings..."
    WX_CXXFLAGS=$("${WX_BUILD}/wx-config" --cxxflags 2>/dev/null || echo "-I${WX_BUILD}/lib/wx/include/emscripten-unicode-static-3.2 -I${PROJECT_ROOT}/wxwidgets/include")
    KICAD_INCLUDES="-I${KICAD_BUILD} -I${KICAD_DIR}/include -I${KICAD_DIR}/pcb_calculator -I${KICAD_DIR}/common"
    KICAD_INCLUDES+=" -I${KICAD_DIR}/libs/core/include -I${KICAD_DIR}/libs/kimath/include -I${KICAD_DIR}/libs/kiplatform/include"
    KICAD_INCLUDES+=" -I${KICAD_DIR}/thirdparty/clipper2/Clipper2Lib/include"
    KICAD_INCLUDES+=" -I${KICAD_DIR}/thirdparty/nlohmann_json"
    KICAD_INCLUDES+=" -I${KICAD_DIR}/thirdparty/dynamic_bitset"
    KICAD_INCLUDES+=" -I${KICAD_DIR}/thirdparty/nanodbc"
    KICAD_INCLUDES+=" -I${KICAD_DIR}/thirdparty/picosha2"
    KICAD_INCLUDES+=" -I${KICAD_DIR}/thirdparty"
    KICAD_INCLUDES+=" -I${SYSROOT}/include"
    em++ -std=c++20 -c ${EXTRA_FLAGS} ${WX_CXXFLAGS} ${KICAD_INCLUDES} "$EMBIND_SRC" -o "${STUBS_BUILD}/calculator_embind.o"
fi

# Step 8: Build pcb_calculator target (single-binary WASM executable)
log_info "Building pcb_calculator..."
emmake make -j${JOBS} pcb_calculator

# Step 8.1: Build bitmap resources (images.tar.gz)
log_info "Building bitmap resources..."
emmake make bitmap_archive_build

# Step 9: Create stamp file
create_stamp "${KICAD_STAMP}"
log_info "KiCad Calculator build complete!"
log_info "Output: ${KICAD_BUILD}/pcb_calculator/pcb_calculator.js"
