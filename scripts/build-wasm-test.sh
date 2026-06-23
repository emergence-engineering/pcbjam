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

# Native wasm-EH (docs/features/wasm-exceptions/): the emsdk-bundled Binaryen v121 crashes
# asyncifying wasm-EH, so stub the in-link Asyncify and run --hoist-cpp-catches + --asyncify
# post-link on Binaryen v130 (scripts/common/hoist-and-asyncify.sh).
EMSDK_WASM_OPT="$PROJECT_ROOT/tools/emsdk/upstream/bin/wasm-opt"
WASMOPT_STUB="$PROJECT_ROOT/wasm/stubs/wasm-opt-stub.sh"
_eh_restore_wasmopt() { [ -f "${EMSDK_WASM_OPT}.ehbak" ] && mv -f "${EMSDK_WASM_OPT}.ehbak" "${EMSDK_WASM_OPT}"; }
EH_MARKER=""
if [ "${WX_NATIVE_EH:-0}" = "1" ]; then
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
    EH_MARKER="$(mktemp)"
fi

# Build (pass DEBUG flag if requested). App links are independent, so honor
# JOBS/PARALLEL_JOBS from env.sh (each emcc link is slow due to Asyncify).
if [ "$DEBUG_BUILD" = "1" ]; then
    make -j"${JOBS:-1}" -f Makefile.wasm DEBUG=1 "$MAKE_TARGET"
else
    make -j"${JOBS:-1}" -f Makefile.wasm "$MAKE_TARGET"
fi

# Native wasm-EH: restore the emsdk wasm-opt, then hoist + asyncify each freshly-linked app.
if [ "${WX_NATIVE_EH:-0}" = "1" ]; then
    _eh_restore_wasmopt; trap - EXIT
    echo ""
    echo "=== Post-link --hoist-cpp-catches + --asyncify (native wasm-EH) ==="
    while IFS= read -r w; do
        "$SCRIPT_DIR/common/hoist-and-asyncify.sh" "$w"
        # Bind the asyncify-instrumented dynCall_* trampolines (needs -sDYNCALLS=1) so unwind/rewind
        # through indirect calls works — same shim KiCad uses (scripts/common/inject-dyncall-shims.sh).
        js="${w%.wasm}.js"
        if [ -f "$js" ]; then
            ( cd "$(dirname "$js")" && "$SCRIPT_DIR/common/inject-dyncall-shims.sh" "$(basename "$js")" )
        fi
    done < <(find "$STANDALONE_DIR" -name '*_test.wasm' -newer "$EH_MARKER")
    rm -f "$EH_MARKER"
fi

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
