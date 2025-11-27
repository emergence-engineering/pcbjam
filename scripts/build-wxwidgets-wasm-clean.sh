#!/bin/bash
# Build wxWidgets for WASM from a clean clone + patches
# This tests that our patches can reproduce the build

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PATCHES_DIR="$PROJECT_ROOT/patches/wxwidgets-wasm"
CLONE_DIR="$PROJECT_ROOT/wxwidgets-clean"
BUILD_DIR="$PROJECT_ROOT/build-wasm/wxwidgets-clean"
REFERENCE_BUILD="$PROJECT_ROOT/build-wasm/wxwidgets-universal"

# Configuration - fork URL and commit
WX_REPO="git@github.com:VV-EE/wxWidgets.git"
WX_COMMIT="5ff25322553c1870cf20a2e1ba6f20ed50d9fe9a"

# Parse arguments
CLEAN=false
SKIP_BUILD=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --clean) CLEAN=true; shift ;;
        --skip-build) SKIP_BUILD=true; shift ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "  --clean       Force fresh clone (remove existing)"
            echo "  --skip-build  Only clone and patch, skip building"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

echo "=== wxWidgets WASM Clean Build ==="
echo "Repository: $WX_REPO"
echo "Commit: $WX_COMMIT"
echo "Clone dir: $CLONE_DIR"
echo "Build dir: $BUILD_DIR"
echo ""

# Verify patch exists
if [ ! -f "$PATCHES_DIR/wxwidgets-wasm.patch" ]; then
    echo "ERROR: Patch not found: $PATCHES_DIR/wxwidgets-wasm.patch"
    echo "Run ./scripts/generate-wxwidgets-patches.sh first"
    exit 1
fi

# Verify checksums
echo "=== Verifying patch checksums ==="
cd "$PATCHES_DIR"
if ! shasum -a 256 -c checksums.sha256; then
    echo "ERROR: Patch checksum verification failed"
    exit 1
fi
echo "Checksums OK"
echo ""

# Step 1: Clone repository
echo "=== Step 1: Clone repository ==="
if [ "$CLEAN" = true ] || [ ! -d "$CLONE_DIR/.git" ]; then
    rm -rf "$CLONE_DIR"
    echo "Cloning $WX_REPO..."
    git clone "$WX_REPO" "$CLONE_DIR"
    cd "$CLONE_DIR"
    git checkout "$WX_COMMIT"
else
    echo "Using existing clone at $CLONE_DIR"
    cd "$CLONE_DIR"
    git fetch origin
    git checkout "$WX_COMMIT"
    git reset --hard "$WX_COMMIT"
fi
echo ""

# Step 2: Initialize submodules
echo "=== Step 2: Initialize submodules ==="
git submodule update --init --recursive
echo ""

# Step 3: Apply the unified patch
echo "=== Step 3: Apply unified patch ==="
echo "Applying wxwidgets-wasm.patch..."
patch -p1 < "$PATCHES_DIR/wxwidgets-wasm.patch"
echo ""

if [ "$SKIP_BUILD" = true ]; then
    echo "=== Skipping build (--skip-build) ==="
    echo "Clone and patch complete. Source ready at: $CLONE_DIR"
    exit 0
fi

# Step 4: Configure and build
echo "=== Step 4: Configure ==="
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

export CFLAGS="-DZ_HAVE_UNISTD_H=1"
export CXXFLAGS="-DZ_HAVE_UNISTD_H=1"

emconfigure "$CLONE_DIR/configure" \
    --host=emscripten \
    --enable-universal \
    --disable-shared \
    --with-opengl \
    --disable-exceptions \
    --disable-richtext \
    --without-libtiff \
    --disable-xlocale \
    --with-cxx=17 \
    --enable-utf8

echo ""
echo "=== Step 5: Build ==="
emmake make -j$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)

echo ""
echo "=== Step 6: Verify and compare ==="

# List built libraries
echo "Built libraries:"
ls -lh "$BUILD_DIR/lib/"*.a 2>/dev/null || echo "No libraries found"

# Compare with reference build if it exists
if [ -d "$REFERENCE_BUILD/lib" ]; then
    echo ""
    echo "=== Comparison with reference build ==="
    printf "%-50s %12s %12s %10s\n" "Library" "Reference" "Clean" "Match"
    printf "%-50s %12s %12s %10s\n" "-------" "---------" "-----" "-----"

    MISMATCH=0
    for lib in "$BUILD_DIR/lib/"*.a; do
        basename=$(basename "$lib")
        ref_lib="$REFERENCE_BUILD/lib/$basename"

        if [ -f "$ref_lib" ]; then
            # Get sizes (macOS stat syntax)
            new_size=$(stat -f%z "$lib" 2>/dev/null || stat -c%s "$lib")
            ref_size=$(stat -f%z "$ref_lib" 2>/dev/null || stat -c%s "$ref_lib")

            if [ "$new_size" -eq "$ref_size" ]; then
                match="YES"
            else
                match="NO (diff: $((new_size - ref_size)))"
                MISMATCH=1
            fi
            printf "%-50s %12d %12d %10s\n" "$basename" "$ref_size" "$new_size" "$match"
        else
            printf "%-50s %12s %12d %10s\n" "$basename" "(missing)" "$new_size" "NEW"
        fi
    done

    # Check for libraries in reference but not in clean build
    for lib in "$REFERENCE_BUILD/lib/"*.a; do
        basename=$(basename "$lib")
        if [ ! -f "$BUILD_DIR/lib/$basename" ]; then
            ref_size=$(stat -f%z "$lib" 2>/dev/null || stat -c%s "$lib")
            printf "%-50s %12d %12s %10s\n" "$basename" "$ref_size" "(missing)" "MISSING"
            MISMATCH=1
        fi
    done

    echo ""
    if [ "$MISMATCH" -eq 0 ]; then
        echo "SUCCESS: All libraries match!"
    else
        echo "WARNING: Some libraries differ (this may be expected due to build timestamps)"
    fi
else
    echo ""
    echo "No reference build found at $REFERENCE_BUILD"
    echo "Run ./scripts/build-wxuniversal-wasm.sh first to create a reference"
fi

echo ""
echo "=== Build complete ==="
echo "Libraries in: $BUILD_DIR/lib/"
