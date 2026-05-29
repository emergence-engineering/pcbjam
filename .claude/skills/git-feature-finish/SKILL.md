---
name: git-feature-finish
description: Merge the current feature branch back to main (fast-forward only) and push, across all 3 repos. Submodules first, then root - so the root push includes the merged submodule SHAs. Stops for confirmation at each merge and push. Usage - "/git-feature-finish".
---

# git-feature-finish

Land the current feature branch into each repo's main and push. Uses `--ff-only` for clean linear history.

Per-repo main mapping is in `scripts/git-workflow/repos.sh` (root=`main`, subs=`wasm-port`).

## Pre-flight (all of these must pass before any merge happens)

1. Run `bash /Users/torcsi/dev/kicad-wasm/scripts/git-workflow/repo-status.sh`. Parse the JSON.
2. All 3 repos must have `dirty: false`. If any is dirty, STOP and tell the user to commit (`/git-feature-commit`) or stash first.
3. All 3 repos must be on the same feature branch (use root's branch as the reference). If not, STOP and report the mismatch.
4. All 3 repos must have `up_to_date_with_main: true` (i.e. the feature is rebased onto the latest main). If any isn't, STOP and instruct: "run `/git-feature-sync` first".
5. None may have `rebase_in_progress: true`. If so, STOP.

## Steps — order: kicad, wxwidgets, root

Submodules first so that when root checks out main and merges its feature branch, the pointer-bump commits land on root's main referencing the just-merged submodule mains.

For each repo in order [kicad, wxwidgets, root]:

1. Skip if already merged: run `git -C <path> branch --merged <main>` and check if the feature branch appears. If so, print "<repo>: feature already merged into <main>, skipping merge+push" and proceed to step 5 (branch delete prompt).

2. **Prose-ask:** "About to merge `<feature>` into `<main>` in <repo> (ff-only) — proceed?"

3. Run, echoing each:
   - `git -C <path> checkout <main>` (auto-allowed)
   - `git -C <path> pull --ff-only` (auto-allowed) — if this fails because main moved with non-ff changes, STOP and tell the user: "<repo>: main moved with non-ff changes since last sync. Run `/git-feature-sync` and try again." Do NOT try `--no-ff`.
   - `git -C <path> merge --ff-only <feature>` (hits `ask` permission — user reconfirms at tool layer). If this fails because main moved in a way that breaks ff, STOP with the same message as above.

4. **Prose-ask:** "Push <repo>'s <main> to origin? — proceed?"
   - `git -C <path> push` (hits `ask` permission).

5. **Prose-ask:** "Delete local feature branch `<feature>` in <repo>?"
   - `git -C <path> branch -d <feature>` (hits `ask` permission). This is safe (`-d`, not `-D`) — git refuses if the branch isn't fully merged, which is exactly the safety we want.

## After all 3 repos done

Report a summary table:
```
kicad:     merged feature/foo into wasm-port, pushed (origin/wasm-port now at <sha>), branch deleted
wxwidgets: merged feature/foo into wasm-port, pushed (origin/wasm-port now at <sha>), branch deleted
root:      merged feature/foo into main,      pushed (origin/main now at <sha>),      branch deleted
```

If `features/<feature>/` exists from `scripts/create-feature-patches.sh`, mention it but do NOT auto-delete. The user may want to keep the patches as history.

## Edge cases

- **Feature already merged in some repos but not all:** the per-repo `--merged` check handles this naturally — finish skips re-merging and just offers branch delete.
- **No local feature branch left to delete in some repo:** `branch -d` will fail; report and continue. Don't make this fatal.
- **`-u` first-push:** this workflow never pushes feature branches, only mains. Mains always have tracking already.

## Safety

- `--ff-only` everywhere, no fallback to `--no-ff`.
- `branch -d` not `-D` — never force-delete.
- Never `--force` push. The settings.json `deny` rule blocks this regardless.
- Always echo commands before running.
- Always pose the prose confirmation BEFORE invoking the tool-layer prompt.
