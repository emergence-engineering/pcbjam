#!/bin/bash
# Assert all 3 repos are on the given branch.
# Exit 0 if all match. Exit 1 with details if any mismatch (including detached HEAD).
# Usage: ./assert-on-branch.sh <branch-name>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./repos.sh
source "$SCRIPT_DIR/repos.sh"

if [ $# -ne 1 ]; then
    echo "Usage: $0 <branch-name>" >&2
    exit 2
fi

WANT="$1"
mismatched=()
for repo in "${REPOS[@]}"; do
    p=$(repo_path "$repo")
    cur=$(git -C "$p" branch --show-current)
    if [ "$cur" != "$WANT" ]; then
        mismatched+=("$repo: on '${cur:-DETACHED-HEAD}' (want '$WANT')")
    fi
done

if [ ${#mismatched[@]} -eq 0 ]; then
    echo "All 3 repos on branch: $WANT"
    exit 0
fi

echo "Branch mismatch:" >&2
for line in "${mismatched[@]}"; do
    echo "  $line" >&2
done
exit 1
