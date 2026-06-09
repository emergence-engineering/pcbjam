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

# Bound Binaryen's host thread pool. wasm-opt runs function-parallel passes, and
# each worker holds the optimization working-set of one function at a time — so
# peak RAM scales with thread count. Binaryen reads BINARYEN_CORES to size the
# pool; default to 8 for memory-constrained dev machines, overridable via the
# environment (CI sets it to $(nproc) on the 128 GB Hetzner runner).
export BINARYEN_CORES="${BINARYEN_CORES:-8}"

# Preload a scalable allocator on Linux. wasm-opt churns a ~40 GB high-water mark
# of short-lived allocations across all worker threads; glibc malloc serializes
# concurrent alloc/free on per-arena locks, so under many threads ~half of every
# core's cycles collapse into futex lock-spin (strace: ~99% kernel time in futex)
# instead of optimization work — the more cores, the worse it gets. jemalloc and
# mimalloc are built for exactly this many-thread churn and eliminate the storm,
# roughly halving wall-clock. macOS already ships a scalable allocator
# (libmalloc/nano-zone), so only Linux needs this. Honor an externally-set
# WASM_OPT_PRELOAD; otherwise auto-detect a system jemalloc/mimalloc.
#
# WASM_OPT_PRELOAD=none (or 0) forces NO preload — a clean glibc baseline for
# benchmarking the allocator A/B (see scripts/bench/).
if [[ "${WASM_OPT_PRELOAD:-}" == "none" || "${WASM_OPT_PRELOAD:-}" == "0" ]]; then
    WASM_OPT_PRELOAD=""
    _PRELOAD_FORCED_OFF=1
fi

if [[ -z "${WASM_OPT_PRELOAD:-}" && -z "${_PRELOAD_FORCED_OFF:-}" && "$(uname -s)" == "Linux" ]]; then
    for _alloc in \
        "/usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2" \
        "/usr/lib/$(uname -m)-linux-gnu/libmimalloc.so.2" \
        /usr/lib/libjemalloc.so.2 \
        /usr/lib/libmimalloc.so.2; do
        if [[ -e "${_alloc}" ]]; then
            WASM_OPT_PRELOAD="${_alloc}"
            break
        fi
    done
fi

# Build the command prefix that injects the allocator (preserving any existing
# LD_PRELOAD). Empty when no scalable allocator was found — wasm-opt then runs
# under the default allocator, just slower.
if [[ -n "${WASM_OPT_PRELOAD:-}" ]]; then
    PRELOAD_CMD=(env "LD_PRELOAD=${WASM_OPT_PRELOAD}${LD_PRELOAD:+:${LD_PRELOAD}}")
else
    PRELOAD_CMD=()
fi

# Wrap wasm-opt in GNU `time -v` when available (Linux CI) so the log records
# peak RSS + wall-clock for each pass. macOS `time` lacks -v, so fall back to
# running wasm-opt directly there.
if /usr/bin/time -v true >/dev/null 2>&1; then
    TIME_CMD=(/usr/bin/time -v)
else
    TIME_CMD=()
fi

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
echo "  BINARYEN_CORES=${BINARYEN_CORES}"
echo "  LD_PRELOAD=${WASM_OPT_PRELOAD:-<none>}"

"${PRELOAD_CMD[@]}" "${TIME_CMD[@]}" "${WASM_OPT}" --asyncify \
    "--pass-arg=asyncify-imports@${ASYNCIFY_IMPORTS}" \
    "--pass-arg=asyncify-removelist@${ASYNCIFY_REMOVE_ARG}" \
    --pass-arg=asyncify-propagate-addlist \
    "${INPUT_WASM}" -o "${OUTPUT_WASM}"

# ASYNCIFY_ONLY=1 stops after the asyncify pass (skips -O2). Used by the
# benchmark harness (scripts/bench/) to time/compare just the asyncify pass,
# whose RAM fits where the -O2 pass on the bloated module would not.
if [[ "${ASYNCIFY_ONLY:-0}" == "1" ]]; then
    echo ""
    echo "ASYNCIFY_ONLY=1 → skipping -O2 pass (benchmark mode)."
    ls -lh "${OUTPUT_WASM}"
    exit 0
fi

echo ""
echo "Running wasm-opt -O2 on the asyncified wasm..."
echo "  Purpose: shrink asyncify-instrumented functions back under V8's"
echo "  per-function locals limit (otherwise large coroutine-entry and"
echo "  similar functions silently stall in Chrome's V8). See docs/debugging/DEBUG.md §7"
echo "  and memory/bundle-size-asyncify-optimization.md."
echo "  This pass also takes several minutes and ~10-15 GB RAM."
echo "  BINARYEN_CORES=${BINARYEN_CORES}"
echo "  LD_PRELOAD=${WASM_OPT_PRELOAD:-<none>}"

"${PRELOAD_CMD[@]}" "${TIME_CMD[@]}" "${WASM_OPT}" -O2 "${OUTPUT_WASM}" -o "${OUTPUT_WASM}"

echo ""
echo "Asyncify + -O2 complete: ${OUTPUT_WASM}"
ls -lh "${OUTPUT_WASM}"
