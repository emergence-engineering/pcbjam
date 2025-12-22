#!/bin/bash
# Apply wasm-emscripten-finalize transformation on host
# Uses the same Binaryen v121 as wasm-opt to ensure version consistency
#
# Usage: ./scripts/common/apply-finalize.sh <input.wasm> <output.wasm>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Get wasm-emscripten-finalize from same Binaryen install as wasm-opt
BINARYEN_DIR="${PROJECT_ROOT}/tools/binaryen-121"
FINALIZE="${BINARYEN_DIR}/bin/wasm-emscripten-finalize"

# Ensure Binaryen is downloaded
if [ ! -x "${FINALIZE}" ]; then
    echo "Downloading Binaryen v121..."
    "${SCRIPT_DIR}/get-wasm-opt.sh" > /dev/null
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
