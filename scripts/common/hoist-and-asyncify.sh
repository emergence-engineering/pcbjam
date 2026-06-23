#!/bin/bash
# Post-link Asyncify for native-wasm-EH apps (docs/features/wasm-exceptions/).
#
# The emsdk-bundled Binaryen v121 crashes asyncifying wasm-EH (Asyncify.cpp:1146), so the in-link
# Asyncify must have been STUBBED (see build-wasm-test.sh / build-kicad-target.sh). This runs the
# real pipeline post-link, on Binaryen v130:
#   1. --hoist-cpp-catches   our fork pass — lets Asyncify suspend from inside C++ catch blocks
#   2. --asyncify            the real instrumentation
#   3. -O2                   coalesce the locals Asyncify added, back under V8's per-function limit
# Mirrors build-eh-spike.sh's post-link steps. Usage: hoist-and-asyncify.sh <app.wasm>
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WASM="$1"
[ -f "$WASM" ] || { echo "hoist-and-asyncify: no such wasm: $WASM" >&2; exit 1; }

# Suspending imports across all wx test apps (a superset is safe — absent ones are ignored):
# wx modal dialogs (startModal), clipboard/font JS (js_*), the wasm-EH invoke_* trampolines,
# EM_ASYNC_JS (__asyncjs__*), and coroutine fiber swaps.
IMPORTS="${ASYNCIFY_IMPORTS_PASS:-env.startModal,env.js_*,env.invoke_*,env.__asyncjs__*,env.emscripten_fiber_swap}"

# Resolve the two wasm-opts once via env (build-wasm-test.sh exports these), else on demand.
V130="${V130_WASMOPT:-$(BINARYEN_VERSION=130 "${SCRIPT_DIR}/get-wasm-opt.sh" 2>/dev/null | tail -1)}"
HOIST="${HOIST_WASMOPT:-$("${SCRIPT_DIR}/../binaryen-hoist-pass/build-wasm-opt.sh")}"

echo "  [eh-asyncify] $(basename "$(dirname "$WASM")")/$(basename "$WASM")"
# HOIST_KEEP_NAMES=1 preserves the wasm names section through -O2 (for callstack debugging).
G="${HOIST_KEEP_NAMES:+-g}"
"$HOIST" --hoist-cpp-catches -all $G "$WASM" -o "$WASM"
"$V130" --asyncify -all $G "--pass-arg=asyncify-imports@${IMPORTS}" "$WASM" -o "$WASM"
"$V130" -O2 -all $G "$WASM" -o "$WASM"
