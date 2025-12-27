#!/bin/bash
set -e

# Source Emscripten environment
source /emsdk/emsdk_env.sh 2>/dev/null

# Sync source from host to workspace volume
# This fixes macOS Docker timestamp issues with bind mounts
# (autoconf sanity checks fail when timestamps appear inconsistent)
if [[ -d /workspace-host ]]; then
    echo "Syncing source code to container volume..."
    rsync -a --delete \
        --exclude='build-wasm' \
        --exclude='output' \
        /workspace-host/ /workspace/
    echo "Sync complete."
fi

# Execute command or start shell
exec "$@"
