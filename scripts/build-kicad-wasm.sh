#!/bin/bash
# Master build script for KiCad PCBnew WASM
# Usage: ./build-kicad-wasm.sh [OPTIONS]
#
# Options:
#   --clean         Full clean rebuild
#   --deps-only     Only build dependencies
#   --skip-deps     Skip dependency builds
#   --with-occ      Enable OpenCASCADE (3D/STEP support)
#   --with-ngspice  Enable ngspice (simulation)
#   --with-pthread  Enable pthreads (multi-threading)
#   --release       Release build (optimized, no debug symbols)
#   --debug         Debug build with symbols (default)
#   -j N            Parallel jobs (default: nproc)
#   --help          Show this help

set -e

# Source common environment
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common/env.sh"

# Default options
DEPS_ONLY=0
SKIP_DEPS=0
WITH_OCC=0
WITH_NGSPICE=0
WITH_PTHREAD=0

# Show help
show_help() {
    head -20 "$0" | tail -18 | sed 's/^# //' | sed 's/^#//'
    exit 0
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            show_help
            ;;
        --clean)
            CLEAN_BUILD=1
            shift
            ;;
        --deps-only)
            DEPS_ONLY=1
            shift
            ;;
        --skip-deps)
            SKIP_DEPS=1
            shift
            ;;
        --with-occ)
            WITH_OCC=1
            shift
            ;;
        --with-ngspice)
            WITH_NGSPICE=1
            shift
            ;;
        --with-pthread)
            WITH_PTHREAD=1
            shift
            ;;
        --debug)
            DEBUG_BUILD=1
            shift
            ;;
        --release)
            DEBUG_BUILD=0
            shift
            ;;
        -j)
            PARALLEL_JOBS="$2"
            shift 2
            ;;
        -j*)
            PARALLEL_JOBS="${1#-j}"
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            ;;
    esac
done

# Set defaults if not set
CLEAN_BUILD=${CLEAN_BUILD:-0}
DEBUG_BUILD=${DEBUG_BUILD:-1}  # Debug mode by default (use --release for optimized builds)
PARALLEL_JOBS=${PARALLEL_JOBS:-$(get_nproc)}

# Export for sub-scripts
export CLEAN_BUILD DEBUG_BUILD PARALLEL_JOBS WITH_OCC WITH_NGSPICE WITH_PTHREAD

# Print configuration
echo "========================================"
echo "KiCad WASM Build"
echo "========================================"
echo "  Clean build:    $CLEAN_BUILD"
echo "  Debug build:    $DEBUG_BUILD"
echo "  Deps only:      $DEPS_ONLY"
echo "  Skip deps:      $SKIP_DEPS"
echo "  With OCC:       $WITH_OCC"
echo "  With ngspice:   $WITH_NGSPICE"
echo "  With pthreads:  $WITH_PTHREAD"
echo "  Parallel jobs:  $PARALLEL_JOBS"
echo "========================================"

# Verify prerequisites
setup_error_trap
verify_emscripten
verify_submodules "$PROJECT_ROOT"

# Clean if requested
if [ "$CLEAN_BUILD" = "1" ]; then
    log_step "Cleaning previous builds..."
    rm -rf "$STAMPS_DIR"/*
    rm -rf "$DEPS_ROOT"/*
    rm -rf "$BUILD_ROOT/kicad"
fi

# Build dependencies
if [ "$SKIP_DEPS" != "1" ]; then
    log_step "Building dependencies..."

    # Tier 1: Header-only (just verify they exist)
    log_info "Tier 1: Header-only libraries (no build needed)"

    # Tier 2: Simple C/C++ libraries from thirdparty
    log_info "Tier 2: Simple libraries"
    # These are built as part of KiCad's CMake, no separate build needed

    # Tier 3: Emscripten ports
    log_info "Tier 3: Emscripten ports (zlib, freetype via -sUSE_*)"
    # These are linked via emscripten flags, no separate build

    # Build Zstd
    if [ -f "$SCRIPT_DIR/build-deps/build-zstd-wasm.sh" ]; then
        build_if_needed "zstd" "$SCRIPT_DIR/build-deps/build-zstd-wasm.sh" "$CLEAN_BUILD"
    else
        log_warn "Zstd build script not found, skipping"
    fi

    # Build HarfBuzz
    if [ -f "$SCRIPT_DIR/build-deps/build-harfbuzz-wasm.sh" ]; then
        build_if_needed "harfbuzz" "$SCRIPT_DIR/build-deps/build-harfbuzz-wasm.sh" "$CLEAN_BUILD"
    else
        log_warn "HarfBuzz build script not found, skipping"
    fi

    # Build Pixman
    if [ -f "$SCRIPT_DIR/build-deps/build-pixman-wasm.sh" ]; then
        build_if_needed "pixman" "$SCRIPT_DIR/build-deps/build-pixman-wasm.sh" "$CLEAN_BUILD"
    else
        log_warn "Pixman build script not found, skipping"
    fi

    # Build Cairo
    if [ -f "$SCRIPT_DIR/build-deps/build-cairo-wasm.sh" ]; then
        build_if_needed "cairo" "$SCRIPT_DIR/build-deps/build-cairo-wasm.sh" "$CLEAN_BUILD"
    else
        log_warn "Cairo build script not found, skipping"
    fi

    # Tier 4: Complex dependencies
    if [ "$WITH_OCC" = "1" ]; then
        log_info "Tier 4: Building OpenCASCADE..."
        if [ -f "$SCRIPT_DIR/build-deps/build-opencascade-wasm.sh" ]; then
            build_if_needed "opencascade" "$SCRIPT_DIR/build-deps/build-opencascade-wasm.sh" "$CLEAN_BUILD"
        else
            log_warn "OpenCASCADE build script not found"
        fi
    fi

    if [ "$WITH_NGSPICE" = "1" ]; then
        log_info "Tier 4: Building ngspice..."
        if [ -f "$SCRIPT_DIR/build-deps/build-ngspice-wasm.sh" ]; then
            build_if_needed "ngspice" "$SCRIPT_DIR/build-deps/build-ngspice-wasm.sh" "$CLEAN_BUILD"
        else
            log_warn "ngspice build script not found"
        fi
    fi

    # Verify wxWidgets is built
    if [ ! -f "$WX_BUILD/wx-config" ]; then
        log_step "Building wxWidgets..."
        "$SCRIPT_DIR/build-wxuniversal-wasm.sh"
    else
        log_info "wxWidgets already built"
    fi

    log_info "Dependencies complete"
fi

if [ "$DEPS_ONLY" = "1" ]; then
    log_info "Dependency build complete (--deps-only specified)"
    exit 0
fi

# Build KiCad compatibility layer
log_step "Building WASM compatibility layer..."
if [ -f "$SCRIPT_DIR/build-wasm-compat.sh" ]; then
    "$SCRIPT_DIR/build-wasm-compat.sh"
else
    log_warn "WASM compatibility layer script not found, skipping"
fi

# Build KiCad PCBnew
log_step "Building KiCad PCBnew..."
if [ -f "$SCRIPT_DIR/build-pcbnew-wasm.sh" ]; then
    "$SCRIPT_DIR/build-pcbnew-wasm.sh"
else
    log_error "PCBnew build script not found: $SCRIPT_DIR/build-pcbnew-wasm.sh"
    exit 1
fi

log_info "========================================"
log_info "Build complete!"
log_info "Output: $BUILD_ROOT/kicad/pcbnew/"
log_info "========================================"
