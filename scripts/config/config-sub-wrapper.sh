#!/bin/bash
# SHELL wrapper that intercepts config.sub calls and uses our updated version
# This allows building with autoconf projects without modifying their config.sub files
#
# How it works:
# - autoconf's configure runs: $SHELL "${ac_aux_dir}config.sub" $host_alias
# - By exporting SHELL to point to this script, we intercept these calls
# - When $1 ends with "config.sub", we use our version instead
# - All other invocations pass through to real bash

WRAPPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUR_CONFIG_SUB="$WRAPPER_DIR/config.sub"

# Check if we're being asked to execute a config.sub script
# configure calls: $SHELL "path/to/config.sub" <args>
if [[ "$1" == *config.sub ]]; then
    # Use our config.sub instead, passing all remaining arguments
    exec "$OUR_CONFIG_SUB" "${@:2}"
fi

# For all other invocations, pass through to real bash
exec /bin/bash "$@"
