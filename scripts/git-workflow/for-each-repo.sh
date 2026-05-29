#!/bin/bash
# Run a git command in each of the 3 repos. Echoes before each run.
# Usage: ./for-each-repo.sh <git-subcommand-and-args>
#   e.g. ./for-each-repo.sh status --short
#        ./for-each-repo.sh fetch origin

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./repos.sh
source "$SCRIPT_DIR/repos.sh"

if [ $# -eq 0 ]; then
    echo "Usage: $0 <git-subcommand> [args...]" >&2
    exit 2
fi

for repo in "${REPOS[@]}"; do
    p=$(repo_path "$repo")
    echo "=== $repo ($p) ==="
    echo "+ git -C $p $*"
    if ! git -C "$p" "$@"; then
        echo "FAILED in repo: $repo" >&2
        exit 1
    fi
done
