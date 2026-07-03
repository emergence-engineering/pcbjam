# Repro suite results + empirical findings (2026-07-03)

**Status:** plan [15](15-plan-repro-tests-and-v2-e2e.md) executed in full — every bug
01–07 has a runnable reproduction test, and the v2 items wire has end-to-end coverage
(miss [11](11-miss-no-v2-e2e-coverage.md) closed). This doc records what the suite
looks like, what each repro's failure was verified to be, and four things the RUNNING
system revealed that code-reading (docs 01–07) did not predict.

## The suite

Convention: a repro asserts the CORRECT behavior and is marked expected-fail
(vitest `it.fails` / playwright `test.fail()`) with a comment naming the bug doc. The
suite stays green while a bug is open; fixing it flips the repro to "unexpected pass",
forcing the marker's removal — the repro becomes the regression test. Green companion
tests pin each repro's preconditions (boot, apply path, emit path, "the edit really
landed"), so an expected failure can only come from the bug itself. Every expected
failure below was verified (JSON-reporter pass) to fail at its DOCUMENTED assert.

| Bug | Unit repro | E2E repro | Verified failure site |
|-----|-----------|-----------|----------------------|
| [01](01-bug-first-tab-listener-never-registered.md) | `web/standalone/src/wasm/collab/ysync-repros.test.ts` (C++-faithful fake: emit gated on `snapshotItems`; snapshot-call contract + peer-never-receives; green B→A asymmetry control) | `tests/kicad/ysync-two-tab.spec.ts` pcbnew + eeschema fresh-room | Chrome: A's move lands (`80…→82…`), B never converges; the 8 s peer poll |
| [02](02-bug-footprint-blob-zeroes-pad-nets.md) | — (C++-only) | `tests/kicad/ysync-repros-pcbnew.spec.ts` "footprint blob preserves pad nets" | blob shows the pads present but WITHOUT `(net 1 "SIG")` — runtime-confirmed |
| [03](03-bug-child-removal-dangling-slot.md) | `web/pcbjam-shared/test/ysync-repros.test.ts` (`renderItem: missing item fld-1` through the dangling slot; `docToFile` same) | Y-half: `ysync-two-tab.spec.ts` (room stops materializing); receiving half + sending half: `ysync-repros-pcbnew.spec.ts` | recv: fp_text still present after `removed:[child]` apply; send: **no parent re-blob AND no wire at all** (finding F1) |
| [04](04-bug-lossy-change-detection.md) | — (C++-only) | `ysync-repros-pcbnew.spec.ts` (anchor-centred fp rotation, pad resize, gr_line endpoint drag) + `ysync-repros-eeschema.spec.ts` (symbol rotation, Value-field edit) | every case: the "edit landed" save-poll is green, the emit poll receives NOTHING |
| [05](05-bug-rebaseline-swallows-local-edits.md) | — (CallAfter ordering is C++-only) | `ysync-repros-pcbnew.spec.ts` same-JS-turn `TestMoveFirst` + `ApplyItems` | apply landed, move landed, moved uuid never emitted |
| [06](06-bug-concurrent-seed-duplicates-layout.md) | `web/pcbjam-shared/test/ysync-repros.test.ts` (two offline `docToY` + merge → `[{item:'fp-1'},{item:'fp-1'}]`; materialization ≠ single-seed; green CRDT-determinism baseline) | `ysync-two-tab.spec.ts` Promise.all start, equal settleMs (skip-if-race-missed guard; the race fired on every observed run) | merged render ≠ single-seed render |
| [07](07-bug-sheet-switch-stale-down-hook.md) | `web/standalone/src/wasm/collab/ysync-repros.test.ts` 07a (post-`destroy()` emit still writes the doc) + 07b (REAL sheet-manager + REAL yjs, held-open cold `connectKicadDoc`; gap emit lands in the old room) | — (unit covers the mechanism) | doc gains `seg-ghost` / old room gains `wire-b` |

v2 e2e coverage (miss 11) beyond the repros — all GREEN:

- **Harness baseline (pl_editor two-tab, fresh room):** A file-seeds, `TestAddText`
  edits flow A→B and B→A, and the drift-detect oracle is ITEM-silent on both tabs
  (finding F4). pl_editor is the green tool because its emit is the eager `OnModify`
  hook, not the lazily-registered listener — bug 01 does not gate it.
- **Adopt:** a joiner that cold-opened a divergent-uuid copy adopts the doc's
  identity through the real C++ apply (doc uuid present, divergent uuid gone).
- **Headless emit probes** (phase C): green on BOTH pcbnew and eeschema (finding F3).

Infrastructure: `tests/collab/browser-entry-v2.ts` → `apps/kicad/collab-bundle-v2.js`
(the production `connectKicadDoc` + `attachKicadCollab` stack; in-page
`renderActiveDoc` / `singleSeedRender` / `driftReport` helpers; `yjs` aliased to ONE
copy — the two web pnpm workspaces otherwise bundle two instanceof-incompatible
instances). Local-edit hooks added to the wasm layer:
`kicadCollabTest{RemoveItem,RotateItem}` (both tools, dispatched in the merged image),
`kicadCollabTest{SetPadSize,MoveEndpoint}` (pcbnew), `kicadCollabTestSetFieldText`
(eeschema) — all real commits via CallAfter + COROUTINE
(`wasm/bindings/{pcbnew,eeschema,kicad_editor}_embind.cpp`).

Final verified state (firefox, fresh `kicad_editor` build; 3 ysync files +
items-bridge, roundtrip, the three legacy collab specs, save-hook):
**39 passed / 0 failed / 0 flaky / 5 skipped** — skips = the two F2 firefox guards,
the two pre-existing legacy two-tab skips, one pre-existing roundtrip fixme.

## Empirical findings (what the running system added to the review)

### F1 — Bug 03's sending half is WORSE than documented: a child-only delete emits NOTHING

Doc 03 predicted (from reading `flushDiff`) that deleting a footprint child emits the
bare `{removed:[childUuid]}` wire. Empirically (headless, listener registered,
baseline seeded): a real `BOARD_COMMIT` remove of the fp_text child mutates the model
(the save loses the child) but **never triggers a flush at all** — no wire of any
shape goes out.

Evidence: the benign `PCB_VIA::GetWidth called without a layer argument` assert fires
once per `snapshotByUuid` pass (`itemToJson` reads the via's width), making it a free
tracer for baseline/flush activity. The working move-probe log shows it twice
(baseline + flush); the child-delete log shows it exactly once (baseline only) —
`flushDiff` never ran, so the listener never fired for this commit shape.

Implication for the fix: the emit-side repair is not just "lift removals to a parent
re-blob" — the listener has to SEE a child-only removal commit first. Whatever
`BOARD_COMMIT::Push` does with a child remove (roll-up to a parent modify, a
different notification path, or an early-out) needs a look before the lift can work.
The repro (`a child deletion goes out as the parent's re-blob`) asserts the correct
end state either way, so it covers both layers of the fix.

### F2 — Firefox cannot host two `kicad_editor` tabs in one context

The bug-01 two-tab repros boot the merged ~180 MB `kicad_editor` twice in one browser
context (BroadcastChannel requires same-context). On Firefox (ARM Mac, serial,
isolated run) the SECOND tab's `#canvas` never appears — the same per-content-process
SpiderMonkey wasm budget `tests/playwright-kicad.config.ts` documents for x86 CI,
reached at 2× on arm64. Chrome runs both tabs in ~17 s.

Consequence: those two tests carry
`test.skip(project === "firefox", …)` and run on `chromium-ci` in CI (already routed
via `BIG_MODULE_SPECS`) and `--project=chromium` locally. Anything future that needs
two simultaneous board/schematic editors (multi-tab collab e2e, presence tests) has
the same constraint. pl_editor two-tab is unaffected (small separate bundle).

### F3 — Headless emit WORKS on both pcbnew and eeschema; the legacy skip rationale is dead

The phase-C probes (register listener via `snapshotItems`, real `TestMoveFirst`
commit, capture `window.kicadCollab.onItems`) are GREEN headless on both tools. So:

- the `eeschema-collab.spec.ts` / `pcbnew-collab.spec.ts` two-tab `test.skip`
  rationale ("harness can't drive the emit") is now disproven for BOTH halves —
  apply was already known to work, and emit demonstrably works too. The legacy
  two-tab specs could be un-skipped today (or better, retired with the legacy wire —
  the follow-up miss 11 already names);
- `items-bridge.spec.ts`'s SCH/PCB `localEdit` omission ("emit unverifiable
  headless", `:47` and `:236`) is stale — both ToolCfgs can gain a `localEdit` and
  make the emit leg green there as well;
- every emit-dependent repro stays a LIVE `test.fail` — no fixme conversions were
  needed anywhere.

### F4 — The drift-detect oracle is strictly item-silent on the green path

After the pl_editor two-tab session (file-seed + live edits both ways), the replicated
`computeDrift` core reports ZERO item drift on both tabs — the file-seeded Y bodies
byte-match what the editor's writer serializes, at least for the pl fixture. This was
a real risk (a writer that normalizes formatting would make drift-detect
false-positive on every file-seeded room) and it did NOT materialize. The layout/meta
halves are NOT asserted — non-item state only syncs at seed
([08](08-miss-layout-state-never-syncs.md)) and preamble formatting is
writer-normalized, so those flags stay informational until 08 lands.

### Harness note

The shared `testLogger` fixture only captures the DEFAULT page's console; two-tab
tests create pages via `context.newPage()`, so their `hasAbort(testLogger)` guard is
vacuous (true of the pre-existing legacy two-tab specs as well). Worth folding into
the fixture if two-tab coverage grows.

## Follow-ups

- Fix-order input: F1 moves bug 03's emit-side fix partly into listener/commit
  territory — budget for that when scheduling the [00-overview](00-overview.md)
  attack order.
- Retire (or un-skip, briefly) the legacy two-tab specs per miss 11 + F3.
- Add `localEdit` to items-bridge SCH/PCB ToolCfgs (F3).
- When any bug is fixed: remove its expected-fail marker; the repro becomes the
  regression test.
