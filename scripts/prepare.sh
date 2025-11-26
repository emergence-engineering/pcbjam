#!/bin/bash
#
# KiCad Wasm Port - Prepare Script
#
# This script applies patches to the KiCad source code to enable
# building with optional dependencies disabled.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
KICAD_DIR="$PROJECT_ROOT/kicad"
PATCHES_DIR="$PROJECT_ROOT/patches"

echo "=== KiCad Wasm Port - Prepare ==="
echo "Project root: $PROJECT_ROOT"
echo "KiCad source: $KICAD_DIR"
echo ""

# Check if kicad submodule is initialized
if [ ! -f "$KICAD_DIR/CMakeLists.txt" ]; then
    echo "Error: KiCad submodule not initialized."
    echo "Run: git submodule update --init --recursive"
    exit 1
fi

# Check if patches directory exists
if [ ! -d "$PATCHES_DIR" ]; then
    echo "Error: Patches directory not found: $PATCHES_DIR"
    exit 1
fi

# Function to check if a patch is already applied
patch_already_applied() {
    local patch_file="$1"
    # Try to reverse-apply the patch (dry run)
    # If it succeeds, the patch is already applied
    cd "$KICAD_DIR"
    if git apply --reverse --check "$patch_file" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to apply a patch
apply_patch() {
    local patch_file="$1"
    local patch_name="$(basename "$patch_file")"

    echo "Checking patch: $patch_name"

    if patch_already_applied "$patch_file"; then
        echo "  -> Already applied, skipping"
        return 0
    fi

    echo "  -> Applying..."
    cd "$KICAD_DIR"

    # Try to apply the patch
    if git apply --check "$patch_file" 2>/dev/null; then
        git apply "$patch_file"
        echo "  -> Success"
    else
        echo "  -> Warning: Patch may not apply cleanly, trying with -3 (three-way merge)"
        if git apply -3 "$patch_file" 2>/dev/null; then
            echo "  -> Success with three-way merge"
        else
            echo "  -> Error: Patch failed to apply"
            echo "     You may need to manually resolve conflicts or update the patch"
            return 1
        fi
    fi
}

# Apply all patches in order
echo "Applying patches..."
echo ""

patch_count=0
patch_failed=0

for patch_file in "$PATCHES_DIR"/*.patch; do
    if [ -f "$patch_file" ]; then
        if apply_patch "$patch_file"; then
            ((patch_count++))
        else
            ((patch_failed++))
        fi
        echo ""
    fi
done

echo "=== Summary ==="
echo "Patches applied: $patch_count"
echo "Patches failed: $patch_failed"

if [ $patch_failed -gt 0 ]; then
    echo ""
    echo "Some patches failed to apply. Please check the errors above."
    exit 1
fi

echo ""
echo "=== Next Steps ==="
echo ""
echo "Build with optional dependencies disabled:"
echo ""
echo "  mkdir build && cd build"
echo "  cmake ../kicad \\"
echo "    -DKICAD_USE_CURL=OFF \\"
echo "    -DKICAD_USE_GIT=OFF \\"
echo "    -DKICAD_USE_OCC=OFF \\"
echo "    -DKICAD_USE_NGSPICE=OFF \\"
echo "    -DCMAKE_PREFIX_PATH=\"\$(pwd)/../stubs/include\""
echo "  make -j\$(nproc)"
echo ""
echo "Done!"
