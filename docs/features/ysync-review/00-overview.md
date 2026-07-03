# Yjs ⇄ KiCad sync review — overview and index

Full-stack review (2026-07-02) of the collaborative-editing synchronization between the
Y.Doc and the internal state of eeschema / pcbnew. Scope read end to end:

- Shared Slot model: `web/pcbjam-shared/src/{kicad-doc,kicad-y,items-wire,kicad-delta,sexpr}.ts`
- Runtime binding: `web/standalone/src/wasm/collab/{kicad-binding,sheet-manager,provider,drift-detect,index}.ts`
- App wiring: `web/standalone/src/components/WasmTool.tsx`
- C++ bridges: `wasm/bindings/{eeschema,pcbnew}_embind.cpp`
- Tests: `web/standalone/src/wasm/collab/*.test.ts`, `tests/kicad/*-collab.spec.ts`,
  `tests/collab/browser-entry.ts`

## How the sync works (context for every finding)

The production path is the v2 "items" wire (ysync 0008). C++ keeps a per-uuid scalar
snapshot (`itemToJson`) as a diff baseline; a `BOARD_LISTENER` / `SCHEMATIC_LISTENER`
treats commits as "something changed" triggers, and a post-settle `flushDiff`
(CallAfter + COROUTINE) compares snapshots and emits each changed item as a full s-expr
blob. The TS side re-flattens each blob into uuid-keyed items with `parent` links
(`itemsWireToDelta`), diffs against the Y.Doc's `kdoc_items` map, and writes item-level
updates (`applyDeltaToY`). Remote Y events go the other way: `deltaFromYEvents` →
render the item's full subtree s-expr → `kicadCollabApplyItems`, which does an
idempotent remove-by-uuid + re-add through a real commit. Seeding is seed-once: the
first tab writes `fileToDoc(file)` into the empty room; joiners adopt the doc
wholesale. Drift detection periodically compares a scratch save against `yToDoc` and
reports (never repairs) divergence.

The overall shape — post-settle diff, idempotent full-item upserts, echo suppression by
origin tag plus C++ rebaseline — is sound and a good fit for the asyncify/wasm
constraints. The findings below are the places where it breaks or leaks.

## Verdict / suggested order of attack

Every bug below has a runnable expected-fail reproduction test, and the v2 e2e port
(miss 11) is DONE — see [16](16-repro-suite-results-and-empirical-findings.md) for
the suite map and four empirical findings the running system added (notably: bug 03's
sending half emits NOTHING, not the bare removal the doc predicted).

1. Fix [01](01-bug-first-tab-listener-never-registered.md) immediately (one line).
2. Then [02](02-bug-footprint-blob-zeroes-pad-nets.md) and
   [03](03-bug-child-removal-dangling-slot.md) (small, contained, data-corrupting).
3. Fold [04](04-bug-lossy-change-detection.md) and
   [05](05-bug-rebaseline-swallows-local-edits.md) into one change: blob-hash /
   dirty-set change detection plus targeted rebaseline. This also delivers most of
   [12](12-opt-hot-path-full-model-work.md).
4. [06](06-bug-concurrent-seed-duplicates-layout.md) and
   [07](07-bug-sheet-switch-stale-down-hook.md) are race windows — narrow them after
   the e2e port ([11](11-miss-no-v2-e2e-coverage.md)) gives regression cover.

## Index

### Bugs

| # | File | One-liner |
|---|------|-----------|
| 01 | [01-bug-first-tab-listener-never-registered.md](01-bug-first-tab-listener-never-registered.md) | Fresh-room seeding tab never registers the C++ change listener → its edits never sync |
| 02 | [02-bug-footprint-blob-zeroes-pad-nets.md](02-bug-footprint-blob-zeroes-pad-nets.md) | Footprint blobs strip pad net codes → net data loss propagates to peers, doc, and files |
| 03 | [03-bug-child-removal-dangling-slot.md](03-bug-child-removal-dangling-slot.md) | Child-only deletion leaves a dangling `{item}` slot in the parent's Y body → renders throw |
| 04 | [04-bug-lossy-change-detection.md](04-bug-lossy-change-detection.md) | Change detection is a lossy scalar projection → rotations, field text edits, pad edits never sync |
| 05 | [05-bug-rebaseline-swallows-local-edits.md](05-bug-rebaseline-swallows-local-edits.md) | Global rebaseline after apply can silently drop concurrent local edits and receiver-side cleanup |
| 06 | [06-bug-concurrent-seed-duplicates-layout.md](06-bug-concurrent-seed-duplicates-layout.md) | Two clients seeding an empty room concurrently duplicate `kdoc_layout` → corrupt materialization |
| 07 | [07-bug-sheet-switch-stale-down-hook.md](07-bug-sheet-switch-stale-down-hook.md) | Sheet switch leaves `onItems` pointing at the old room → cross-room contamination window |

### Design misses

| # | File | One-liner |
|---|------|-----------|
| 08 | [08-miss-layout-state-never-syncs.md](08-miss-layout-state-never-syncs.md) | Non-item state (title block, settings, `lib_symbols`) only syncs at seed |
| 09 | [09-miss-undo-not-collab-aware.md](09-miss-undo-not-collab-aware.md) | Ctrl+Z reverts remote work and re-broadcasts it; adopt commits are undo bombs |
| 10 | [10-miss-no-repair-path.md](10-miss-no-repair-path.md) | Drift is detected and reported but never repaired |
| 11 | [11-miss-no-v2-e2e-coverage.md](11-miss-no-v2-e2e-coverage.md) | Two-tab e2e exercises the legacy wire; the production v2 stack has no end-to-end test |

### Optimizations

| # | File | One-liner |
|---|------|-----------|
| 12 | [12-opt-hot-path-full-model-work.md](12-opt-hot-path-full-model-work.md) | O(full-model) work (incl. zod) on every edit/apply/remote batch |
| 13 | [13-opt-parked-dirty-full-sheet-replace.md](13-opt-parked-dirty-full-sheet-replace.md) | Parked-dirty sheet rebind re-applies the whole sheet instead of the delta |
| 14 | [14-opt-item-granularity-bandwidth.md](14-opt-item-granularity-bandwidth.md) | Item-level body granularity ships the whole item per nudge; LWW drops concurrent property edits |

### Plan & results

| # | File | One-liner |
|---|------|-----------|
| 15 | [15-plan-repro-tests-and-v2-e2e.md](15-plan-repro-tests-and-v2-e2e.md) | The approved plan: repro tests for bugs 01–07 + the v2 e2e port |
| 16 | [16-repro-suite-results-and-empirical-findings.md](16-repro-suite-results-and-empirical-findings.md) | Plan 15 executed (2026-07-03): suite map, verified failure sites, empirical findings F1–F4 |
