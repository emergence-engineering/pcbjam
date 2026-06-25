#!/bin/bash
# Build the wxWidgets WASM test applications

# Redirect all output to a log file (re-execs script with redirection)
source "$(dirname "$0")/common/logging.sh"
source "$(dirname "$0")/common/env.sh"
# This script creates library symlinks and builds the test apps
#
# Usage:
#   ./build-wasm-test.sh              # Incremental build (default)
#   ./build-wasm-test.sh --clean      # Clean build from scratch
#   ./build-wasm-test.sh --debug      # Build with debug symbols
#   ./build-wasm-test.sh menu         # Build only the menu test
#   ./build-wasm-test.sh --debug menu # Build menu test with debug symbols

set -e

DEBUG_BUILD=0
CLEAN_BUILD=0
TARGET=""

# Parse arguments
for arg in "$@"; do
    if [ "$arg" = "--debug" ]; then
        DEBUG_BUILD=1
    elif [ "$arg" = "--clean" ]; then
        CLEAN_BUILD=1
    elif [ "$arg" != "" ]; then
        TARGET="$arg"
    fi
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TESTS_DIR="$PROJECT_ROOT/tests"

BUILD_DIR="$PROJECT_ROOT/build-wasm/wxwidgets"
WASM_APP_DIR="$TESTS_DIR/apps"
STANDALONE_DIR="$WASM_APP_DIR/standalone"

echo "=== Building wxWidgets WASM Test Applications ==="
if [ "$DEBUG_BUILD" = "1" ]; then
    echo "Mode: DEBUG (with DWARF symbols and source maps)"
else
    echo "Mode: Release (optimized)"
fi
if [ -n "$TARGET" ]; then
    echo "Target: $TARGET"
else
    echo "Target: all"
fi
echo "Project root: $PROJECT_ROOT"
echo "wxWidgets build: $BUILD_DIR"
echo "Test app dir: $WASM_APP_DIR"

# Verify wxWidgets is built
if [ ! -f "$BUILD_DIR/wx-config" ]; then
    echo "ERROR: wxWidgets not built. Run build-wx-wasm.sh first"
    exit 1
fi

# Create library symlinks
# wx-config outputs paths like libwx_baseu-3.2.a but files are named libwx_baseu-3.2-emscripten.a
echo ""
echo "=== Creating library symlinks ==="
cd "$BUILD_DIR/lib"
for f in libwx_*-emscripten.a; do
    if [ -f "$f" ]; then
        link="${f%-emscripten.a}.a"
        if [ ! -e "$link" ]; then
            ln -s "$f" "$link"
            echo "Created: $link -> $f"
        fi
    fi
done

# Build the test apps
echo ""
echo "=== Building test applications ==="
cd "$WASM_APP_DIR"

# Determine make target
if [ -n "$TARGET" ]; then
    MAKE_TARGET="$TARGET"
else
    MAKE_TARGET="all"
fi

# Clean if requested
if [ "$CLEAN_BUILD" = "1" ]; then
    echo "Cleaning build artifacts..."
    make -f Makefile.wasm clean 2>/dev/null || true
fi

# Native wasm-EH is the DEFAULT (this branch IS the native-EH migration); set WX_LEGACY_EH=1 to
# build the legacy Emscripten JS exceptions instead. For the native build, the emsdk-bundled
# Binaryen v121 crashes asyncifying wasm-EH, so we stub the in-link Asyncify and run
# --hoist-cpp-catches + --asyncify post-link on Binaryen v130 (apply-asyncify.sh --hoist).
EMSDK_WASM_OPT="$PROJECT_ROOT/tools/emsdk/upstream/bin/wasm-opt"
WASMOPT_STUB="$PROJECT_ROOT/wasm/stubs/wasm-opt-stub.sh"
_eh_restore_wasmopt() { [ -f "${EMSDK_WASM_OPT}.ehbak" ] && mv -f "${EMSDK_WASM_OPT}.ehbak" "${EMSDK_WASM_OPT}"; }
EH_MARKER="$(mktemp)"   # created before the build so 'find -newer' below selects freshly-linked apps (both EH modes)
if [ "${WX_LEGACY_EH:-0}" != "1" ]; then
    echo ""
    echo "=== Native wasm-EH: resolving Binaryen v130 + hoist-pass wasm-opt ==="
    export V130_WASMOPT="$(BINARYEN_VERSION=130 "$SCRIPT_DIR/common/get-wasm-opt.sh" 2>/dev/null | tail -1)"
    export HOIST_WASMOPT="$("$SCRIPT_DIR/binaryen-hoist-pass/build-wasm-opt.sh")"
    echo "  v130:  $V130_WASMOPT"
    echo "  hoist: $HOIST_WASMOPT"
    echo "Stubbing in-link Asyncify (will run post-link instead)..."
    cp "$EMSDK_WASM_OPT" "${EMSDK_WASM_OPT}.ehbak"
    cp "$WASMOPT_STUB" "$EMSDK_WASM_OPT"; chmod +x "$EMSDK_WASM_OPT"
    trap _eh_restore_wasmopt EXIT
fi

# Build (pass DEBUG flag if requested). App links are independent, so honor
# JOBS/PARALLEL_JOBS from env.sh (each emcc link is slow due to Asyncify).
if [ "$DEBUG_BUILD" = "1" ]; then
    make -j"${JOBS:-1}" -f Makefile.wasm DEBUG=1 "$MAKE_TARGET"
else
    make -j"${JOBS:-1}" -f Makefile.wasm "$MAKE_TARGET"
fi
make_rc=$?
if [ "$make_rc" -ne 0 ]; then
    # Fail loudly. Silently continuing to the post-link leaves the freshly-linked apps
    # asyncify-stubbed / un-injected, which looks like mass test failures rather than a build
    # error. (The EXIT trap restores the stubbed emsdk wasm-opt in the native-EH build.)
    echo "" >&2
    echo "ERROR: make failed (exit $make_rc); aborting before the post-link step." >&2
    exit "$make_rc"
fi

# Inject the dyncall + handlesleep currData shims into every freshly-linked app. The
# handlesleep currData save/restore (Emscripten #9153) is needed under BOTH EH models:
# without it a rewind that resumes through a fresh wasm re-entry hits
# _asyncify_start_rewind(null) -> "memory access out of bounds" — e.g. a context-menu pick
# while the main loop is parked. The Makefile only injects it for the coroutine apps;
# inject-dyncall-shims.sh is idempotent (skips an already-shimmed glue), so re-running it
# here is safe. Native wasm-EH additionally needs post-link hoist + asyncify on the .wasm first.
if [ "${WX_LEGACY_EH:-0}" != "1" ]; then
    _eh_restore_wasmopt; trap - EXIT
    echo ""
    echo "=== Post-link --hoist-cpp-catches + --asyncify (native wasm-EH) ==="
fi
while IFS= read -r w; do
    if [ "${WX_LEGACY_EH:-0}" != "1" ]; then
        "$SCRIPT_DIR/common/apply-asyncify.sh" --hoist --no-removelist "$w"
    fi
    js="${w%.wasm}.js"
    if [ -f "$js" ]; then
        ( cd "$(dirname "$js")" && "$SCRIPT_DIR/common/inject-dyncall-shims.sh" "$(basename "$js")" )
    fi
# Match EVERY freshly-linked app wasm, not just standalone/*/*_test.wasm: the main demo
# (apps/minimal_test.wasm) is at the apps/ root, and the coroutine-pthread repros + wxpt app
# are *_repro*.wasm / *_wxpt.wasm. The old '*_test.wasm under standalone' filter silently
# skipped all of those, so under native wasm-EH they never got hoist+asyncify and crashed at
# runtime with "asyncify_start_unwind not found".
done < <(find "$WASM_APP_DIR" -name '*.wasm' -newer "$EH_MARKER")
rm -f "$EH_MARKER"

echo ""
echo "=== Build complete ==="

if [ -n "$TARGET" ]; then
    # Show just the built target
    echo ""
    if [ -f "$STANDALONE_DIR/$TARGET/${TARGET}_test.html" ]; then
        echo "Built: $TARGET"
        ls -lh "$STANDALONE_DIR/$TARGET/${TARGET}_test.html"
    elif [ -f "$WASM_APP_DIR/${TARGET}_test.html" ]; then
        echo "Built: $TARGET"
        ls -lh "$WASM_APP_DIR/${TARGET}_test.html"
    else
        echo "Warning: Expected output file not found"
    fi
else
    # Show all built targets
    echo ""
    echo "Main test app:"
    ls -lh "$WASM_APP_DIR"/minimal_test.html 2>/dev/null || echo "  (not built)"

    echo ""
    echo "Standalone test apps:"
    for test in menu clipboard filedialog layout aui toolbar grid dialog timer tree; do
        if [ -f "$STANDALONE_DIR/$test/${test}_test.html" ]; then
            echo "  $test: OK"
            ls -lh "$STANDALONE_DIR/$test/${test}_test.html"
        else
            echo "  $test: (not built)"
        fi
    done
fi

echo ""
echo "To run the tests:"
echo "  cd $TESTS_DIR"
echo "  npm install"
echo "  npm test"
