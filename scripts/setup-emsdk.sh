#!/bin/bash
# Install and activate the Emscripten SDK (emsdk) locally
#
# This script is idempotent - it skips installation if the correct version
# is already installed. The emsdk is installed into tools/emsdk/ which is
# gitignored (~1.5GB).
#
# Usage:
#   ./scripts/setup-emsdk.sh          # Install/activate pinned version
#   ./scripts/setup-emsdk.sh --force  # Force reinstall

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Source version constants
source "$SCRIPT_DIR/common/versions.sh"

EMSDK_DIR="$PROJECT_ROOT/tools/emsdk"
VERSION="$EMSCRIPTEN_VERSION"

echo "=== Emscripten SDK Setup ==="
echo "  Version: $VERSION"
echo "  Location: $EMSDK_DIR"

# Check if already installed with correct version (unless --force)
if [ "$1" != "--force" ] && [ -f "$EMSDK_DIR/emsdk" ]; then
    if "$EMSDK_DIR/emsdk" list 2>/dev/null | grep -q "^[[:space:]]*${VERSION}[[:space:]]*INSTALLED"; then
        echo "Emscripten $VERSION is already installed and active."
        echo "Use --force to reinstall."
        exit 0
    fi
fi

# Clone emsdk if not present
if [ ! -d "$EMSDK_DIR" ]; then
    echo ""
    echo "Cloning emsdk..."
    mkdir -p "$PROJECT_ROOT/tools"
    git clone https://github.com/emscripten-core/emsdk.git "$EMSDK_DIR"
else
    echo ""
    echo "Updating emsdk..."
    (cd "$EMSDK_DIR" && git pull)
fi

# Install and activate the pinned version
echo ""
echo "Installing Emscripten $VERSION..."
"$EMSDK_DIR/emsdk" install "$VERSION"

echo ""
echo "Activating Emscripten $VERSION..."
"$EMSDK_DIR/emsdk" activate "$VERSION"

echo ""
echo "=== Setup complete ==="
echo "Emscripten $VERSION is ready."
echo "Source env.sh to use it: source scripts/common/env.sh"
