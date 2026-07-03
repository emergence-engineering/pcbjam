# Design miss 11 — The production v2 stack has no end-to-end test; the two-tab e2e exercises the legacy wire

**Severity:** process gap (root cause of why bug 01 shipped)
**Status:** CLOSED 2026-07-03 — the v2 port landed (see the status update at the
bottom and [16](16-repro-suite-results-and-empirical-findings.md)); only the legacy
retirement remains open

## Where

- `tests/collab/browser-entry.ts:8` — the collab e2e bundle exports the **legacy**
  `startCollab` (scalar reconciler, `kicadCollabSnapshot`/`Apply`/`onDelta`, Y key
  `"items"`)
- `tests/kicad/{eeschema,pcbnew,pl_editor}-collab.spec.ts` — the two-tab convergence
  specs all drive that bundle
- Production runs the **v2** items path: `bindKicadCollab` + `SheetCollabManager`
  (`web/standalone/src/wasm/collab/`), Y keys `kdoc_*`, C++
  `kicadCollabSnapshotItems`/`ApplyItems`/`onItems`
- v2 coverage today: vitest unit tests only (`kicad-binding.test.ts`,
  `sheet-manager.test.ts`) against a **fake** JS bridge

## Why this matters

The fake-bridge unit tests validate the TS state machine but structurally cannot see
C++-side integration behavior:

- listener registration living inside `snapshotItems()`
  ([01-bug-first-tab-listener-never-registered.md](01-bug-first-tab-listener-never-registered.md)
  — invisible to a fake by construction);
- blob content fidelity (pad net zeroing,
  [02](02-bug-footprint-blob-zeroes-pad-nets.md));
- which edits the C++ differ actually detects
  ([04](04-bug-lossy-change-detection.md));
- CallAfter/coroutine ordering races ([05](05-bug-rebaseline-swallows-local-edits.md),
  [07](07-bug-sheet-switch-stale-down-hook.md)).

Meanwhile the legacy path the e2e *does* cover is dead in production (nothing
registers `onDelta`; `WasmTool` binds `onItems` only).

## What to build

Port the two-tab convergence e2e to the v2 stack (the harness pattern already exists;
swap the bundle to export `startKicadCollab` / `attachKicadCollab`):

1. **Fresh-room seed test** (would have caught bug 01): tab A opens with a room id
   that has never existed, edits, tab B joins and must converge — **in that order**
   (A seeds via the file-seed branch, then sends).
2. **Adopt test**: tab B opens with a cold never-saved copy, must adopt A's identity
   (already covered in units; cheap to assert e2e).
3. **Edit matrix per tool** (grows with bug 04's fix): move, rotate symbol, edit value
   text, footprint move with netted pads (assert nets survive — bug 02), delete a
   footprint user field (bug 03), draw + delete items.
4. **eeschema sheet navigation**: two sheets, edits on both, navigate while the peer
   edits; assert per-room scoping and catch-up on revisit (sheet-manager +
   bug 07 regression).
5. Assert **drift-detect silence** at the end of every scenario — it's a free,
   high-signal convergence oracle (`computeDrift() === null` means editor ≡ doc).

Once these exist, retire the legacy bundle and specs together with the legacy wire
(they currently provide a false sense of coverage), or keep exactly one legacy spec
until the C++ `emit()`/scalar path is deleted.

## Note on cadence

Per project practice, run the new specs in all three engines (Firefox + Chromium +
WebKit) like the rest of the kicad e2e suite.

## Status update (2026-07-03)

Landed as `tests/kicad/ysync-two-tab.spec.ts` +
`tests/kicad/ysync-repros-{pcbnew,eeschema}.spec.ts` over the new
`apps/kicad/collab-bundle-v2.js` (`tests/collab/browser-entry-v2.ts`). Against the
build list above:

1. **Fresh-room seed test** — done (pcbnew + eeschema, `test.fail` on bug 01;
   Chromium-only per finding F2 in [16](16-repro-suite-results-and-empirical-findings.md)).
2. **Adopt test** — done, green (pl_editor divergent-uuid cold copy adopts the doc's
   identity through the real C++ apply).
3. **Edit matrix** — landed as the bug-02/03/04 expected-fail repros; turns green
   case-by-case as bug 04's fix lands. Zone-net still needs a hook.
4. **eeschema sheet navigation** — NOT ported (navigation isn't driven headless yet);
   the mechanism is covered by the bug-07b unit repro instead.
5. **Drift-detect silence** — done on the green pl scenarios, ITEM-level (strictly
   silent — finding F4); layout/meta flags stay informational until miss 08.

Still open from this doc: retiring the legacy bundle + specs. Finding F3 (headless
emit works on BOTH tools) removes the last excuse for the legacy two-tab skips.
