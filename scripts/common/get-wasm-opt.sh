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
# Falls back to downloading standalone Binaryen v121 if emsdk is not installed
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
if [ -z "${BINARYEN_VERSION:-}" ] && [ -x "${EMSDK_WASM_OPT}" ]; then
    EMSDK_VERSION=$("${EMSDK_WASM_OPT}" --version 2>&1 || true)
    echo "Using emsdk-bundled Binaryen: ${EMSDK_VERSION}" >&2
    echo "${EMSDK_WASM_OPT}"
    exit 0
fi

# --- Fallback: download standalone Binaryen (for CI or environments without local emsdk) ---
echo "emsdk Binaryen not found at ${EMSDK_WASM_OPT}, falling back to standalone download..." >&2

BINARYEN_VERSION="${BINARYEN_VERSION:-121}"
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