#!/bin/bash
# A/B the official Binaryen release tarball against a from-source build on the
# SAME machine, replaying the calculator asyncify + -O2 passes on an identical
# fixture. Motivation: on aarch64 the official v130 tarball runs asyncify
# 9-13x slower than a stock gcc -O3+LTO build (outputs bit-identical, sha256
# verified) — this script answers whether the x86 tarball has the same defect.
#
# Run AFTER ./docker/build.sh calculator (needs the compiled-but-raw calculator
# in the container volume and the release wasm-opt already downloaded).
#
# Usage: scripts/bench/binaryen-source-bench.sh
# Env: BINARYEN_CORES (default 16), BINARYEN_VERSION (default 130)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

export BINARYEN_CORES="${BINARYEN_CORES:-16}"
BINARYEN_VERSION="${BINARYEN_VERSION:-130}"
BINDIR="build-wasm/tools/binaryen-${BINARYEN_VERSION}/bin"
LIBDIR="build-wasm/tools/binaryen-${BINARYEN_VERSION}/lib"
SRC=/tmp/binaryen-src
BUILD=/tmp/binaryen-build

echo "=== Building Binaryen v${BINARYEN_VERSION} from source (gcc -O3 + LTO, generic arch) ==="
[ -d "${SRC}" ] || git clone -q --depth 1 --branch "version_${BINARYEN_VERSION}" \
    --recurse-submodules --shallow-submodules \
    https://github.com/WebAssembly/binaryen.git "${SRC}"
cmake -S "${SRC}" -B "${BUILD}" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_CXX_FLAGS="-Wno-maybe-uninitialized" \
    -DCMAKE_INTERPROCEDURAL_OPTIMIZATION=ON -DBUILD_TESTS=OFF >/dev/null
time ninja -C "${BUILD}" wasm-opt
"${BUILD}/bin/wasm-opt" --version

echo "=== Building the calculator fixture (raw -> finalized) ==="
CONTAINER=$(docker ps -q --filter "name=kicad-wasm-builder" | head -1)
docker cp -q "${CONTAINER}":/workspace/build-wasm/kicad-calculator/pcb_calculator/calculator.wasm /tmp/calc-raw.wasm
./scripts/common/apply-finalize.sh /tmp/calc-raw.wasm /tmp/calc-fixture.wasm >/dev/null
ls -lh /tmp/calc-fixture.wasm

run_config() {
    local name="$1"
    cp /tmp/calc-fixture.wasm "/tmp/bench-${name}.wasm"
    echo ""
    echo "=== CONFIG ${name} (BINARYEN_CORES=${BINARYEN_CORES}) ==="
    ./scripts/common/apply-asyncify.sh "/tmp/bench-${name}.wasm" "/tmp/bench-${name}.wasm" 2>&1 \
        | grep -aE "Running wasm-opt|LD_PRELOAD=|Elapsed \(wall|User time|System time|Percent of CPU"
    sha256sum "/tmp/bench-${name}.wasm"
}

# Release tarball first (the binary the normal build already used).
cp "${BINDIR}/wasm-opt" "${BINDIR}/wasm-opt.release"
run_config release

# From-source swap (wasm-opt links libbinaryen.so via rpath $ORIGIN/../lib).
mkdir -p "${LIBDIR}"
cp "${BUILD}/lib/libbinaryen.so" "${LIBDIR}/"
cp "${BUILD}/bin/wasm-opt" "${BINDIR}/wasm-opt"
run_config from-source

# Restore the release binary.
cp "${BINDIR}/wasm-opt.release" "${BINDIR}/wasm-opt"
rm -f "${LIBDIR}/libbinaryen.so"
echo ""
echo "=== done (release binary restored; outputs above must have equal sha256) ==="
