#!/bin/bash
set -e

# Source Emscripten environment
source /emsdk/emsdk_env.sh 2>/dev/null

# Sync source from host to workspace volume
# This fixes macOS Docker timestamp issues with bind mounts
# (autoconf sanity checks fail when timestamps appear inconsistent)
# Touch transferred files to set container timestamps for correct make detection
if [[ -d /workspace-host ]]; then
    echo "Syncing source code to container volume..."
    rsync -ai --delete \
        --exclude='build-wasm' \
        --exclude='output' \
        /workspace-host/ /workspace/ | \
        grep "^>f" | \
        sed "s/^[^ ]* //" | \
        while read f; do touch "/workspace/$f" 2>/dev/null; done
    echo "Sync complete."
fi

# Execute command or start shell
exec "$@"
