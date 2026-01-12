#!/bin/bash
# Automatic log file redirection for build scripts
#
# Source this at the top of build scripts to redirect all output to a log file.
# Uses self-re-exec pattern: the script re-launches itself with external redirection,
# which reliably captures ALL output including docker compose TTY output.
#
# Detection logic:
# - If KICAD_LOG_NESTED=1 (re-exec'd or nested call) → output normally
# - If inside Docker (/workspace exists) → output normally
# - Otherwise → re-exec with output redirected to logs/<script>/<timestamp>.log

# Skip if already logging (re-exec'd or nested call)
if [[ "${KICAD_LOG_NESTED:-0}" == "1" ]]; then
    return 0 2>/dev/null || exit 0
fi

# Skip if inside Docker container
if [[ -d "/workspace" ]]; then
    return 0 2>/dev/null || exit 0
fi

# Get the calling script's absolute path
_CALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
_CALLER_SCRIPT="${_CALLER_DIR}/$(basename "${BASH_SOURCE[1]}")"
_SCRIPT_NAME="$(basename "${_CALLER_SCRIPT}" .sh)"

# Find project root (walk up looking for .git)
_PROJECT_ROOT="${_CALLER_DIR}"
while [[ ! -e "${_PROJECT_ROOT}/.git" ]] && [[ "${_PROJECT_ROOT}" != "/" ]]; do
    _PROJECT_ROOT="$(dirname "${_PROJECT_ROOT}")"
done

# Set up log file
_LOGS_DIR="${_PROJECT_ROOT}/logs/${_SCRIPT_NAME}"
_TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
_LOG_FILE="${_LOGS_DIR}/${_TIMESTAMP}.log"

mkdir -p "${_LOGS_DIR}"

# Show log path before re-exec
echo "Logging to: ${_LOG_FILE}"

# Run the calling script with output redirected
# This is equivalent to: ./script.sh > logfile 2>&1
# and reliably captures ALL output including docker compose TTY messages
export KICAD_LOG_NESTED=1
"${_CALLER_SCRIPT}" "$@" > "${_LOG_FILE}" 2>&1
_EXIT_CODE=$?

# Print completion message (this runs AFTER the script finishes)
if [[ ${_EXIT_CODE} -eq 0 ]]; then
    echo "Done. Log: ${_LOG_FILE}"
else
    echo "Failed (exit ${_EXIT_CODE}). Log: ${_LOG_FILE}"
fi

exit ${_EXIT_CODE}
