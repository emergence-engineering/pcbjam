#!/bin/bash
# Exit 0 if all 3 repos are clean (no staged, no unstaged, no untracked files).
# Exit 1 with a readable message listing the dirty repos otherwise.
# Untracked files count as dirty - this is intentional: starting a new feature
# while you have uncommitted new files is almost always a mistake.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./repos.sh
source "$SCRIPT_DIR/repos.sh"

dirty=()
for repo in "${REPOS[@]}"; do
    p=$(repo_path "$repo")
    # `git status --porcelain` is empty iff worktree clean (covers modified, staged, and untracked).
    if [ -n "$(git -C "$p" status --porcelain)" ]; then
        dirty+=("$repo")
    fi
done

if [ ${#dirty[@]} -eq 0 ]; then
    echo "All 3 repos clean."
    exit 0
fi

echo "Dirty repos: ${dirty[*]}" >&2
for repo in "${dirty[@]}"; do
    p=$(repo_path "$repo")
    echo "--- $repo ---" >&2
    git -C "$p" status --short >&2
done
exit 1
