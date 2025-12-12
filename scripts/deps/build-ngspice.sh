#!/bin/bash
# Build ngspice for WebAssembly
# ngspice provides SPICE simulation for KiCad's Eeschema

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../common/env.sh"
source "${SCRIPT_DIR}/../common/versions.sh"
source "${SCRIPT_DIR}/../common/functions.sh"

NGSPICE_DIR="${DEPS_ROOT}/ngspice-${NGSPICE_VERSION}"
NGSPICE_BUILD="${BUILD_ROOT}/deps/ngspice"
NGSPICE_STAMP="${BUILD_ROOT}/stamps/ngspice.stamp"

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
    log_info "Cleaning ngspice build..."
    rm -rf "${NGSPICE_BUILD}" "${NGSPICE_STAMP}"
fi

# Check if already built
if check_stamp "${NGSPICE_STAMP}"; then
    log_info "ngspice already built, skipping..."
    exit 0
fi

# Download if needed
if [ ! -d "${NGSPICE_DIR}" ]; then
    log_info "Downloading ngspice ${NGSPICE_VERSION}..."
    mkdir -p "${DEPS_ROOT}"
    cd "${DEPS_ROOT}"

    NGSPICE_URL="https://sourceforge.net/projects/ngspice/files/ng-spice-rework/${NGSPICE_VERSION}/ngspice-${NGSPICE_VERSION}.tar.gz/download"
    curl -L "${NGSPICE_URL}" -o "ngspice-${NGSPICE_VERSION}.tar.gz"
    tar -xzf "ngspice-${NGSPICE_VERSION}.tar.gz"
    rm "ngspice-${NGSPICE_VERSION}.tar.gz"
fi

log_info "Building ngspice ${NGSPICE_VERSION} for WASM..."

mkdir -p "${NGSPICE_BUILD}"
cd "${NGSPICE_BUILD}"

# ngspice uses autoconf
# Set compiler flags based on debug mode
if [ "${DEBUG_BUILD:-1}" = "1" ]; then
    export CFLAGS="-g -O0 -pthread"
    export CXXFLAGS="-g -O0 -pthread"
    NGSPICE_DEBUG_FLAG="--enable-debug"
else
    export CFLAGS="-O2 -pthread"
    export CXXFLAGS="-O2 -pthread"
    NGSPICE_DEBUG_FLAG="--disable-debug"
fi
export LDFLAGS="-pthread"

# Configure ngspice as a static library for WASM
# Note: --with-ngshared requires shared libs which WASM doesn't support
# We build static lib instead
emconfigure "${NGSPICE_DIR}/configure" \
    --prefix="${SYSROOT}" \
    --host=wasm32-unknown-emscripten \
    --build=$(uname -m)-linux-gnu \
    --disable-shared \
    --enable-static \
    ${NGSPICE_DEBUG_FLAG} \
    --disable-dependency-tracking \
    --disable-openmp \
    --enable-cider \
    --enable-xspice \
    --without-x \
    --without-readline \
    --without-editline

emmake make -j${JOBS}
emmake make install

create_stamp "${NGSPICE_STAMP}"
log_info "ngspice build complete!"
