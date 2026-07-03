#!/bin/bash
# Build the standalone OpenCASCADE 3D service (occ_service) for WebAssembly —
# a persistent Web-Worker embind module (STEP/3D export + STEP/IGES model
# tessellation). Thin wrapper around build-kicad-target.sh — see that script
# for options, and docs/features/occ-split/README.md for the design.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/build-kicad-target.sh" occ_service "$@"
