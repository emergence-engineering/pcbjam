#!/bin/bash
set -e

# Source Emscripten environment
source /emsdk/emsdk_env.sh 2>/dev/null

# Execute command or start shell
exec "$@"
