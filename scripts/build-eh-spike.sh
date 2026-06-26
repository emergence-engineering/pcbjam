#!/bin/bash
# Build the native-wasm-EH red-green spike toy (docs/features/wasm-exceptions/06-spike-plan.md),
# THREE ways from one source — an ablation harness pinning the disease AND the fix:
#   - eh_spike_jseh         : -fexceptions          JS-EH baseline (in-link v121 asyncify)   → all green
#   - eh_spike_wasmeh        : -fwasm-exceptions =1   native wasm-EH, NO hoist pass            → suspend-in-catch TRAPS (red)
#   - eh_spike_wasmeh_hoist  : -fwasm-exceptions =1   native wasm-EH + catch-arm hoist pass    → all green
#
# The wasm-EH variants cannot use the in-link asyncify (emsdk Binaryen v121 crashes on
# try/catch — Asyncify.cpp:1146), so we mirror the production trick (build-kicad-target.sh):
# build with -sASYNCIFY=1 (for the JS asyncify runtime) but stub the in-link wasm-opt so it
# no-ops, then run the real asyncify pass post-link on Binaryen v130. The _hoist variant
# additionally runs `--hoist-cpp-catches` (scripts/binaryen-hoist-pass/) BEFORE --asyncify.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
export EMSDK="${EMSDK:-${PROJECT_ROOT}/tools/emsdk}"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/common/env.sh"   # activates emsdk (em++ on PATH)

SPIKE="${PROJECT_ROOT}/tests/apps/standalone/eh-spike"
LIBCTX="${PROJECT_ROOT}/kicad/thirdparty/libcontext"
HARNESS_INC="${PROJECT_ROOT}/tests/apps/standalone/coroutine"
EMSDK_WASM_OPT="${PROJECT_ROOT}/tools/emsdk/upstream/bin/wasm-opt"
STUB="${PROJECT_ROOT}/wasm/stubs/wasm-opt-stub.sh"

# One binaryen everywhere: the submodule fork is version_130 (asyncify unchanged) + our hoist pass,
# so the same binary does --hoist-cpp-catches AND the post-link --asyncify. No separate v130 download.
HOIST_WASMOPT="${HOIST_WASMOPT:-$("${SCRIPT_DIR}/binaryen-hoist-pass/build-wasm-opt.sh")}"
V130="$HOIST_WASMOPT"
echo "Binaryen (submodule, hoist + asyncify): ${HOIST_WASMOPT} ($("${HOIST_WASMOPT}" --version))"

COMPILE="-O2 -I${LIBCTX} -I${HARNESS_INC}"
LINK="-O2 -sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=65536 -sASSERTIONS=0 \
      -sASYNCIFY_IMPORTS=['emscripten_fiber_swap'] -sERROR_ON_UNDEFINED_SYMBOLS=0"
ASYNCIFY_IMPORTS_PASS="env.invoke_*,env.__asyncjs__*,env.emscripten_fiber_swap"

_restore_wasmopt() {
    if [ -f "${EMSDK_WASM_OPT}.ehbak" ]; then
        mv -f "${EMSDK_WASM_OPT}.ehbak" "${EMSDK_WASM_OPT}"
    fi
}
trap _restore_wasmopt EXIT

# build_variant <name> <eh-flag> <use_stub 0|1> <use_hoist 0|1>
build_variant() {
    local name="$1" ehflag="$2" use_stub="$3" use_hoist="$4"
    local out="${SPIKE}/eh_spike_${name}.html"
    local wasm="${SPIKE}/eh_spike_${name}.wasm"
    local js="${SPIKE}/eh_spike_${name}.js"
    local hoist_label=""
    [ "${use_hoist}" = "1" ] && hoist_label=" +hoist"
    echo ""
    echo "=== building ${name} (${ehflag}${hoist_label}) ==="

    em++ -c ${COMPILE} ${ehflag} "${LIBCTX}/libcontext.cpp" -o "${SPIKE}/libcontext_${name}.o"
    em++ -c ${COMPILE} ${ehflag} "${SPIKE}/eh_spike_test.cpp" -o "${SPIKE}/eh_spike_${name}.o"

    if [ "${use_stub}" = "1" ]; then
        cp "${EMSDK_WASM_OPT}" "${EMSDK_WASM_OPT}.ehbak"
        cp "${STUB}" "${EMSDK_WASM_OPT}"
        chmod +x "${EMSDK_WASM_OPT}"
    fi

    em++ "${SPIKE}/eh_spike_${name}.o" "${SPIKE}/libcontext_${name}.o" \
        ${LINK} ${ehflag} -o "${out}"

    if [ "${use_stub}" = "1" ]; then
        _restore_wasmopt
        if [ "${use_hoist}" = "1" ]; then
            echo "--- catch-arm hoist pass (pre-asyncify) ---"
            "${HOIST_WASMOPT}" --hoist-cpp-catches -all "${wasm}" -o "${wasm}"
        fi
        echo "--- post-link asyncify (v130) ---"
        "${V130}" --asyncify -all "--pass-arg=asyncify-imports@${ASYNCIFY_IMPORTS_PASS}" \
            "${wasm}" -o "${wasm}"
        "${V130}" -O2 -all "${wasm}" -o "${wasm}"
    fi

    # No inject-dyncall-shims: the spike wants RAW asyncify×wasm-EH behavior; variants
    # must differ only in the EH flag (and the hoist pass).
    echo "built ${out}"
}

build_variant jseh        "-fexceptions"                                              0 0
build_variant wasmeh      "-fwasm-exceptions -sSUPPORT_LONGJMP=wasm -sWASM_LEGACY_EXCEPTIONS=1" 1 0
build_variant wasmeh_hoist "-fwasm-exceptions -sSUPPORT_LONGJMP=wasm -sWASM_LEGACY_EXCEPTIONS=1" 1 1

echo ""
echo "=== done ==="
ls -lh "${SPIKE}"/*.html