#!/bin/bash
# Apply wasm-emscripten-finalize transformation on host
# Uses the same Binaryen v121 as wasm-opt to ensure version consistency
#
# Usage: ./scripts/common/apply-finalize.sh <input.wasm> <output.wasm>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Get wasm-opt path (this downloads Binaryen if needed)
WASM_OPT=$("${SCRIPT_DIR}/get-wasm-opt.sh")
BINARYEN_BIN=$(dirname "${WASM_OPT}")
FINALIZE="${BINARYEN_BIN}/wasm-emscripten-finalize"
# Same stub hazard as wasm-opt (see get-wasm-opt.sh): a host-mode kicad build
# leaves the emsdk finalize stubbed with the real binary at .real — prefer it,
# the stub exits 0 having done nothing.
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
