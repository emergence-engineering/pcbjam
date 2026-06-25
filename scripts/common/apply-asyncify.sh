#!/bin/bash
# Unified post-link Asyncify pass for KiCad AND the wx test apps.
#
# Usage: apply-asyncify.sh [--hoist] [--no-removelist] <input.wasm> [output.wasm]
#
#   (default)         KiCad / JS-EH: --asyncify + remove-list + -O2.
#   --hoist           native wasm-EH: run our --hoist-cpp-catches fork pass FIRST (lets Asyncify
#                     suspend from inside C++ catch blocks) and enable all wasm features (-all) so
#                     binaryen understands the EH instructions. Used by build-wasm-test.sh for the
#                     default native-EH build (gate JS-EH via WX_LEGACY_EH=1) + the native-EH KiCad build.
#   --no-removelist   skip the KiCad big-function remove-list (the small wx test apps don't contain
#                     those symbols, and one bare entry — "match" — could collide).
#
# WHY post-link (not emcc's in-link Asyncify): the emsdk-bundled Binaryen crashes asyncifying
# wasm-EH and a compiler/standalone version skew corrupts asyncify metadata. So the in-link pass is
# stubbed (build-kicad-target.sh / build-wasm-test.sh) and the real transform runs here, on the host
# (more RAM), with a pinned Binaryen. The cost: emcc's automatic asyncify-imports generation is
# bypassed, so the BOUNDARY import list lives in asyncify-imports.txt (see that file).
#
# Binaryen selection (env overrides win, set by build-wasm-test.sh):
#   V130_WASMOPT   = wasm-opt for --asyncify + -O2 (else get-wasm-opt.sh = emsdk-matched).
#   HOIST_WASMOPT  = wasm-opt fork carrying --hoist-cpp-catches (else built on demand).

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# --- flags ---
DO_HOIST=0
USE_REMOVELIST=1
while [[ "${1:-}" == --* ]]; do
    case "$1" in
        --hoist)         DO_HOIST=1; shift ;;
        --no-removelist) USE_REMOVELIST=0; shift ;;
        *) echo "apply-asyncify: unknown flag: $1" >&2; exit 1 ;;
    esac
done

INPUT_WASM="${1:-output/pcbnew.wasm}"
OUTPUT_WASM="${2:-${INPUT_WASM}}"
[ -f "${INPUT_WASM}" ] || { echo "ERROR: Input file not found: ${INPUT_WASM}" >&2; exit 1; }

# --- Binaryen tools (env overrides from build-wasm-test.sh win) ---
WASM_OPT="${V130_WASMOPT:-$("${SCRIPT_DIR}/get-wasm-opt.sh")}"
if [ "$DO_HOIST" = 1 ]; then
    HOIST_OPT="${HOIST_WASMOPT:-$("${SCRIPT_DIR}/../binaryen-hoist-pass/build-wasm-opt.sh")}"
fi

# native wasm-EH needs -all so binaryen parses the EH instructions; HOIST_KEEP_NAMES keeps the
# names section through -O2 for callstack debugging. KiCad/JS-EH uses neither (matches old behavior).
FEAT=()
[ "$DO_HOIST" = 1 ] && FEAT=(-all)
G="${HOIST_KEEP_NAMES:+-g}"

# --- the import boundary (shared) + the KiCad remove-list (opt-out), read from sibling files ---
_join_list() { grep -vE '^[[:space:]]*#|^[[:space:]]*$' "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | tr '\n' ',' | sed 's/,$//'; }
ASYNCIFY_IMPORTS="${ASYNCIFY_IMPORTS_PASS:-$(_join_list "${SCRIPT_DIR}/asyncify-imports.txt")}"
REMOVE_ARG=()
if [ "$USE_REMOVELIST" = 1 ]; then
    REMOVE_ARG=("--pass-arg=asyncify-removelist@$(_join_list "${SCRIPT_DIR}/asyncify-removelist.txt")")
fi

# --- memory machinery (identical to before; matters for the host-side KiCad pass) ---
# Bound Binaryen's host thread pool: peak RAM scales with thread count.
export BINARYEN_CORES="${BINARYEN_CORES:-8}"

# Preload a scalable allocator on Linux — glibc malloc collapses into futex lock-spin under
# wasm-opt's many-thread allocation churn; jemalloc/mimalloc roughly halve wall-clock. macOS
# already ships a scalable allocator. WASM_OPT_PRELOAD=none|0 forces a clean glibc baseline.
if [[ "${WASM_OPT_PRELOAD:-}" == "none" || "${WASM_OPT_PRELOAD:-}" == "0" ]]; then
    WASM_OPT_PRELOAD=""; _PRELOAD_FORCED_OFF=1
fi
if [[ -z "${WASM_OPT_PRELOAD:-}" && -z "${_PRELOAD_FORCED_OFF:-}" && "$(uname -s)" == "Linux" ]]; then
    for _alloc in \
        "/usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2" \
        "/usr/lib/$(uname -m)-linux-gnu/libmimalloc.so.2" \
        /usr/lib/libjemalloc.so.2 /usr/lib/libmimalloc.so.2; do
        [[ -e "${_alloc}" ]] && { WASM_OPT_PRELOAD="${_alloc}"; break; }
    done
fi
if [[ -n "${WASM_OPT_PRELOAD:-}" ]]; then
    PRELOAD_CMD=(env "LD_PRELOAD=${WASM_OPT_PRELOAD}${LD_PRELOAD:+:${LD_PRELOAD}}")
else
    PRELOAD_CMD=()
fi
# GNU `time -v` on Linux CI records peak RSS + wall-clock per pass; macOS `time` lacks -v.
if /usr/bin/time -v true >/dev/null 2>&1; then TIME_CMD=(/usr/bin/time -v); else TIME_CMD=(); fi

echo "Applying Asyncify${DO_HOIST:+ (+hoist-cpp-catches)}..."
echo "  Input:  ${INPUT_WASM}"
echo "  Output: ${OUTPUT_WASM}"
echo "  asyncify wasm-opt: ${WASM_OPT}"
[ "$DO_HOIST" = 1 ] && echo "  hoist    wasm-opt: ${HOIST_OPT}"
echo "  BINARYEN_CORES=${BINARYEN_CORES}  LD_PRELOAD=${WASM_OPT_PRELOAD:-<none>}"

SRC="${INPUT_WASM}"

# 1. (native wasm-EH only) hoist C++ catch arms so Asyncify can suspend from inside them.
if [ "$DO_HOIST" = 1 ]; then
    echo "Running --hoist-cpp-catches..."
    "${PRELOAD_CMD[@]}" "${TIME_CMD[@]}" "${HOIST_OPT}" --hoist-cpp-catches "${FEAT[@]}" ${G} "${SRC}" -o "${OUTPUT_WASM}"
    SRC="${OUTPUT_WASM}"
fi

# 2. The real Asyncify transform.
echo "Running wasm-opt --asyncify (several minutes + significant RAM)..."
"${PRELOAD_CMD[@]}" "${TIME_CMD[@]}" "${WASM_OPT}" --asyncify "${FEAT[@]}" ${G} \
    "--pass-arg=asyncify-imports@${ASYNCIFY_IMPORTS}" \
    "${REMOVE_ARG[@]}" \
    --pass-arg=asyncify-propagate-addlist \
    "${SRC}" -o "${OUTPUT_WASM}"

# ASYNCIFY_ONLY=1 stops before -O2 (benchmark harness in scripts/bench/ times just the transform).
if [[ "${ASYNCIFY_ONLY:-0}" == "1" ]]; then
    echo "ASYNCIFY_ONLY=1 → skipping -O2 (benchmark mode)."; ls -lh "${OUTPUT_WASM}"; exit 0
fi

# 3. Post-asyncify shrink. Asyncify spills every live local; without coalescing, large
# coroutine-entry functions exceed V8's per-function locals limit and stall/crash the renderer.
# -O1 already runs CoalesceLocals and suffices (CI uses it); -O2 is the default. NOT -Os/-Oz
# (they break the asyncify runtime — Binaryen #4484). See docs/debugging/DEBUG.md §6-7.
BINARYEN_OPT_LEVEL="${BINARYEN_OPT_LEVEL:--O2}"
echo "Running wasm-opt ${BINARYEN_OPT_LEVEL} (shrink instrumented functions under V8's local limit)..."
"${PRELOAD_CMD[@]}" "${TIME_CMD[@]}" "${WASM_OPT}" "${BINARYEN_OPT_LEVEL}" "${FEAT[@]}" ${G} "${OUTPUT_WASM}" -o "${OUTPUT_WASM}"

echo "Asyncify + ${BINARYEN_OPT_LEVEL} complete: ${OUTPUT_WASM}"
ls -lh "${OUTPUT_WASM}"
