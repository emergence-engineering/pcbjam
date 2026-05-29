#!/bin/bash
# Usage: ./scripts/create-feature-patches.sh [branch-name]
# Creates patches in features/<branch-name>/

set -e

BRANCH=${1:-$(git branch --show-current)}
FEATURE_DIR="features/${BRANCH}"

mkdir -p "$FEATURE_DIR"

# Root repo patch (exclude submodules and features/ — the latter would cause
# the patch to contain itself recursively).
git diff HEAD -- ':!kicad' ':!wxwidgets' ':!features' > "$FEATURE_DIR/root.patch"

# Submodule patches: diff against main's recorded submodule sha so the patch
# captures only this feature branch's submodule work (committed + uncommitted),
# never upstream changes that landed on main.
sub_diff() {
    local sub="$1"
    local out="$2"
    local main_sha
    main_sha=$(git ls-tree origin/main "$sub" 2>/dev/null | awk '{print $3}')
    if [ -z "$main_sha" ]; then
        echo "Warning: could not resolve origin/main:$sub — skipping $out" >&2
        rm -f "$out"
        return
    fi
    local cur_sha
    cur_sha=$(git -C "$sub" rev-parse HEAD)
    if [ "$main_sha" = "$cur_sha" ] && git -C "$sub" diff --quiet; then
        echo "No feature-specific $sub changes (submodule pointer matches main, worktree clean) — skipping $(basename "$out")"
        rm -f "$out"
        return
    fi
    git -C "$sub" diff "$main_sha" > "$out"
}

sub_diff kicad     "$FEATURE_DIR/kicad.patch"
sub_diff wxwidgets "$FEATURE_DIR/wxwidgets.patch"

echo "Patches created in $FEATURE_DIR/"
ls -la "$FEATURE_DIR"/*.patch 2>/dev/null || echo "No patches generated"
