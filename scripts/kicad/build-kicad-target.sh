#!/bin/bash
# Build a KiCad app (pcbnew, eeschema, calculator, pl_editor) for WebAssembly.
#
# Usage:
#   ./scripts/kicad/build-kicad-target.sh <app> [options]
#
# Args:
#   <app>         pcbnew | eeschema | calculator | pl_editor (required)
#
# Options:
#   --full        Full clean rebuild (dependencies + KiCad)
#   --clean-kicad Clean only KiCad build directory (not deps)
#   --build-deps  Build dependencies (default: skip)
#   --debug       Build with debug symbols (default)
#   --release     Build optimized without debug symbols
#   --diag=...    Diagnostic preprocessor flags (gal, coroutine, ctor, all)
#   -j N          Parallel compilation jobs (default: 1)
#
# Each app builds into its own tree: build-wasm/kicad-<app>/.
# Per-app extras live alongside generic stubs:
#   - wasm/bindings/<app>_embind.cpp        (optional)
#   - wasm/stubs/<app>_frame_stub.cpp       (optional, app-specific stubs)
#   - wasm/stubs/<app>_scripting_stub.cpp   (optional, app-specific scripting stubs)
#
# Most apps use the same name for the user-facing app, the CMake target, and
# the source subdirectory. Calculator is the exception: app=calculator but the
# upstream target and source subdir are both pcb_calculator (the OUTPUT_NAME
# property in pcb_calculator/CMakeLists.txt emits calculator.{js,wasm}).
# pl_editor is the standard case but its source subdir is pagelayout_editor.

set -e

if [ -z "$1" ]; then
    echo "Error: missing <app> argument (pcbnew | eeschema | calculator | pl_editor)" >&2
    exit 1
fi
APP_NAME="$1"
shift

case "$APP_NAME" in
    pcbnew|eeschema|pl_editor)
        KICAD_TARGET="$APP_NAME"
        ;;
    calculator)
        KICAD_TARGET="pcb_calculator"
        ;;
    *)
        echo "Error: unknown app '$APP_NAME' (expected: pcbnew | eeschema | calculator | pl_editor)" >&2
        exit 1
        ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../common/env.sh"
source "${SCRIPT_DIR}/../common/versions.sh"
source "${SCRIPT_DIR}/../common/functions.sh"
source "${SCRIPT_DIR}/../common/stages.sh"

KICAD_DIR="${PROJECT_ROOT}/kicad"
KICAD_BUILD="${BUILD_ROOT}/kicad-${APP_NAME}"
KICAD_STAMP="${BUILD_ROOT}/stamps/kicad-${APP_NAME}.stamp"
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

# Diagnostic preprocessor defines from --diag=<csv> (gal, coroutine, ctor, all).
# These gate the KI_DIAG_* macros in kicad/include/kicad_wasm_diag.h. Output goes
# to stdout ([KICAD_OUT] logs), never errors. Off by default.
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

log_info "Building app: ${APP_NAME}"
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
    log_info "Cleaning KiCad ${APP_NAME} build directory..."
    rm -rf "${KICAD_BUILD}" "${KICAD_STAMP}"
else
    log_info "Incremental build (use --clean-kicad or --full to clean)"
fi

# Step 2: Build dependencies
# Note: --with-occ for OpenCASCADE, but NOT ngspice since KICAD_SPICE=OFF
if [ $SKIP_DEPS -eq 0 ]; then
    kw_stage deps
    log_info "Building dependencies..."
    "${SCRIPT_DIR}/../deps/build-all-deps.sh" --with-occ
else
    log_info "Skipping dependencies (use --build-deps or --full to build)"
fi

# Note: We don't check the KiCad stamp here for incremental builds.
# CMake handles dependency tracking - it will detect changed source files
# and only recompile what's needed. The stamp is created at the end for
# scripts that want to know if KiCad was ever built successfully.

# Step 4: Build wxWidgets (incremental - only recompiles changed files)
kw_stage wxwidgets
log_info "Building wxWidgets..."
"${SCRIPT_DIR}/../build-wxuniversal-wasm.sh" --no-clean

log_info "Building KiCad ${APP_NAME} ${KICAD_VERSION} for WASM..."

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
    # -gseparate-dwarf puts debug info in a separate .debug.wasm file
    # This keeps the main WASM small (~200MB) while preserving full debug info
    # DevTools loads the debug file on-demand when debugging
    LINKER_DEBUG_FLAGS="-O1 -g -gseparate-dwarf -fexceptions"
    log_info "Building KiCad in DEBUG mode (separate DWARF for smaller main binary)"
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
# Generic stubs (libgit2, curl, nng) are shared across apps and built in BUILD_ROOT/stubs.
# App-specific stubs (e.g. pcbnew_scripting_stub) build into the same directory but
# are only linked in when the corresponding source exists.
STUBS_DIR="${PROJECT_ROOT}/wasm/stubs"
STUBS_BUILD="${BUILD_ROOT}/stubs"
mkdir -p "${STUBS_BUILD}"

kw_stage kicad-stubs
log_info "Building stub libraries..."
# Compile libgit2 stub
emcc -c "${STUBS_DIR}/libgit2_stub.c" -o "${STUBS_BUILD}/libgit2_stub.o"
emar rcs "${STUBS_BUILD}/libgit2_stub.a" "${STUBS_BUILD}/libgit2_stub.o"

# Compile curl stub
emcc -c "${STUBS_DIR}/curl_stub.c" -o "${STUBS_BUILD}/curl_stub.o"
emar rcs "${STUBS_BUILD}/libcurl_stub.a" "${STUBS_BUILD}/curl_stub.o"

# Note: GLU tesselator is now implemented in wasm/stubs/glu_wasm_impl.cpp
# It's compiled as part of the GAL library (requires KiCad headers)

# Compile NNG stub (IPC API requires NNG but sockets don't work in WASM)
emcc -c -I"${STUBS_DIR}" "${STUBS_DIR}/nng_stub.c" -o "${STUBS_BUILD}/nng_stub.o"
emar rcs "${STUBS_BUILD}/libnng_stub.a" "${STUBS_BUILD}/nng_stub.o"

# wx flags for any C++ stubs that include wx headers
WX_CXXFLAGS=$("${WX_BUILD}/wx-config" --cxxflags 2>/dev/null || echo "-I${WX_BUILD}/lib/wx/include/emscripten-unicode-static-3.2 -I${PROJECT_ROOT}/wxwidgets/include")

# App-specific stubs:
# - pcbnew: pcbnew_scripting_stub.cpp (action-plugin scripting placeholders)
# - eeschema: eeschema_frame_stub.cpp (placeholder; grows as linker dictates)
APP_STUB_LINK=""
APP_SCRIPTING_STUB_SRC="${STUBS_DIR}/${APP_NAME}_scripting_stub.cpp"
if [ -f "${APP_SCRIPTING_STUB_SRC}" ]; then
    log_info "Building app scripting stub: ${APP_NAME}_scripting_stub.cpp"
    em++ -c ${WX_CXXFLAGS} "${APP_SCRIPTING_STUB_SRC}" -o "${STUBS_BUILD}/${APP_NAME}_scripting_stub.o"
    emar rcs "${STUBS_BUILD}/lib${APP_NAME}_scripting_stub.a" "${STUBS_BUILD}/${APP_NAME}_scripting_stub.o"
    APP_STUB_LINK="${APP_STUB_LINK} ${STUBS_BUILD}/lib${APP_NAME}_scripting_stub.a"
fi

APP_FRAME_STUB_SRC="${STUBS_DIR}/${APP_NAME}_frame_stub.cpp"
if [ -f "${APP_FRAME_STUB_SRC}" ] && [ -s "${APP_FRAME_STUB_SRC}" ]; then
    log_info "Building app frame stub: ${APP_NAME}_frame_stub.cpp"
    em++ -c ${WX_CXXFLAGS} "${APP_FRAME_STUB_SRC}" -o "${STUBS_BUILD}/${APP_NAME}_frame_stub.o"
    emar rcs "${STUBS_BUILD}/lib${APP_NAME}_frame_stub.a" "${STUBS_BUILD}/${APP_NAME}_frame_stub.o"
    APP_STUB_LINK="${APP_STUB_LINK} ${STUBS_BUILD}/lib${APP_NAME}_frame_stub.a"
fi

log_info "Stub libraries built"

# Step 6.2: Replace Emscripten's wasm-opt with stub to bypass asyncify transformation
# This allows Emscripten to generate JS with Asyncify runtime, but we run the real
# wasm-opt --asyncify on the host where more RAM is available (needs 50GB+ for KiCad)
if [ -z "${EMSDK}" ]; then
    log_error "EMSDK environment variable is not set."
    exit 1
fi
EMSDK_WASM_OPT="${EMSDK}/upstream/bin/wasm-opt"
if [ -f "${EMSDK_WASM_OPT}" ] && [ ! -f "${EMSDK_WASM_OPT}.real" ]; then
    log_info "Backing up real wasm-opt..."
    mv "${EMSDK_WASM_OPT}" "${EMSDK_WASM_OPT}.real"
fi
# Always copy the latest stub (in case it was updated)
cp "${STUBS_DIR}/wasm-opt-stub.sh" "${EMSDK_WASM_OPT}"
chmod +x "${EMSDK_WASM_OPT}"
log_info "wasm-opt stub installed (asyncify will run on host)"

# Step 6.3: Replace wasm-emscripten-finalize with stub (same pattern as wasm-opt)
# This tool also OOMs on large WASM with debug symbols, so we run it on the host
EMSDK_FINALIZE="${EMSDK}/upstream/bin/wasm-emscripten-finalize"
if [ -f "${EMSDK_FINALIZE}" ] && [ ! -f "${EMSDK_FINALIZE}.real" ]; then
    log_info "Backing up real wasm-emscripten-finalize..."
    mv "${EMSDK_FINALIZE}" "${EMSDK_FINALIZE}.real"
fi
# Always copy the latest stub (in case it was updated)
cp "${STUBS_DIR}/wasm-emscripten-finalize-stub.sh" "${EMSDK_FINALIZE}"
chmod +x "${EMSDK_FINALIZE}"
log_info "wasm-emscripten-finalize stub installed (finalize will run on host)"

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

# Embind object — built after CMake configure runs (so config.h exists). The
# linker line below references "${STUBS_BUILD}/${APP_NAME}_embind.o" so we
# create an empty placeholder when the source is missing, to keep the link
# line stable across apps.
EMBIND_OBJ="${STUBS_BUILD}/${APP_NAME}_embind.o"
EMBIND_SRC="${PROJECT_ROOT}/wasm/bindings/${APP_NAME}_embind.cpp"

# Step 7: Configure KiCad with CMake
# We use CMAKE_MODULE_PATH to inject our compatibility layer
kw_stage kicad-configure
log_info "Configuring KiCad with CMake..."

# Use ccache if available (CMAKE_*_COMPILER_LAUNCHER is the proper CMake way)
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
    -DCMAKE_CXX_FLAGS="${EXTRA_FLAGS} -pthread -sUSE_ZLIB=1 -DKICAD_USE_PLATFORM_WASM=1${DIAG_DEFINES} -I${SYSROOT}/include -I${STUBS_DIR} -include ${STUBS_DIR}/char_traits_uint16_workaround.h" \
    -DCMAKE_C_FLAGS="${EXTRA_FLAGS} -pthread -sUSE_ZLIB=1 -I${SYSROOT}/include -I${STUBS_DIR}" \
    -DCMAKE_EXE_LINKER_FLAGS="${LINKER_DEBUG_FLAGS} -pthread -sUSE_ZLIB=1 -sASYNCIFY=1 -sDYNCALLS=1 -sASYNCIFY_STACK_SIZE=65536 -sUSE_PTHREADS=1 -sPTHREAD_POOL_SIZE='navigator.hardwareConcurrency' -sPTHREAD_POOL_SIZE_STRICT=0 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=256MB -sMAXIMUM_MEMORY=4GB -sMAX_WEBGL_VERSION=2 -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8','dynCall'] -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE=['\$dynCall'] --bind -L${SYSROOT}/lib ${STUBS_BUILD}/libgit2_stub.a ${STUBS_BUILD}/libcurl_stub.a${APP_STUB_LINK} ${STUBS_BUILD}/libnng_stub.a ${EMBIND_OBJ}" \
    -DCMAKE_PREFIX_PATH="${SYSROOT};${WX_BUILD}" \
    -DwxWidgets_CONFIG_EXECUTABLE="${WX_BUILD}/wx-config" \
    \
    -DKICAD_BUILD_QA_TESTS=OFF \
    -DKICAD_SPICE=OFF \
    -DKICAD_USE_EGL=OFF \
    -DKICAD_USE_BUNDLED_GLEW=ON \
    -DKICAD_BUILD_3D_VIEWER_WASM=OFF \
    -DKICAD_IPC_API=ON \
    -DKICAD_USE_PCH=ON \
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

# Step 7.1: Compile Embind bindings (after CMake so config.h exists)
# Exposes KiCad objects to JavaScript for future Pyodide integration.
# When no app-specific source exists, build an empty object so the linker line
# referencing ${APP_NAME}_embind.o doesn't break.
if [ -f "${EMBIND_SRC}" ]; then
    log_info "Compiling Embind bindings (${APP_NAME})..."
    # Use the same includes and flags that KiCad uses
    KICAD_INCLUDES="-I${KICAD_BUILD} -I${KICAD_DIR}/include -I${KICAD_DIR}/${KICAD_TARGET} -I${KICAD_DIR}/common"
    KICAD_INCLUDES+=" -I${KICAD_DIR}/libs/core/include -I${KICAD_DIR}/libs/kimath/include -I${KICAD_DIR}/libs/kiplatform/include"
    KICAD_INCLUDES+=" -I${KICAD_DIR}/thirdparty/clipper2/Clipper2Lib/include"
    KICAD_INCLUDES+=" -I${KICAD_DIR}/thirdparty/nlohmann_json"
    KICAD_INCLUDES+=" -I${KICAD_DIR}/thirdparty/dynamic_bitset"
    KICAD_INCLUDES+=" -I${KICAD_DIR}/thirdparty/nanodbc"
    KICAD_INCLUDES+=" -I${KICAD_DIR}/thirdparty/picosha2"
    KICAD_INCLUDES+=" -I${KICAD_DIR}/thirdparty"
    KICAD_INCLUDES+=" -I${SYSROOT}/include"
    # KiCad requires C++20 for concepts
    em++ -std=c++20 -c ${EXTRA_FLAGS} ${WX_CXXFLAGS} ${KICAD_INCLUDES} "${EMBIND_SRC}" -o "${EMBIND_OBJ}"
else
    log_info "No embind source for ${APP_NAME} (expected at ${EMBIND_SRC}); using empty placeholder"
    EMPTY_C="${STUBS_BUILD}/${APP_NAME}_embind_empty.c"
    : > "${EMPTY_C}"
    emcc -c "${EMPTY_C}" -o "${EMBIND_OBJ}"
fi

# Step 8: Build the app target
kw_stage kicad-compile
log_info "Building ${APP_NAME} (CMake target: ${KICAD_TARGET})..."
emmake make -j${JOBS} "${KICAD_TARGET}"

# Step 8.1: Build bitmap resources (images.tar.gz)
# This creates the icon archive that KiCad loads at runtime
kw_stage kicad-bitmaps
log_info "Building bitmap resources..."
emmake make bitmap_archive_build

# Step 9: Create stamp file
create_stamp "${KICAD_STAMP}"
log_info "KiCad ${APP_NAME} build complete!"
log_info "Output: ${KICAD_BUILD}/${KICAD_TARGET}/${APP_NAME}.js"
