# Bug 01 — First-ever tab never registers the C++ change listener; the seeding session can't send

**Severity:** critical (breaks the primary first-session flow for all three tools)
**Status:** open
**Fix size:** one line

## Where

- `web/standalone/src/wasm/collab/kicad-binding.ts:144-154` — the file-seed branch of `seed()`
- `wasm/bindings/eeschema_embind.cpp:578-594` (`ensureBridge`), called only from
  `schCollabSnapshot` (`:909`) and `schCollabSnapshotItems` (`:957`)
- `wasm/bindings/pcbnew_embind.cpp:729-745` (`ensureBridge`), called only from
  `pcbCollabSnapshot` (`:975`) and `pcbCollabSnapshotItems` (`:998`)

## What happens

The C++ `COLLAB_LISTENER` — the only thing that turns local commits into emits — is
registered lazily inside `ensureBridge()`, which is reached **only** through the two
snapshot entry points. On the JS side, `seed()` has three branches:

- `editorMatchesDoc` branch → calls `bridge.snapshotItems()` explicitly "to BASELINE
  the wasm differ" → listener registered ✓
- adopt / editor-snapshot-seed branches → call `bridge.snapshotItems()` to read the
  model → listener registered ✓
- **file-seed branch** (`!ydocHasState(doc) && seedDoc`) → `docToY(seedDoc, …)` and
  `return` — `snapshotItems()` is never called ✗

So in any **fresh room** (first-ever open of a project, both api and ydoc mode, all
three collab tools), the seeding tab has no C++ listener:

1. Local edits never fire `scheduleFlush` → nothing is ever emitted → the seeder
   *receives* peers' edits but *never sends* its own.
2. eeschema is worse: `OnSchSheetChanged` → `emitSheetChanged` lives on the same
   listener, so sheet navigation never notifies JS, `SheetCollabManager.switchTo` is
   never driven, and the C++ diff baseline is never re-scoped on navigation.

On the *next* session the room has state, seed() takes the adopt branch, the listener
registers, and everything works — which is exactly why this is easy to miss manually.

## Why tests don't catch it

- The two-tab e2e specs (`tests/kicad/{eeschema,pcbnew,pl_editor}-collab.spec.ts`)
  drive the **legacy** scalar path via `tests/collab/browser-entry.ts` (`startCollab`),
  whose `seed()` always calls `bridge.snapshot()` → `ensureBridge()`.
- The vitest binding tests (`kicad-binding.test.ts`) use a fake JS bridge; the fake has
  no "listener registration happens inside snapshotItems" side effect, so the file-seed
  branch looks fine there.

See [11-miss-no-v2-e2e-coverage.md](11-miss-no-v2-e2e-coverage.md).

## Observable symptoms

- First session after project creation: tab A's edits don't reach tab B, while B's
  edits reach A (asymmetric sync).
- eeschema fresh project: navigating into a subsheet doesn't rebind rooms; edits on
  child sheets aren't scoped/synced.
- Drift telemetry: the seeder's session ends with a `beforeunload` drift beacon
  containing every edit of the session (the Y.Doc never received any of them).

## Fix

In the file-seed branch of `seed()` (kicad-binding.ts:144-154), after `docToY(...)`,
call `bridge.snapshotItems()` and discard the result — exactly the pattern the
`editorMatchesDoc` branch already uses:

```ts
if (!ydocHasState(doc) && seedDoc) {
  docToY(seedDoc, doc, ORIGIN);
  try {
    bridge.snapshotItems(); // register the C++ listener + baseline the differ
  } catch (err) {
    cwarn("seed: post-file-seed baseline failed", err);
  }
  return;
}
```

The returned snapshot is redundant (the Y.Doc was just seeded losslessly from the
file), but the call's side effects — `ensureBridge()` listener registration and
`rebaseline()` — are the whole point.

Note: even without the baseline part, the TS layer would absorb a stale-empty baseline
(a full-model re-emit diffs to an empty `KicadDelta` against the already-seeded Y
items), so the *listener registration* is the load-bearing half of the fix.

## Verification

Two-tab e2e on the v2 wire with a genuinely fresh room id: tab A opens (file-seeds),
makes an edit, tab B must receive it. For eeschema, additionally navigate into a
subsheet on tab A and assert `[sheet]` switch logs / per-room scoping.

Repro tests (2026-07-03, expected-fail until fixed — see
[16](16-repro-suite-results-and-empirical-findings.md)): units in
`web/standalone/src/wasm/collab/ysync-repros.test.ts` (the snapshotItems contract +
peer-never-receives, with a C++-faithful fake that gates emit on `ensureBridge`);
e2e in `tests/kicad/ysync-two-tab.spec.ts` (pcbnew + eeschema fresh-room; Chromium
only — finding F2 — verified on Chrome: A's move lands, B never converges).
