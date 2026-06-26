#!/bin/bash
# Build OpenCASCADE Technology (OCCT) for WebAssembly
# OCCT provides 3D geometry kernel for STEP file import/export

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../common/env.sh"
source "${SCRIPT_DIR}/../common/versions.sh"
source "${SCRIPT_DIR}/../common/functions.sh"

OCC_DIR="${DEPS_ROOT}/opencascade-${OCC_VERSION}"
OCC_BUILD="${BUILD_ROOT}/deps/opencascade"
OCC_STAMP="${BUILD_ROOT}/stamps/opencascade.stamp"

# Parse arguments
CLEAN=0
for arg in "$@"; do
    case $arg in
        --clean)
            CLEAN=1
            shift
            ;;
    esac
done

if [ $CLEAN -eq 1 ]; then
    log_info "Cleaning OpenCASCADE build..."
    rm -rf "${OCC_BUILD}" "${OCC_STAMP}"
fi

# Check if already built
if check_stamp "${OCC_STAMP}"; then
    log_info "OpenCASCADE already built, skipping..."
    exit 0
fi

# Download if needed
if [ ! -d "${OCC_DIR}" ]; then
    log_info "Downloading OpenCASCADE ${OCC_VERSION}..."
    mkdir -p "${DEPS_ROOT}"
    cd "${DEPS_ROOT}"

    # OpenCASCADE releases are on GitHub
    OCC_URL="https://github.com/Open-Cascade-SAS/OCCT/archive/refs/tags/V${OCC_VERSION//./_}.tar.gz"
    download_file "${OCC_URL}" "opencascade-${OCC_VERSION}.tar.gz"
    tar -xzf "opencascade-${OCC_VERSION}.tar.gz"
    # Directory name in tarball is OCCT-7_8_0 (without V prefix)
    mv "OCCT-${OCC_VERSION//./_}" "opencascade-${OCC_VERSION}"
    rm "opencascade-${OCC_VERSION}.tar.gz"
fi

log_info "Building OpenCASCADE ${OCC_VERSION} for WASM..."
log_warn "This is a large library and may take a while..."

mkdir -p "${OCC_BUILD}"
cd "${OCC_BUILD}"

# OpenCASCADE build configuration for WASM
# Disable GUI, visualization that needs X11/OpenGL native
# Enable core geometry and data exchange modules only
emcmake cmake "${OCC_DIR}" \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
    -DCMAKE_BUILD_TYPE=${BUILD_TYPE:-Debug} \
    -DCMAKE_INSTALL_PREFIX="${SYSROOT}" \
    -DCMAKE_CXX_FLAGS="${DEBUG_CFLAGS:--g -O0} -pthread -matomics -mbulk-memory ${DEPS_EH_FLAGS}" \
    -DCMAKE_C_FLAGS="${DEBUG_CFLAGS:--g -O0} -pthread -matomics -mbulk-memory ${DEPS_EH_FLAGS}" \
    -DBUILD_LIBRARY_TYPE=Static \
    -DBUILD_MODULE_ApplicationFramework=OFF \
    -DBUILD_MODULE_Draw=OFF \
    -DBUILD_MODULE_Visualization=OFF \
    -DBUILD_MODULE_DETools=OFF \
    -DBUILD_MODULE_FoundationClasses=ON \
    -DBUILD_MODULE_ModelingData=ON \
    -DBUILD_MODULE_ModelingAlgorithms=ON \
    -DBUILD_MODULE_DataExchange=ON \
    -DUSE_FREETYPE=OFF \
    -DUSE_FREEIMAGE=OFF \
    -DUSE_OPENVR=OFF \
    -DUSE_FFMPEG=OFF \
    -DUSE_TBB=OFF \
    -DUSE_VTK=OFF \
    -DUSE_TCL=OFF \
    -DUSE_TK=OFF \
    -DUSE_GLES2=OFF \
    -DUSE_OPENGL=OFF \
    -DUSE_D3D=OFF \
    -DUSE_RAPIDJSON=OFF \
    -DUSE_DRACO=OFF \
    -DBUILD_DOC_Overview=OFF \
    -DINSTALL_SAMPLES=OFF \
    -DINSTALL_TEST_CASES=OFF

emmake make -j${JOBS}
emmake make install

create_stamp "${OCC_STAMP}"
log_info "OpenCASCADE build complete!"
