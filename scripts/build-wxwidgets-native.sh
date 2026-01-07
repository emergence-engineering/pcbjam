#!/bin/bash
#
# Build wxWidgets for native macOS (not WASM)
# This is used for the native GAL test harness
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WX_SRC="$PROJECT_ROOT/wxwidgets"
BUILD_DIR="$PROJECT_ROOT/build-native/wxwidgets"
INSTALL_DIR="$PROJECT_ROOT/build-native/wxwidgets-install"
LOG_FILE="$PROJECT_ROOT/tests/logs/wxwidgets-native-build.log"

mkdir -p "$(dirname "$LOG_FILE")"

echo "Building wxWidgets for native macOS..."
echo "  Source: $WX_SRC"
echo "  Build:  $BUILD_DIR"
echo "  Install: $INSTALL_DIR"
echo "  Log:    $LOG_FILE"

# Create build directory
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Set up paths for homebrew libraries
export PKG_CONFIG_PATH="/opt/homebrew/lib/pkgconfig:/opt/homebrew/opt/libpng/lib/pkgconfig:$PKG_CONFIG_PATH"
export CPPFLAGS="-I/opt/homebrew/include $CPPFLAGS"
export LDFLAGS="-L/opt/homebrew/lib $LDFLAGS"

# Configure wxWidgets for native macOS with OpenGL support
echo "Configuring..."
"$WX_SRC/configure" \
    --prefix="$INSTALL_DIR" \
    --disable-shared \
    --with-opengl \
    --with-osx_cocoa \
    --disable-webview \
    --disable-mediactrl \
    --with-libpng=sys \
    --with-libjpeg=sys \
    --with-libtiff=sys \
    --with-zlib=sys \
    >> "$LOG_FILE" 2>&1

# Build
echo "Building (this may take a while)..."
make -j$(sysctl -n hw.ncpu 2>/dev/null || echo 4) >> "$LOG_FILE" 2>&1

# Install
echo "Installing..."
make install >> "$LOG_FILE" 2>&1

echo ""
echo "wxWidgets native build complete!"
echo "wx-config: $INSTALL_DIR/bin/wx-config"
echo ""
echo "To use in CMake:"
echo "  set(wxWidgets_CONFIG_EXECUTABLE $INSTALL_DIR/bin/wx-config)"
echo "  find_package(wxWidgets REQUIRED COMPONENTS core base gl)"
