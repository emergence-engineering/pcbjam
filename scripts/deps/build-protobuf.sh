#!/bin/bash
# Build Protocol Buffers for WebAssembly
# Protobuf is used for IPC in KiCad

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../common/env.sh"
source "${SCRIPT_DIR}/../common/versions.sh"
source "${SCRIPT_DIR}/../common/functions.sh"

PROTOBUF_DIR="${DEPS_ROOT}/protobuf-${PROTOBUF_VERSION}"
PROTOBUF_BUILD="${BUILD_ROOT}/deps/protobuf"
PROTOBUF_STAMP="${BUILD_ROOT}/stamps/protobuf.stamp"

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
    log_info "Cleaning Protobuf build..."
    rm -rf "${PROTOBUF_BUILD}" "${PROTOBUF_STAMP}"
fi

# Check if already built
if check_stamp "${PROTOBUF_STAMP}"; then
    log_info "Protobuf already built, skipping..."
    exit 0
fi

# Download if needed
if [ ! -d "${PROTOBUF_DIR}" ]; then
    log_info "Downloading Protobuf ${PROTOBUF_VERSION}..."
    mkdir -p "${DEPS_ROOT}"
    cd "${DEPS_ROOT}"

    # Protobuf 3.21.x uses tag format v21.12 (major version 3 is implicit)
    PROTOBUF_TAG_VERSION="${PROTOBUF_VERSION#3.}"  # Strip leading "3." -> "21.12"
    PROTOBUF_URL="https://github.com/protocolbuffers/protobuf/releases/download/v${PROTOBUF_TAG_VERSION}/protobuf-cpp-${PROTOBUF_VERSION}.tar.gz"
    download_file "${PROTOBUF_URL}" "protobuf-${PROTOBUF_VERSION}.tar.gz"
    tar -xzf "protobuf-${PROTOBUF_VERSION}.tar.gz"
    rm "protobuf-${PROTOBUF_VERSION}.tar.gz"
fi

log_info "Building Protobuf ${PROTOBUF_VERSION} for WASM..."

mkdir -p "${PROTOBUF_BUILD}"
cd "${PROTOBUF_BUILD}"

emcmake cmake "${PROTOBUF_DIR}" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="${SYSROOT}" \
    -DCMAKE_CXX_FLAGS="-pthread" \
    -Dprotobuf_BUILD_TESTS=OFF \
    -Dprotobuf_BUILD_EXAMPLES=OFF \
    -Dprotobuf_BUILD_PROTOC_BINARIES=OFF \
    -Dprotobuf_BUILD_SHARED_LIBS=OFF \
    -Dprotobuf_WITH_ZLIB=OFF

emmake make -j${JOBS}
emmake make install

create_stamp "${PROTOBUF_STAMP}"
log_info "Protobuf build complete!"
