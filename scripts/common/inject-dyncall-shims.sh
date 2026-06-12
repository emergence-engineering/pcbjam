#!/bin/bash
# Post-process the Emscripten-generated <app>.js for KiCad WASM (pcbnew, eeschema,
# pl_editor, calculator, …).
#
# The actual JavaScript that gets injected lives in readable, standalone files in
# scripts/common/shims/ (not inline heredocs):
#   - dyncall-binding.js.tmpl  per-signature dynCall_<sig> binding (templated)
#   - handlesleep.js           nested-Asyncify handleSleep currData save/restore (#9153)
#   - diagnostics.js           optional logging-only instrumentation (see SHIM_DIAGNOSTICS)
#
# Why bind dynCall_* to the real wasm exports: the build links -sDYNCALLS=1, so
# asyncify-INSTRUMENTED dynCall_* trampolines exist as wasm exports. The bare
# dynCall_<sig>(index, ...) call sites (invoke_* wrappers, the empty-callback fixes
# below) aren't bound to top-level names, so we bind them to wasmExports["dynCall_<sig>"].
# Binding to getWasmTableEntry() instead bypasses the instrumentation and breaks
# unwind/rewind through indirect calls ("indirect call signature mismatch" — caught
# every frame in Firefox; a hard renderer crash in Chrome/V8).
#
# Usage:
#   inject-dyncall-shims.sh <pcbnew.js>
#   SHIM_DIAGNOSTICS=1 inject-dyncall-shims.sh <pcbnew.js>   # also inject diagnostics.js

set -e

JS_FILE="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHIM_DIR="$SCRIPT_DIR/shims"

# One-line toggle for the diagnostics module (default OFF).
SHIM_DIAGNOSTICS="${SHIM_DIAGNOSTICS:-0}"

if [ -z "$JS_FILE" ] || [ ! -f "$JS_FILE" ]; then
    echo "Error: JS file not found: $JS_FILE"
    echo "Usage: $0 <path/to/pcbnew.js>"
    exit 1
fi
for f in dyncall-binding.js.tmpl handlesleep.js diagnostics.js; do
    if [ ! -f "$SHIM_DIR/$f" ]; then
        echo "Error: missing shim source $SHIM_DIR/$f"
        exit 1
    fi
done

# --- 1. dynCall_<sig> bindings -------------------------------------------------
echo "Extracting dynCall signatures from $JS_FILE..."
SIGNATURES=$(grep -oE 'dynCall_[a-zA-Z0-9]+' "$JS_FILE" | sort -u | sed 's/dynCall_//')
if [ -z "$SIGNATURES" ]; then
    echo "No dynCall signatures found - nothing to inject"
    exit 0
fi
SIG_COUNT=$(echo "$SIGNATURES" | wc -l | tr -d ' ')
echo "Found $SIG_COUNT unique signatures"

# The template body is everything from the `function` line onward (skip its comments).
TEMPLATE_BODY=$(sed -n '/^function /,$p' "$SHIM_DIR/dyncall-binding.js.tmpl")

SHIM_FILE=$(mktemp)
{
    echo ""
    echo "// === dynCall bindings (bind bare names to the real DYNCALLS=1 wasm exports) ==="
} > "$SHIM_FILE"

for sig in $SIGNATURES; do
    argcount=$((${#sig} - 1))
    args="index"
    call_args=""
    for ((i=0; i<argcount; i++)); do
        args="$args, a$i"
        if [ $i -gt 0 ]; then call_args="$call_args, "; fi
        call_args="${call_args}a$i"
    done
    echo "$TEMPLATE_BODY" \
        | sed -e "s/@SIG@/$sig/g" -e "s/@ARGS@/$args/g" -e "s/@CALLARGS@/$call_args/g" \
        >> "$SHIM_FILE"
done
echo "// === End dynCall bindings ===" >> "$SHIM_FILE"

# Insert right after the getWasmTableEntry definition.
GWTL_LINE=$(grep -n '^var getWasmTableEntry = funcPtr => {' "$JS_FILE" | head -1 | cut -d: -f1)
if [ -z "$GWTL_LINE" ]; then
    GWTL_LINE=$(grep -n 'var getWasmTableEntry' "$JS_FILE" | head -1 | cut -d: -f1)
fi
if [ -z "$GWTL_LINE" ]; then
    echo "Error: Could not find getWasmTableEntry in $JS_FILE"; rm "$SHIM_FILE"; exit 1
fi
INSERT_LINE=""
for ((i=GWTL_LINE; i<=GWTL_LINE+10; i++)); do
    [ "$(sed -n "${i}p" "$JS_FILE")" == "};" ] && { INSERT_LINE=$i; break; }
done
[ -z "$INSERT_LINE" ] && INSERT_LINE=$GWTL_LINE

echo "Injecting dynCall bindings after line $INSERT_LINE..."
head -n "$INSERT_LINE" "$JS_FILE" > "${JS_FILE}.tmp"
cat "$SHIM_FILE" >> "${JS_FILE}.tmp"
tail -n +$((INSERT_LINE + 1)) "$JS_FILE" >> "${JS_FILE}.tmp"
mv "${JS_FILE}.tmp" "$JS_FILE"
rm "$SHIM_FILE"
echo "Injected $SIG_COUNT dynCall bindings"

# --- 2. Empty-callback fixes ---------------------------------------------------
# Emscripten+pthreads emits some direct-call paths as no-op ((a1)=>{}) stubs that
# ARE used. Rewire each to the (now-bound) dynCall_*. (Kept inline: simple sed one-liners.)
echo "Fixing empty callback arrow functions..."
TOTAL_FIXED=0
apply_fix() { # <grep/sed pattern> <sed replacement> <label>
    local before; before=$(grep -c "$1" "$JS_FILE" || true)
    if [ "$before" -gt 0 ]; then
        # Portable in-place edit (BSD `sed -i ''` and GNU `sed -i` differ; temp+mv works on both).
        sed "s/$1/$2/g" "$JS_FILE" > "${JS_FILE}.sedtmp" && mv "${JS_FILE}.sedtmp" "$JS_FILE"
        local after; after=$(grep -c "$1" "$JS_FILE" || true)
        echo "  Fixed $((before - after)) $3"
        TOTAL_FIXED=$((TOTAL_FIXED + before - after))
    fi
}
apply_fix '((a1, a2, a3) => {})(eventTypeId,' '((a1, a2, a3) => dynCall_iiii(callbackfunc, a1, a2, a3))(eventTypeId,' "HTML5 event callback(s) (dynCall_iiii)"
apply_fix 'var result = (a1 => {})(arg);' 'var result = dynCall_ii(ptr, arg);' "pthread entry callback(s) (dynCall_ii)"
apply_fix 'return (a1 => {})(sig);' 'return dynCall_vi(fp, sig);' "signal handler callback(s) (dynCall_vi)"
apply_fix 'var wrapper = () => (a1 => {})(arg);' 'var wrapper = () => dynCall_vi(func, arg);' "async timer callback(s) (dynCall_vi)"
apply_fix 'var iterFunc = (() => {});' 'var iterFunc = () => dynCall_v(func);' "main loop callback(s) (dynCall_v)"
apply_fix '(a1 => {})(userData);' 'dynCall_vi(entryPoint, userData);' "fiber entry callback(s) (dynCall_vi)"
echo "Total: Fixed $TOTAL_FIXED empty callback(s)"

# --- 3. Nested-Asyncify handleSleep fix ---------------------------------------
# Injected after Emscripten's fiber glue (the _emscripten_fiber_swap.isAsync marker).
# SHIM_DISABLE_HANDLESLEEP=1 skips it: used by the asyncify-races red-green harness
# to keep the historical "sleep buffer clobbered by fiber swap" crash reproducible.
if [ "${SHIM_DISABLE_HANDLESLEEP:-0}" = "1" ]; then
    echo "handleSleep fix DISABLED (SHIM_DISABLE_HANDLESLEEP=1) - ablation build"
elif grep -q '__nestedHandleSleepInstalled' "$JS_FILE"; then
    echo "handleSleep fix already present - skipping"
else
    HS_MARKER=$(grep -n '^_emscripten_fiber_swap\.isAsync = true;$' "$JS_FILE" | head -1 | cut -d: -f1)
    if [ -z "$HS_MARKER" ]; then
        echo "Warning: _emscripten_fiber_swap.isAsync marker not found - skipping handleSleep fix"
    else
        head -n "$HS_MARKER" "$JS_FILE" > "${JS_FILE}.tmp"
        echo "" >> "${JS_FILE}.tmp"
        cat "$SHIM_DIR/handlesleep.js" >> "${JS_FILE}.tmp"
        tail -n +$((HS_MARKER + 1)) "$JS_FILE" >> "${JS_FILE}.tmp"
        mv "${JS_FILE}.tmp" "$JS_FILE"
        echo "Injected handleSleep fix after line $HS_MARKER"
    fi
fi

# --- 3b. embind dynCall fallback (dynCallLegacy -> wasmExports) ----------------
# embind's generic caller (getDynCaller) routes through dynCallLegacy, which only
# reads Module["dynCall_<sig>"]. But the DYNCALLS=1 trampolines are wasm EXPORTS,
# not Module properties, so that lookup is undefined and an Asyncify unwind/rewind
# through an embind call (e.g. kicadOpenFile -> OpenProjectFiles) dies with
# "f is not a function" in Asyncify.doRewind. Add a wasmExports fallback so the
# instrumented trampoline is found and rewind survives.
if grep -q 'embind dynCall fallback installed' "$JS_FILE"; then
    echo "dynCallLegacy fallback already present - skipping"
elif grep -qF '  var f = Module["dynCall_" + sig];' "$JS_FILE"; then
    perl -0pi -e 's/(\Q  var f = Module["dynCall_" + sig];\E)/$1\n  \/\/ embind dynCall fallback installed: DYNCALLS=1 trampolines live on wasmExports, not Module.\n  if (!f && typeof wasmExports !== "undefined") f = wasmExports["dynCall_" + sig];/' "$JS_FILE"
    echo "Injected dynCallLegacy wasmExports fallback"
else
    echo "Warning: dynCallLegacy pattern not found - skipping embind dynCall fallback"
fi

# --- 3c. Fiber trampoline self-heal -------------------------------------------
# emscripten_set_main_loop(...,1) throws "unwind" during startup to establish the
# main loop. KiCad establishes that loop from inside a tool coroutine, so the throw
# propagates THROUGH Fibers.trampoline()'s do/while, skipping its
# `trampolineRunning = false` reset. The flag then stays true forever and
# Fibers.trampoline() becomes a permanent no-op (guard: `if (!trampolineRunning ...)`),
# so every later fiber swap silently fails to switch — the schematic load and all
# post-idle tool actions hang. Wrap the loop in try/finally so the flag is always
# reset (self-healing).
# SHIM_DISABLE_TRAMPOLINE_HEAL=1 skips it: used by the asyncify-races red-green
# harness to keep the historical "park throw wedges the trampoline guard" hang
# reproducible.
if [ "${SHIM_DISABLE_TRAMPOLINE_HEAL:-0}" = "1" ]; then
    echo "fiber trampoline self-heal DISABLED (SHIM_DISABLE_TRAMPOLINE_HEAL=1) - ablation build"
elif grep -qF '} finally { Fibers.trampolineRunning = false; }' "$JS_FILE"; then
    echo "fiber trampoline self-heal already present - skipping"
elif grep -qF 'Fibers.trampolineRunning = true;' "$JS_FILE"; then
    perl -0pi -e 's/(Fibers\.trampolineRunning = true;)(\s*)(do \{.*?\} while \(Fibers\.nextFiber\);)(\s*)(Fibers\.trampolineRunning = false;)/$1$2try {$3} finally { $5 }/s' "$JS_FILE"
    echo "Injected fiber trampoline self-heal (try/finally)"
else
    echo "Warning: Fibers.trampoline pattern not found - skipping trampoline self-heal"
fi

# --- 4. Optional diagnostics (logging only) -----------------------------------
if [ "$SHIM_DIAGNOSTICS" = "1" ]; then
    if grep -q 'DIAG] Asyncify/fiber/modal diagnostics installed' "$JS_FILE"; then
        echo "diagnostics already present - skipping"
    else
        echo "" >> "$JS_FILE"
        cat "$SHIM_DIR/diagnostics.js" >> "$JS_FILE"
        echo "Appended diagnostics module (SHIM_DIAGNOSTICS=1)"
    fi
else
    echo "diagnostics disabled (set SHIM_DIAGNOSTICS=1 to enable)"
fi
