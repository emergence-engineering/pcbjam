# Bug 05 — Global rebaseline after a remote apply can swallow concurrent local edits and receiver-side cleanup

**Severity:** medium-high (silent permanent peer divergence; probability scales with edit rate × remote traffic)
**Status:** open

## Where

- `wasm/bindings/eeschema_embind.cpp:726-731` (`doApply`) and `:846-849`
  (`doApplyItems`) — `rebaseline()` at the end of every apply
- `wasm/bindings/pcbnew_embind.cpp:811-816`, `:889-894` — same
- `rebaseline()` itself: snapshots the **entire current model** into `g_baseline`

## The race

Applies and flushes are both `CallAfter` pending events on the same frame handler, so
they are FIFO. This ordering is realistic:

1. A remote batch arrives; JS calls `kicadCollabApplyItems` → **apply queued**.
2. Before the pending queue drains, the user's in-flight edit commits (e.g. mouse-up of
   a drag processed in the same frame). `SCH/BOARD_COMMIT::Push` fires the listener →
   `scheduleFlush` → **flush queued behind the apply**.
3. Pending drain: **apply runs first**. `doApplyItems` applies the remote items, then
   `rebaseline()` snapshots the whole model — **which already contains the user's local
   edit**.
4. **flush runs**: diff(current, baseline) is empty. The local edit is never broadcast.

The edit stays in the local editor but never reaches the Y.Doc or peers — permanent,
silent divergence. Drift-detect will eventually report it; nothing repairs it
([10-miss-no-repair-path.md](10-miss-no-repair-path.md)).

## Second casualty: receiver-side cleanup

The convergence argument for the post-settle diff is "the sender broadcasts its FINAL,
post-cleanup geometry; the receiver re-cleaning already-clean geometry is idempotent."
That holds when the receiver's surroundings are identical. When they are not —
concurrent local geometry, e.g. a remotely-moved wire now crossing the receiver's
junction — the receiver's `RecalculateConnections` produces genuinely *new* state
(splits/merges the sender never saw). Because `rebaseline()` runs after `Push`, that
cleanup is folded into the baseline and **never broadcast**: the receiver has split
wires, the sender doesn't, and no future diff will notice.

## Fix

Make the post-apply rebaseline **targeted** instead of global: update `g_baseline`
entries only for the uuids the apply actually added/changed/removed (recompute their
post-apply json/blob-hash; drop removed ones). Everything else the apply's `Push`
mutated as a side effect — receiver-side cleanup, and any concurrently committed local
edit — then still differs from the baseline and flushes as a normal local diff:

- the swallowed-local-edit race disappears (the edit's uuids weren't touched by the
  apply, so their baseline entries are still pre-edit);
- receiver-side cleanup is broadcast and both sides converge on it. Re-application on
  the original sender is idempotent, so the echo is bounded (one extra hop, then empty
  diffs).

This composes with the blob-hash baseline proposed in
[04-bug-lossy-change-detection.md](04-bug-lossy-change-detection.md): with a
uuid→hash baseline, "targeted" is just updating the hashes for the applied uuids.

## Verification

Deterministic interleave test via the existing test hooks: queue an apply
(`kicadCollabApplyItems`) and a local `kicadCollabTestMoveFirst` such that the commit
lands between apply-enqueue and apply-run; assert the local move still reaches the
peer. For the cleanup half: two tabs, tab B draws a wire crossing where tab A is about
to move a wire; after A's move syncs, assert both tabs converge on the same segment
set (currently B's split stays local).

Repro (2026-07-03): implemented exactly as the first half above in
`tests/kicad/ysync-repros-pcbnew.spec.ts` ("a local edit committed while a remote
apply is queued…", `test.fail`): one JS turn queues `TestMoveFirst` then
`ApplyItems(added footprint)` → FIFO drain [move, apply, flush] → runtime-confirmed
that both land and the moved uuid is never emitted. The receiver-side-cleanup half
remains un-reproduced (needs the two-tab wire-crossing setup). See
[16](16-repro-suite-results-and-empirical-findings.md).
