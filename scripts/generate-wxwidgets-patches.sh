#!/bin/bash
# Generate a single unified patch from current wxwidgets state
# This captures ALL modifications including submodule config.sub changes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WX_SOURCE="$PROJECT_ROOT/wxwidgets"
PATCHES_DIR="$PROJECT_ROOT/patches/wxwidgets-wasm"
PATCH_FILE="$PATCHES_DIR/wxwidgets-wasm.patch"

echo "=== Generating wxWidgets WASM Unified Patch ==="
echo "Source: $WX_SOURCE"
echo "Output: $PATCH_FILE"

# Verify wxwidgets exists (check for .git as file or directory - submodules use a file)
if [ ! -e "$WX_SOURCE/.git" ]; then
    echo "ERROR: wxwidgets is not a git repository"
    exit 1
fi

# Create output directory
mkdir -p "$PATCHES_DIR"

cd "$WX_SOURCE"

# Capture current commit SHA (the base we're patching from)
CURRENT_COMMIT=$(git rev-parse HEAD)
echo ""
echo "Base commit: $CURRENT_COMMIT"

# Start with empty patch file
> "$PATCH_FILE"

echo ""
echo "=== Part 1: Main wxWidgets changes ==="
# Mark all untracked files as "intent to add" (allows git diff to see them)
git add -N .

# Generate main diff (excluding submodule directory pointers, but including everything else)
git diff HEAD -- . \
    ':!3rdparty/catch' \
    ':!3rdparty/nanosvg' \
    ':!3rdparty/pcre' \
    ':!src/expat' \
    ':!src/jpeg' \
    ':!src/png' \
    ':!src/tiff' \
    ':!src/zlib' \
    >> "$PATCH_FILE"

# Undo the intent-to-add
git reset HEAD --quiet

MAIN_LINES=$(wc -l < "$PATCH_FILE")
echo "Added main changes ($MAIN_LINES lines so far)"

echo ""
echo "=== Part 2: Submodule config.sub changes ==="

# Process each submodule config.sub
add_submodule_config_sub() {
    local submodule="$1"
    local config_sub_path="$2"
    local full_path="$WX_SOURCE/$config_sub_path"

    if [ -d "$WX_SOURCE/$submodule" ] && [ -f "$full_path" ]; then
        cd "$WX_SOURCE/$submodule"

        # Get the relative path within the submodule
        local rel_config_sub="${config_sub_path#$submodule/}"

        # Check if config.sub is modified in this submodule
        if ! git diff --quiet HEAD -- "$rel_config_sub" 2>/dev/null; then
            echo "  Adding $config_sub_path"

            # Generate diff with paths rewritten to be relative to main repo
            git diff HEAD -- "$rel_config_sub" | sed "s|a/$rel_config_sub|a/$config_sub_path|g; s|b/$rel_config_sub|b/$config_sub_path|g" >> "$PATCH_FILE"
        else
            echo "  Skipping $config_sub_path (no changes)"
        fi
    else
        echo "  Skipping $submodule (not found)"
    fi
}

add_submodule_config_sub "3rdparty/pcre" "3rdparty/pcre/config.sub"
add_submodule_config_sub "src/expat" "src/expat/expat/conftools/config.sub"
add_submodule_config_sub "src/jpeg" "src/jpeg/config.sub"
add_submodule_config_sub "src/png" "src/png/config.sub"
add_submodule_config_sub "src/tiff" "src/tiff/config/config.sub"

cd "$WX_SOURCE"

TOTAL_LINES=$(wc -l < "$PATCH_FILE")
echo ""
echo "Total patch: $TOTAL_LINES lines"

echo ""
echo "=== Generating checksums ==="
cd "$PATCHES_DIR"
shasum -a 256 *.patch > checksums.sha256
echo "Created checksums.sha256"

echo ""
echo "=== Generating README ==="
cat > README.md << EOF
# wxWidgets WASM Port Patch

Single unified patch that transforms wxWidgets into a WASM-capable build.

## Base Version

- Repository: git@github.com:VV-EE/wxWidgets.git
- Commit: $CURRENT_COMMIT
- Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

## Patch Contents

This single patch includes:
- Main wxWidgets modifications (config.sub, configure.in, headers, sources)
- New WASM platform: src/wasm/, include/wx/wasm/
- New build files: build/wasm/
- WASM theme renderer: src/univ/themes/wasm.cpp
- Submodule config.sub updates for emscripten/wasm32 support:
  - 3rdparty/pcre/config.sub
  - src/expat/expat/conftools/config.sub
  - src/jpeg/config.sub
  - src/png/config.sub
  - src/tiff/config/config.sub

## Apply Instructions

\`\`\`bash
# Clone wxWidgets fork at the base commit
git clone git@github.com:VV-EE/wxWidgets.git wxwidgets-clean
cd wxwidgets-clean
git checkout $CURRENT_COMMIT
git submodule update --init --recursive

# Apply the unified patch
patch -p1 < /path/to/patches/wxwidgets-wasm/wxwidgets-wasm.patch

# Build
mkdir build && cd build
emconfigure ../configure --host=emscripten --enable-universal ...
emmake make
\`\`\`

## Verification

\`\`\`bash
shasum -a 256 -c checksums.sha256
\`\`\`
EOF
echo "Created README.md"

echo ""
echo "=== Summary ==="
ls -lh "$PATCHES_DIR"
echo ""
echo "Unified patch generated successfully!"
