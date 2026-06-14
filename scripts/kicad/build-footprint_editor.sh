#!/bin/bash
# Build KiCad Footprint Editor for WebAssembly.
# Thin wrapper around build-kicad-target.sh — see that script for options.
# (The footprint editor is the pcbnew kiface launched at FRAME_FOOTPRINT_EDITOR,
#  like symbol_editor is the eeschema kiface at FRAME_SCH_SYMBOL_EDITOR.)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/build-kicad-target.sh" footprint_editor "$@"
