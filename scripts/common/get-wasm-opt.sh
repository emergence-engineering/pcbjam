#!/bin/bash
# Get path to Binaryen wasm-opt
#
# Usage: ./scripts/common/get-wasm-opt.sh
# Output: Prints path to wasm-opt executable
#
# Prefers the emsdk-bundled Binaryen (tools/emsdk/upstream/bin/) so that the
# wasm-opt and wasm-emscripten-finalize versions match the Emscripten that
# generated the JS glue. A version mismatch between the compiler's Binaryen
# (e.g. v121+72 dev) and a standalone release (v121) corrupts asyncify
# metadata, causing "func is not a function" errors at runtime.
#
# Falls back to downloading standalone Binaryen v130 if emsdk is not installed
# locally (e.g. CI environments that only use Docker).

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# --- Prefer emsdk-bundled Binaryen (matches the Emscripten that compiled the WASM) ---
# Override: set BINARYEN_VERSION in the env to FORCE a specific standalone release
# (skips the emsdk preference). Used to A/B Binaryen versions — e.g. v121 carries a
# wasm::Type lock-contention bug that makes the host-side -O2 pass ~9x slower than
# v130 (see docs/ci-build-slowness-findings.md). Validate any bump with the e2e
# suite: a Binaryen/emsdk skew can corrupt asyncify metadata ("func is not a function").
EMSDK_WASM_OPT="${PROJECT_ROOT}/tools/emsdk/upstream/bin/wasm-opt"
# build-kicad-target.sh replaces emsdk's wasm-opt with a no-op stub (moving the
# real binary to wasm-opt.real) so emcc skips the in-link asyncify. That's meant
# for the container emsdk, but a host-mode run leaves the HOST emsdk stubbed —
# and the stub fakes --version and exits 0, so the host-side asyncify/-O2
# "succeed" while doing NOTHING (broken wasm: "asyncify_stop_unwind is not a
# function"). Always prefer the preserved real binary when it exists.
if [ -x "${EMSDK_WASM_OPT}.real" ]; then
    EMSDK_WASM_OPT="${EMSDK_WASM_OPT}.real"
fi
if [ -z "${BINARYEN_VERSION:-}" ] && [ -x "${EMSDK_WASM_OPT}" ]; then
    EMSDK_VERSION=$("${EMSDK_WASM_OPT}" --version 2>&1 || true)
    echo "Using emsdk-bundled Binaryen: ${EMSDK_VERSION}" >&2
    echo "${EMSDK_WASM_OPT}"
    exit 0
fi

# --- Fallback: download standalone Binaryen (for CI or environments without local emsdk) ---
echo "emsdk Binaryen not found at ${EMSDK_WASM_OPT}, falling back to standalone download..." >&2

# Default v130: v121 has a wasm::Type lock convoy that makes -O2 ~9x slower on
# many-core Linux (docs/ci-build-slowness-findings.md). v130 output validated by
# the full e2e suite locally (31/31) and Chromium-green on CI run 27226030304.
BINARYEN_VERSION="${BINARYEN_VERSION:-130}"

# BINARYEN_BUILD_FROM_SOURCE=1: compile wasm-opt ourselves instead of using the
# official Linux release tarballs, which are badly built — measured on the
# calculator fixture, identical output sha256: asyncify 4x faster on x86
# (CI run 27276830256: 3:50 -> 0:58) and 13x on aarch64; -O2 equal. The macOS
# tarball is well-built (self-build is ~12% SLOWER there), so this is only
# worth enabling on Linux CI. Needs cmake, ninja, g++, git. ~5 min on 32 cores,
# cached in build-wasm/tools after the first call.
if [[ "${BINARYEN_BUILD_FROM_SOURCE:-0}" == "1" ]]; then
    SELF_DIR="${PROJECT_ROOT}/build-wasm/tools/binaryen-${BINARYEN_VERSION}-selfbuilt"
    SELF_WASM_OPT="${SELF_DIR}/bin/wasm-opt"
    if [ ! -x "${SELF_WASM_OPT}" ]; then
        SRC_DIR="${PROJECT_ROOT}/build-wasm/tools/binaryen-src-${BINARYEN_VERSION}"
        BUILD_DIR="${PROJECT_ROOT}/build-wasm/tools/binaryen-build-${BINARYEN_VERSION}"
        echo "Building Binaryen v${BINARYEN_VERSION} from source (one-time, ~5 min)..." >&2
        if [ ! -d "${SRC_DIR}" ]; then
            git clone -q --depth 1 --branch "version_${BINARYEN_VERSION}" \
                --recurse-submodules --shallow-submodules \
                https://github.com/WebAssembly/binaryen.git "${SRC_DIR}" >&2
        fi
        cmake -S "${SRC_DIR}" -B "${BUILD_DIR}" -G Ninja \
            -DCMAKE_BUILD_TYPE=Release \
            -DCMAKE_CXX_FLAGS="-Wno-maybe-uninitialized" \
            -DCMAKE_INTERPROCEDURAL_OPTIMIZATION=ON -DBUILD_TESTS=OFF >&2
        ninja -C "${BUILD_DIR}" wasm-opt wasm-emscripten-finalize >&2
        # wasm-opt links lib/libbinaryen.so via rpath $ORIGIN/../lib.
        mkdir -p "${SELF_DIR}/bin" "${SELF_DIR}/lib"
        cp "${BUILD_DIR}/bin/wasm-opt" "${BUILD_DIR}/bin/wasm-emscripten-finalize" "${SELF_DIR}/bin/"
        cp "${BUILD_DIR}"/lib/libbinaryen.* "${SELF_DIR}/lib/" 2>/dev/null || true
        echo "Self-built Binaryen installed to ${SELF_DIR}" >&2
    fi
    SELF_VERSION=$("${SELF_WASM_OPT}" --version 2>&1 | grep -o '[0-9]\+' | head -1)
    if [ "${SELF_VERSION}" != "${BINARYEN_VERSION}" ]; then
        echo "ERROR: self-built wasm-opt version mismatch (got ${SELF_VERSION}, expected ${BINARYEN_VERSION})" >&2
        exit 1
    fi
    echo "Using self-built Binaryen v${BINARYEN_VERSION} (${SELF_WASM_OPT})" >&2
    echo "${SELF_WASM_OPT}"
    exit 0
fi
BINARYEN_DIR="${PROJECT_ROOT}/build-wasm/tools/binaryen-${BINARYEN_VERSION}"
WASM_OPT="${BINARYEN_DIR}/bin/wasm-opt"

download_binaryen() {
    # Detect platform
    local os=$(uname -s)
    local arch=$(uname -m)
    local platform=""

    case "${os}-${arch}" in
        Darwin-arm64)  platform="arm64-macos" ;;
        Darwin-x86_64) platform="x86_64-macos" ;;
        Linux-aarch64) platform="aarch64-linux" ;;
        Linux-x86_64)  platform="x86_64-linux" ;;
        *)
            echo "ERROR: Unsupported platform: ${os}-${arch}" >&2
            exit 1
            ;;
    esac

    local url="https://github.com/WebAssembly/binaryen/releases/download/version_${BINARYEN_VERSION}/binaryen-version_${BINARYEN_VERSION}-${platform}.tar.gz"
    local tarball="${PROJECT_ROOT}/build-wasm/tools/binaryen-${BINARYEN_VERSION}.tar.gz"

    echo "Downloading Binaryen v${BINARYEN_VERSION} for ${platform}..." >&2
    mkdir -p "${PROJECT_ROOT}/build-wasm/tools"
    curl -L -o "${tarball}" "${url}"

    echo "Extracting..." >&2
    tar -xzf "${tarball}" -C "${PROJECT_ROOT}/build-wasm/tools"
    mv "${PROJECT_ROOT}/build-wasm/tools/binaryen-version_${BINARYEN_VERSION}" "${BINARYEN_DIR}"
    rm "${tarball}"

    echo "Binaryen v${BINARYEN_VERSION} installed to ${BINARYEN_DIR}" >&2
}

# Download Binaryen if not cached
if [ ! -x "${WASM_OPT}" ]; then
    download_binaryen
fi

# Verify version
INSTALLED_VERSION=$("${WASM_OPT}" --version 2>&1 | grep -o '[0-9]\+' | head -1)
if [ "${INSTALLED_VERSION}" != "${BINARYEN_VERSION}" ]; then
    echo "WARNING: wasm-opt version mismatch (got ${INSTALLED_VERSION}, expected ${BINARYEN_VERSION})" >&2
    echo "Re-downloading..." >&2
    rm -rf "${BINARYEN_DIR}"
    download_binaryen
fi

# Output path to wasm-opt (this is the only stdout output)
echo "${WASM_OPT}"