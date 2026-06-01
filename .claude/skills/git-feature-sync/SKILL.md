---
name: git-feature-sync
description: Rebase the current feature branch onto main in all 3 repos (root + kicad + wxwidgets). Naturally re-runnable - after the user resolves a conflict manually and runs `git rebase --continue`, re-invoke the skill and it picks up where it stopped. Usage - "/git-feature-sync".
---

# git-feature-sync

Rebase the current feature branch onto each repo's main, across root, kicad, and wxwidgets.

Per-repo main mapping is in `scripts/git-workflow/repos.sh` (root=`main`, subs=`wasm-port`).

## How "resume after conflict" works

There is **no state file**. State is derived live each run:
- `git -C <p> merge-base --is-ancestor origin/<main> HEAD` → if 0, the branch already contains the latest main; skip this repo.
- `.git/rebase-merge` or `.git/rebase-apply` directory present → rebase is mid-flight in that repo; refuse to do anything until the user finishes or aborts it.

So after the user resolves a conflict manually + runs `git rebase --continue` in the stopped repo, just re-running `/git-feature-sync` picks up at the next un-rebased repo.

## Steps

1. **Fetch every origin FIRST.** Run `bash scripts/git-workflow/for-each-repo.sh fetch origin`. This is mandatory on every sync and must happen *before* the status snapshot. `repo-status.sh` derives `up_to_date_with_main` from the local `origin/<main>` ref **without fetching** — so without this step the work plan (step 4) can wrongly mark a repo "up to date" and skip a needed rebase when its origin has moved. (This is the bug that let a stale sync report "all 3 up to date" while `origin/wasm-port` had actually advanced.)

2. **Get status snapshot.** Run `bash scripts/git-workflow/repo-status.sh` and parse the per-repo JSON. Because step 1 just fetched, `up_to_date_with_main` now reflects true remote state.

3. **Pre-flight checks.**
   - If any repo has `rebase_in_progress: true`, STOP. Tell the user which repo, and that they need to resolve (`git -C <repo> rebase --continue` after `git add`-ing resolved files) or abort (`git -C <repo> rebase --abort`) before sync can proceed.
   - Determine the feature branch from root's `branch` field. If root is on its main (`main`) or detached, STOP and say "no feature branch active in root — nothing to sync".
   - For each submodule with `branch != <feature-branch>`:
     - If branch is empty (detached), prose-ask: "wxwidgets is at detached HEAD `<sha>`. Want me to `git -C wxwidgets checkout <feature-branch>` first? (y/N)". On yes, run it (auto-allowed). On no, STOP.
     - If branch is some other name, STOP and tell the user which repo is on which branch. Don't auto-switch.

4. **Determine work plan.** For each repo, mark "needs rebase" if `up_to_date_with_main: false`. If all three are up-to-date, print "all 3 repos already up to date with their mains" and stop cleanly.

5. **Execute per repo** in order [root, kicad, wxwidgets]. Skip any repo with `up_to_date_with_main: true`. For each repo that needs rebase:
   - Prose-announce: "About to rebase <repo> (`<feature>`) onto `origin/<main>` — proceed?"
   - `git -C <path> rebase origin/<main>` (origins were already fetched in step 1; this hits the `ask` permission — user confirms again at tool layer)
   - If the rebase command exits non-zero (conflict), STOP and emit the handoff message (see below).
   - On success, continue to the next repo.

6. **After all 3 succeed:** check `git -C <root> status --short` for staged or unstaged changes to the `kicad` / `wxwidgets` submodule entries. If present, suggest:
   > Submodule SHAs changed during rebase. When ready: `/git-feature-commit "sync: bump submodule pointers after rebase"`.
   Do NOT auto-commit.

## Conflict handoff message — use this exact shape

When a rebase fails mid-flight in repo X, list the repos in the plan, what's been done, what's pending, and the manual commands to resolve. Derive everything live by re-running `repo-status.sh` if needed.

> **Completed:** root rebased onto origin/main (3 commits replayed).
> **Stopped:** kicad — conflict during rebase. Conflicted files:
> ```
> kicad/eeschema/foo.cpp
> kicad/common/bar.cpp
> ```
> **Pending:** wxwidgets (not started).
>
> **To resolve manually:**
> ```
> cd kicad   # from the project root
> # edit each conflicted file, resolve <<<<<<< markers
> git add eeschema/foo.cpp common/bar.cpp
> git rebase --continue
> ```
>
> Then re-run `/git-feature-sync` — kicad will be detected as already rebased and it will proceed with wxwidgets.
>
> To roll back kicad only: `git -C kicad rebase --abort`. Note: already-rebased repos (root in this case) **stay rebased** — they are not rolled back.

Get the conflicted-files list from `git -C <path> diff --name-only --diff-filter=U`.

## Safety

- Never `--force` anything.
- Never `git rebase --skip` on the user's behalf — only `--continue` is safe and that's the user's job after manual resolution.
- Always echo the command before running it.
- Detached HEAD in a submodule is a confirmation point, never an auto-fix.
