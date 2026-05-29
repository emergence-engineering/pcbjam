#!/bin/bash
# Build KiCad Eeschema (schematic editor) for WebAssembly.
# Thin wrapper around build-kicad-target.sh — see that script for options.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/build-kicad-target.sh" eeschema "$@"
