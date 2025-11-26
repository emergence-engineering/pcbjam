#!/bin/bash
#
# KiCad Wasm Port - Update KiCad Submodule
#
# This script updates the KiCad submodule to a new version and
# helps regenerate patches if needed.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
KICAD_DIR="$PROJECT_ROOT/kicad"
PATCHES_DIR="$PROJECT_ROOT/patches"

echo "=== KiCad Wasm Port - Update KiCad ==="
echo ""

# Check if kicad submodule exists
if [ ! -d "$KICAD_DIR/.git" ] && [ ! -f "$KICAD_DIR/.git" ]; then
    echo "Error: KiCad submodule not initialized."
    echo "Run: git submodule update --init --recursive"
    exit 1
fi

# Parse arguments
TARGET_REF="${1:-}"
FORCE_UPDATE=0

if [ "$1" = "--force" ] || [ "$2" = "--force" ]; then
    FORCE_UPDATE=1
fi

show_usage() {
    echo "Usage: $0 [<ref>] [--force]"
    echo ""
    echo "Arguments:"
    echo "  <ref>     Git reference (branch, tag, or commit) to update to"
    echo "            Examples: 8.0, master, v8.0.0, abc1234"
    echo "  --force   Force update even if patches need manual intervention"
    echo ""
    echo "If no ref is provided, shows current KiCad version."
}

# Show current version
show_current_version() {
    cd "$KICAD_DIR"
    echo "Current KiCad version:"
    echo "  Branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'detached')"
    echo "  Commit: $(git rev-parse --short HEAD)"
    echo "  Date:   $(git log -1 --format=%ci)"

    # Check if there are local modifications
    if ! git diff --quiet; then
        echo ""
        echo "Warning: There are uncommitted changes in the KiCad directory"
        git status --short
    fi
}

# Revert patches before update
revert_patches() {
    echo "Reverting existing patches..."
    cd "$KICAD_DIR"

    for patch_file in "$PATCHES_DIR"/*.patch; do
        if [ -f "$patch_file" ]; then
            patch_name="$(basename "$patch_file")"
            # Try to reverse the patch
            if git apply --reverse --check "$patch_file" 2>/dev/null; then
                echo "  Reverting: $patch_name"
                git apply --reverse "$patch_file"
            else
                echo "  Skipping (not applied): $patch_name"
            fi
        fi
    done
}

# Update submodule
update_submodule() {
    local ref="$1"
    echo ""
    echo "Updating KiCad to: $ref"

    cd "$KICAD_DIR"

    # Fetch latest
    echo "Fetching from origin..."
    git fetch origin

    # Checkout the target ref
    echo "Checking out $ref..."
    git checkout "$ref"

    # If it's a branch, pull latest
    if git rev-parse --verify "origin/$ref" >/dev/null 2>&1; then
        echo "Pulling latest from origin/$ref..."
        git pull origin "$ref"
    fi

    echo ""
    show_current_version
}

# Main logic
if [ -z "$TARGET_REF" ] || [ "$TARGET_REF" = "--force" ]; then
    show_current_version
    echo ""
    show_usage
    exit 0
fi

echo "Preparing to update KiCad..."
echo ""

# Show current version
show_current_version
echo ""

# Revert patches first
revert_patches
echo ""

# Update submodule
update_submodule "$TARGET_REF"
echo ""

# Re-apply patches
echo "Re-applying patches..."
"$SCRIPT_DIR/prepare.sh"

echo ""
echo "=== Update Complete ==="
echo ""
echo "Don't forget to test the build:"
echo "  cd build && cmake --build . --clean-first"
