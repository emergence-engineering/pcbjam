#!/bin/bash
# Build a KiCad app (pcbnew, eeschema, calculator) inside Docker, then run
# asyncify and friends on the host.
#
# Usage:
#   ./docker/build.sh <app> [args...]
#
# Apps:
#   pcbnew         PCB editor
#   eeschema       schematic editor
#   calculator     PCB calculator
#   pl_editor      drawing-sheet editor
#   symbol_editor  symbol editor (eeschema kiface, FRAME_SCH_SYMBOL_EDITOR)
#   all            build all of the above sequentially
#
# Any extra args are forwarded to scripts/kicad/build-<app>.sh (e.g. -j 8,
# --full, --release, --diag=gal).
#
# The build is split into two phases:
# 1. Docker: Compile KiCad to WASM (without asyncify)
# 2. Host: Apply asyncify transformation (uses Binaryen v121)
#
# Binaryen is downloaded automatically - no prerequisites needed.

# Auto-launch the live progress dashboard in this terminal (handled by logging.sh,
# which owns the TTY before it re-execs us with output redirected). Set KICAD_NO_MONITOR=1
# to disable. MUST be set before sourcing logging.sh — that's where the dashboard is
# launched, in the pre-re-exec process.
export KICAD_MONITOR=1

# Redirect all output to a log file (re-execs script with redirection).
# MUST be sourced before arg parsing — the re-exec relies on the original
# "$@", so any shifts before this point would strip args from the re-exec.
source "$(dirname "$0")/../scripts/common/logging.sh"

# Build-progress markers (parsed by scripts/build-monitor.sh).
source "$(dirname "$0")/../scripts/common/stages.sh"

set -e

# Emit a completion/failure marker no matter how the build ends, so the monitor
# can stop on a clean "done" or show an aborted state instead of hanging.
trap '_rc=$?; if [ $_rc -eq 0 ]; then kw_done; else kw_fail $_rc; fi' EXIT
# On Ctrl-C, mark the build aborted so the final dashboard frame shows failed
# (not a stale "running" state). The EXIT trap above also fires; the monitor reads
# the last marker, so the duplicate is harmless.
trap 'kw_fail 130; exit 130' INT TERM

cd "$(dirname "$0")/.."

VALID_APPS="pcbnew | eeschema | calculator | pl_editor | symbol_editor | all"

usage() {
    echo "Usage: ./docker/build.sh <app> [args...]" >&2
    echo "  <app>: ${VALID_APPS}" >&2
    echo "  args:  forwarded to scripts/kicad/build-<app>.sh (e.g. -j 8, --release)" >&2
}

# First positional arg must be the app name. No default — picking one would
# silently build the wrong thing for someone who forgot the argument.
if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi
if [[ $# -lt 1 ]] || [[ "$1" == -* ]]; then
    echo "Error: missing <app> argument" >&2
    usage
    exit 1
fi
APP_NAME="$1"
shift

case "$APP_NAME" in
    pcbnew|eeschema|calculator|pl_editor|symbol_editor|all) ;;
    *)
        echo "Error: unknown app '$APP_NAME' (expected: ${VALID_APPS})" >&2
        usage
        exit 1
        ;;
esac

# Use branch name as Docker Compose project name for isolated containers/volumes
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD | tr '/' '-' | tr '[:upper:]' '[:lower:]')
export COMPOSE_PROJECT_NAME="kicad-wasm-${BRANCH_NAME}"
echo "Using Docker project: ${COMPOSE_PROJECT_NAME}"
echo "Building app: ${APP_NAME}"

# Add -j 10 by default if no -j flag is given
ARGS=("$@")
if [[ ! " ${ARGS[*]} " =~ " -j " ]]; then
    ARGS+=("-j" "10")
fi

# Start container if not running
docker compose -f docker/docker-compose.yml up -d

# Sync source code to container volume (fixes macOS Docker VirtioFS issues)
# Use --checksum to only transfer files with different CONTENT, not timestamps.
# This avoids the timestamp mismatch cycle that caused full rebuilds every time.
# Transferred files get current container time, so make detects them correctly.
kw_stage container-sync
echo "Syncing source code to container..."
# rsync into the macOS-backed volume intermittently hits transient VirtioFS glitches:
# temp-file rename failures (exit 23) or vanished-source files (exit 24, harmless).
# --inplace avoids the temp-file+rename pattern that triggers exit 23; retry up to 3x
# for any residual flakiness (--checksum makes each retry skip already-synced files).
sync_rc=0
for sync_attempt in 1 2 3; do
    if docker compose -f docker/docker-compose.yml exec kicad-wasm-builder \
        rsync -r --delete --checksum --inplace \
            --exclude="build-wasm" \
            --exclude="output" \
            --exclude=".git" \
            --exclude="logs" \
            --exclude=".idea" \
            --exclude="node_modules" \
            --exclude="tools/emsdk" \
            /workspace-host/ /workspace/
    then
        sync_rc=0
    else
        sync_rc=$?
    fi
    { [ $sync_rc -eq 0 ] || [ $sync_rc -eq 24 ]; } && break
    echo "rsync attempt ${sync_attempt} failed (exit ${sync_rc}); retrying in 2s..."
    sleep 2
done
if [ $sync_rc -ne 0 ] && [ $sync_rc -ne 24 ]; then
    echo "ERROR: source sync failed after retries (exit ${sync_rc})"; exit 1
fi

# Map an app name to its inner CMake build subdirectory. Most apps share their
# subdir name with the app name; pcb_calculator emits OUTPUT_NAME=calculator
# but lives under the pcb_calculator/ subtree.
kicad_subdir_for() {
    case "$1" in
        calculator)    echo "pcb_calculator" ;;
        pl_editor)     echo "pagelayout_editor" ;;
        symbol_editor) echo "eeschema" ;;
        *)             echo "$1" ;;
    esac
}

# Build one app: compile in container, then run host-side post-processing.
# Args: <app> [index] [total] — index/total drive the monitor's app counter.
build_app() {
    local app="$1"
    local index="${2:-1}"
    local total="${3:-1}"
    local subdir
    subdir=$(kicad_subdir_for "$app")
    kw_app "$app" "$index" "$total"
    echo ""
    echo "=== Building ${app} (${index}/${total}) ==="

    # Run build inside the container.
    # -e EMSDK=/emsdk: `docker compose exec` bypasses the entrypoint that sources
    # emsdk_env.sh, so the build shell would lack emcc/embuilder on PATH. Setting
    # EMSDK lets scripts/common/env.sh source /emsdk/emsdk_env.sh and activate the toolchain.
    docker compose -f docker/docker-compose.yml exec -e EMSDK=/emsdk kicad-wasm-builder \
        "/workspace/scripts/kicad/build-${app}.sh" "${ARGS[@]}"

    # Copy output to host-accessible directory.
    # ${app}.wasm.debug.wasm contains DWARF debug info (when built with -gseparate-dwarf).
    kw_stage copy-output
    echo "Copying ${app} build output to ./output/..."
    docker compose -f docker/docker-compose.yml exec kicad-wasm-builder \
        bash -c "mkdir -p /workspace/output && \
            cp /workspace/build-wasm/kicad-${app}/${subdir}/${app}.{js,wasm,wasm.debug.wasm,wasm.map,worker.js} /workspace/output/ 2>/dev/null || \
            cp /workspace/build-wasm/kicad-${app}/${subdir}/${app}.{js,wasm} /workspace/output/; \
            cp /workspace/build-wasm/kicad-${app}/resources/images.tar.gz /workspace/output/ 2>/dev/null || true; \
            cp /workspace/build-wasm/wxwidgets/build/wasm/wx.js /workspace/output/ 2>/dev/null || true"

    # Inject dynCall shims (fixes "dynCall_* is not defined" errors in Emscripten 4.x)
    kw_stage dyncall-shims
    ./scripts/common/inject-dyncall-shims.sh "output/${app}.js"

    # Apply wasm-emscripten-finalize on host (skipped in Docker due to memory limits)
    kw_stage finalize
    ./scripts/common/apply-finalize.sh "output/${app}.wasm" "output/${app}.wasm"

    # Apply asyncify transformation on host
    kw_stage asyncify
    ./scripts/common/apply-asyncify.sh "output/${app}.wasm" "output/${app}.wasm"
}

if [[ "${APP_NAME}" == "all" ]]; then
    build_app pcbnew 1 5
    build_app eeschema 2 5
    build_app calculator 3 5
    build_app pl_editor 4 5
    build_app symbol_editor 5 5
else
    build_app "${APP_NAME}" 1 1
fi

echo ""
echo "Build complete. Output files in ./output/"
ls -lh output/
