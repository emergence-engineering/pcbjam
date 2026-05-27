#!/bin/bash
# Apply asyncify transformation to KiCad WASM
#
# Usage: ./scripts/common/apply-asyncify.sh <input.wasm> <output.wasm>
#
# This script is called by docker/build.sh but can also be run standalone
# for debugging asyncify issues.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Get wasm-opt path
WASM_OPT=$("${SCRIPT_DIR}/get-wasm-opt.sh")

INPUT_WASM="${1:-output/pcbnew.wasm}"
OUTPUT_WASM="${2:-${INPUT_WASM}}"

if [ ! -f "${INPUT_WASM}" ]; then
    echo "ERROR: Input file not found: ${INPUT_WASM}"
    exit 1
fi

echo "Applying asyncify transformation..."
echo "  Input:  ${INPUT_WASM}"
echo "  Output: ${OUTPUT_WASM}"
echo "  Tool:   ${WASM_OPT}"

# Asyncify import patterns (functions that trigger async suspension)
# - env.invoke_* : Exception handling trampolines
# - env.__asyncjs__* : EM_ASYNC_JS functions (like startModal())
ASYNCIFY_IMPORTS="env.invoke_*,env.__asyncjs__*,env.emscripten_fiber_swap"

# Functions to exclude from asyncify instrumentation
# These are large functions that inflate beyond V8's local-count limits.
ASYNCIFY_REMOVE=$(cat << 'REMOVELIST'
COLOR_SETTINGS::COLOR_SETTINGS(wxString const&, bool)
BuildBitmapInfo(std::__2::unordered_map<BITMAPS, std::__2::vector<BITMAP_INFO, std::__2::allocator<BITMAP_INFO>>, std::__2::hash<BITMAPS>, std::__2::equal_to<BITMAPS>, std::__2::allocator<std::__2::pair<BITMAPS const, std::__2::vector<BITMAP_INFO, std::__2::allocator<BITMAP_INFO>>>>>&)
match
DIALOG_PAD_PROPERTIES_BASE::DIALOG_PAD_PROPERTIES_BASE(wxWindow*, int, wxString const&, wxPoint const&, wxSize const&, long)
buildKicadAboutBanner(EDA_BASE_FRAME*, ABOUT_APP_INFO&)
IGESToBRep_CurveAndSurface::TransferGeometry(opencascade::handle<IGESData_IGESEntity> const&, Message_ProgressRange const&)
StepAP214_Protocol::StepAP214_Protocol()
BRepCheck_ParallelAnalyzer::operator()(int) const
ShapeFix_Wire::FixGap3d(int, bool)
ShapeFix_Wire::FixGap2d(int, bool)
PCB_EDIT_FRAME::setupUIConditions()
REMOVELIST
)

ASYNCIFY_REMOVE_ARG=$(echo "${ASYNCIFY_REMOVE}" | tr '\n' ',' | sed 's/,$//')

echo ""
echo "Running wasm-opt --asyncify..."
echo "This may take several minutes and use significant RAM..."

"${WASM_OPT}" --asyncify \
    "--pass-arg=asyncify-imports@${ASYNCIFY_IMPORTS}" \
    "--pass-arg=asyncify-removelist@${ASYNCIFY_REMOVE_ARG}" \
    --pass-arg=asyncify-propagate-addlist \
    "${INPUT_WASM}" -o "${OUTPUT_WASM}"

echo ""
echo "Asyncify complete: ${OUTPUT_WASM}"
ls -lh "${OUTPUT_WASM}"
