#!/bin/bash
# Build Cairo for WebAssembly
# Cairo provides 2D graphics rendering

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../common/env.sh"
source "${SCRIPT_DIR}/../common/versions.sh"
source "${SCRIPT_DIR}/../common/functions.sh"

# Cairo requires Pixman and FreeType
"${SCRIPT_DIR}/build-pixman.sh"
"${SCRIPT_DIR}/build-freetype.sh"

CAIRO_DIR="${DEPS_ROOT}/cairo-${CAIRO_VERSION}"
CAIRO_BUILD="${BUILD_ROOT}/deps/cairo"
CAIRO_STAMP="${BUILD_ROOT}/stamps/cairo.stamp"

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
    log_info "Cleaning Cairo build..."
    rm -rf "${CAIRO_BUILD}" "${CAIRO_STAMP}"
fi

# Check if already built
if check_stamp "${CAIRO_STAMP}"; then
    log_info "Cairo already built, skipping..."
    exit 0
fi

# Download if needed
if [ ! -d "${CAIRO_DIR}" ]; then
    log_info "Downloading Cairo ${CAIRO_VERSION}..."
    mkdir -p "${DEPS_ROOT}"
    cd "${DEPS_ROOT}"

    CAIRO_URL="https://cairographics.org/releases/cairo-${CAIRO_VERSION}.tar.xz"
    download_file "${CAIRO_URL}" "cairo-${CAIRO_VERSION}.tar.xz"
    tar -xJf "cairo-${CAIRO_VERSION}.tar.xz"
    rm "cairo-${CAIRO_VERSION}.tar.xz"
fi

log_info "Building Cairo ${CAIRO_VERSION} for WASM..."

mkdir -p "${CAIRO_BUILD}"
cd "${CAIRO_BUILD}"

# Determine meson build type based on DEBUG_BUILD
if [ "${DEBUG_BUILD:-1}" = "1" ]; then
    MESON_BUILD_TYPE="debug"
    MESON_DEBUG_FLAGS="'-g', '-O0'"
else
    MESON_BUILD_TYPE="release"
    MESON_DEBUG_FLAGS="'-O2'"
fi

# Cairo uses meson
cat > cross-file.txt << EOF
[binaries]
c = 'emcc'
cpp = 'em++'
ar = 'emar'
ranlib = 'emranlib'
strip = 'emstrip'
pkgconfig = 'pkg-config'

[host_machine]
system = 'emscripten'
cpu_family = 'wasm32'
cpu = 'wasm32'
endian = 'little'

[properties]
# Prevent finding system libraries when cross-compiling
sys_root = '${SYSROOT}'
pkg_config_libdir = '${SYSROOT}/lib/pkgconfig'

[built-in options]
default_library = 'static'
b_staticpic = false
b_pie = false
c_args = [${MESON_DEBUG_FLAGS}, '-pthread', '-I${SYSROOT}/include', '-I${SYSROOT}/include/freetype2', '-I${SYSROOT}/include/pixman-1']
c_link_args = ['-pthread', '-L${SYSROOT}/lib']
pkg_config_path = '${SYSROOT}/lib/pkgconfig'
EOF

# Set PKG_CONFIG_PATH for dependency discovery
# Use LIBDIR to ONLY search our sysroot, preventing system lzo2 from being found
export PKG_CONFIG_LIBDIR="${SYSROOT}/lib/pkgconfig"
unset PKG_CONFIG_PATH

meson setup "${CAIRO_DIR}" \
    --cross-file cross-file.txt \
    --prefix="${SYSROOT}" \
    --default-library=static \
    --buildtype=${MESON_BUILD_TYPE} \
    -Dfontconfig=disabled \
    -Dfreetype=enabled \
    -Dglib=disabled \
    -Dpng=disabled \
    -Dxlib=disabled \
    -Dxcb=disabled \
    -Dzlib=enabled \
    -Dtests=disabled \
    -Dspectre=disabled \
    -Dsymbol-lookup=disabled \
    -Dfreetype2:default_library=static \
    -Dlibpng:default_library=static

# JOBS is set in env.sh (default: 1 for sequential builds, use -j N to override)
ninja -j${JOBS}
ninja install

create_stamp "${CAIRO_STAMP}"
log_info "Cairo build complete!"
