#!/bin/bash
# Apply wasm-emscripten-finalize transformation on host.
#
# Usage: ./scripts/common/apply-finalize.sh <input.wasm> <output.wasm>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# wasm-emscripten-finalize ships with emscripten (it was removed from Binaryen ~v116), so use the
# emsdk's own — the one emscripten would run in-link — directly. No binaryen download. A host-mode
# kicad/test build stubs the emsdk finalize and keeps the real binary at .real; prefer it (the stub
# exits 0 having done nothing).
EMSDK_DIR="${EMSDK:-${PROJECT_ROOT}/tools/emsdk}"
FINALIZE="${EMSDK_DIR}/upstream/bin/wasm-emscripten-finalize"
if [ -x "${FINALIZE}.real" ]; then
    FINALIZE="${FINALIZE}.real"
fi

INPUT_WASM="${1:-output/pcbnew.wasm}"
OUTPUT_WASM="${2:-${INPUT_WASM}}"

if [ ! -f "${INPUT_WASM}" ]; then
    echo "ERROR: Input file not found: ${INPUT_WASM}"
    exit 1
fi

echo "Applying wasm-emscripten-finalize..."
echo "  Input:  ${INPUT_WASM}"
echo "  Output: ${OUTPUT_WASM}"
echo "  Tool:   ${FINALIZE}"

# Run finalize with the same flags Emscripten would use
# NOTE: --dwarf removed because debug info is in separate .debug.wasm file
"${FINALIZE}" \
    -g \
    --bigint \
    --no-legalize-javascript-ffi \
    --detect-features \
    "${INPUT_WASM}" \
    -o "${OUTPUT_WASM}"

echo "Finalize complete: ${OUTPUT_WASM}"
ls -lh "${OUTPUT_WASM}"
