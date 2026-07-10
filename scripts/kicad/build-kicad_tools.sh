#!/bin/bash
# Build the merged headless KiCad CLI (kicad_tools: sym_convert + pcb_convert
# subcommands in one node WASM image). Thin wrapper around
# build-kicad-target.sh — see that script for options.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/build-kicad-target.sh" kicad_tools "$@"
