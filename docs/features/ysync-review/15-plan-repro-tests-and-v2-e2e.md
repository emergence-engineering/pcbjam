# Reproduction tests for ysync bugs 01–07 + v2 e2e coverage (miss 11)

## Context

The 2026-07-02 Yjs⇄KiCad sync review (docs: `../kicad-wasm-ysync-review/docs/features/ysync-review/`)
found 7 bugs, and found that the two-tab e2e exercises only the DEAD legacy scalar wire
(`tests/collab/browser-entry.ts` → `startCollab`), while production runs the v2 items wire
(`bindKicadCollab` / `startKicadCollab` + `kicadCollabSnapshotItems`/`ApplyItems`/`onItems`).
That coverage gap is why bug 01 shipped.

This task: (a) a reproduction test for every bug 01–07, (b) port the two-tab e2e to the v2
stack (miss 11). **Out of scope:** optimizations 12–14, misses 08–10, fixing the bugs
themselves, retiring the legacy specs.

**Convention:** every repro test asserts the CORRECT behavior and is marked expected-fail
(vitest `it.fails`, playwright `test.fail()`) with a comment naming the bug doc. The suite
stays green; fixing a bug flips the test to "unexpected pass", forcing the marker's removal
— the repro becomes the regression test. Expected-fail e2e polls use short timeouts (6–8 s)
so they don't burn the clock.

Key facts verification established (why this design works):
- `kicadCollabTestMoveFirst` AND `kicadCollabApplyItems` are both CallAfter-deferred
  (pcbnew_embind.cpp:1098, :960), and `scheduleFlush` queues behind them (:686) → the bug-05
  swallow is deterministically reproducible from one JS turn: queue move, then apply → drain
  order is [move, apply, flush] → apply's global rebaseline swallows the move → flush empty.
- pl_editor's emit is an eager `OnModify` hook (pl_editor_embind.cpp:72), NOT the lazy
  `ensureBridge` listener → bug 01 does NOT manifest there; its e2e repro must run on
  eeschema/pcbnew. pl_editor is the green-baseline tool for the v2 two-tab harness (its
  local-edit emit is already proven headless in `items-bridge.spec.ts` PL `localEdit`).
- Both legacy two-tab `test.skip`s cite a rationale the code itself documents as stale
  (eeschema-collab.spec.ts:111-113 note: "predated the dyncall-shim fix — apply now works").
  Whether ee/pcb local-edit **emit** works headless is unverified → Phase C probe decides
  live-vs-fixme for the emit-dependent repros.

## Per-bug repro matrix

| Bug | Unit (vitest, no wasm) | E2E (playwright, real C++) |
|-----|------------------------|----------------------------|
| 01 listener never registered | binding + C++-faithful fake (emit gated on snapshotItems) — file-seed then local edit must reach peer | two-tab v2 fresh-room on eeschema+pcbnew: A file-seeds → A edits → B must receive |
| 02 blob zeroes pad nets | — (C++-only) | single-tab pcbnew: `snapshotItems()` footprint blob must contain `(net 1 "SIG")` on pads |
| 03 dangling child slot | `applyDeltaToY({removed:[child]})`, parent survives → `renderItem(parent)`/`docToFile` must work, parent body slot pruned | (a) receiving half: `ApplyItems({removed:[childUuid]})` → saved board must lose the fp_text (today: kept); (b) Y half: feed the same wire into the real binding via `window.kicadCollab.onItems` in the two-tab spec → `docToFile(yToDoc)` must not throw; (c) sending half (needs new hook): remove child → emitted wire must carry parent re-blob, not bare removal |
| 04 lossy change detection | — (C++-only) | single-tab emit matrix w/ control (needs new hooks): control move (detected) proves harness, then rotate / field-text / pad-size / endpoint-drag each must emit its uuid |
| 05 rebaseline swallows edits | — (CallAfter ordering is C++-only) | single-tab pcbnew: same-JS-turn `TestMoveFirst` then `ApplyItems`(unrelated item) → moved uuid must appear in captured `onItems` wire |
| 06 concurrent seed duplicates layout | two Y.Docs, `docToY` independently, exchange updates → `docToFile(yToDoc(a))` must equal single-seed output | two-tab v2: both tabs start simultaneously on a fresh room (equal settleMs) → materialized doc clean |
| 07 stale DOWN hook | (a) `destroy()` then fire the captured `onItems` cb → doc must be unchanged; (b) sheet-manager gap: real binding + real Y.Docs, delayed `connectKicadDoc` mock, fire `win.kicadCollab.onItems` in the gap → old sheet's doc unchanged | — (unit covers the mechanism; e2e navigation can't be driven headless today) |

## Files

### Phase A — vitest unit repros (no wasm, run immediately)

1. **`web/pcbjam-shared/test/ysync-repros.test.ts`** (new) — bugs 03, 06 against
   `src/kicad-y.ts` / `src/kicad-doc.ts`. Reuse the `sexprToItems`/`fileToDoc` fixture style
   from `test/kicad-y.test.ts`. Bug 06 uses a footprint+preamble `KicadDoc`; assert both
   `docToFile` equality and single `{item}` slot per root uuid.
2. **`web/standalone/src/wasm/collab/ysync-repros.test.ts`** (new) — bugs 01, 07.
   - Bug 01: a C++-faithful `FakeEditor` variant (copy the shape from `kicad-binding.test.ts`,
     add `snapshotCalls` counter + `emit` gated on `snapshotCalls > 0`, mirroring
     `ensureBridge`). `bindA.seed(fileToDoc(file))` on an empty relayed pair → `edA.localUpsert`
     → `it.fails(expect edB.store to have received it)`. Plus a direct
     `expect(edA.snapshotCalls).toBeGreaterThan(0)` assertion (the one-line fix's contract).
   - Bug 07a: `bindKicadCollab(doc, fake)`; `binding.destroy()`; fire the fake's captured
     onItems cb with an `added` wire → `it.fails(expect items map empty)`.
   - Bug 07b: `vi.mock("./index")` only (real `kicad-binding`, real yjs — note the standalone
     vitest config's `dedupe: ["yjs"]`); manager `switchTo(a)` → `switchTo(b)` with a
     deferred `connectKicadDoc` promise; during the gap fire `win.kicadCollab.onItems` with an
     edit wire; `it.fails(expect sheet-a doc unchanged)`.

### Phase B — v2 e2e harness + specs runnable on the CURRENT wasm build

3. **`tests/collab/browser-entry-v2.ts`** (new) — bundles the v2 runtime:
   `startKicadCollab` (from `web/standalone/src/wasm/collab/index`), wrapped as
   `window.KicadCollabV2.start(mod, win, { room, settleMs, seedText? })` (BroadcastChannel
   provider, `seedDoc: seedText ? fileToDoc(seedText) : undefined`, handle stored on
   `window.__collabV2` for in-page Y assertions). Also export helpers for in-page asserts:
   `fileToDoc`, `docToFile`, `yToDoc`, `docDelta`, `isEmptyKicadDelta`, and a pure
   `driftReport(saveFnName, path)` that replicates `computeDrift`'s core from
   `drift-detect.ts:94-118` using only `@pcbjam/shared` exports (don't import `drift-detect`
   itself — it pulls `@/lib/api`).
4. **`tests/collab/build.mjs`** (edit) — second esbuild entry → `apps/kicad/collab-bundle-v2.js`.
   `@pcbjam/shared` resolves to `web/pcbjam-shared/src/index.ts` (exports map). Its runtime
   deps (`zod`, `@ts-rest/core`, `yjs`) must resolve in CI where `web/node_modules` is absent
   (the reason legacy added `yjs` to tests devDeps) → add `zod` + `@ts-rest/core` to
   `tests/package.json` devDependencies; keep `nodePaths: [tests/node_modules]`.
5. **`tests/kicad/ysync-two-tab.spec.ts`** (new) — the miss-11 port, harness pattern copied
   from the legacy two-tab blocks (boot via the existing `bootAndOpen` shapes, `addScriptTag`
   the v2 bundle, per-worker room ids):
   - **pl_editor, green (harness validation):** fresh room, A seeds (file-seed via `seedText`),
     `kicadCollabTestAddText` on A → B receives (poll B's save output); B-side adopt; end with
     `driftReport === null` on both tabs.
   - **pcbnew + eeschema fresh-room (bug 01 repro, `test.fail`):** same flow with
     `TestMoveFirst` as A's edit → B must receive. Gated on the Phase C probe (fixme if the
     harness can't drive emits at all).
   - **concurrent seed (bug 06 repro, `test.fail`):** both tabs `KicadCollabV2.start` via
     `Promise.all` on a fresh room, equal settleMs → assert in-page
     `docToFile(yToDoc(doc))` equals the single-seed rendering (compute reference by seeding a
     third, fresh Y.Doc locally in-page from the same `seedText`).
   - **bug 03 Y-half (`test.fail`):** in the pl_editor or pcbnew session, manually invoke
     `window.kicadCollab.onItems('{"removed":["<childUuid>"]}')` (simulating the C++ emit the
     bug doc proves is sent) → assert `docToFile(yToDoc(doc))` still succeeds and the parent
     body carries no dangling slot.
6. **`tests/kicad/ysync-repros-pcbnew.spec.ts`** (new) — single-tab, items-bridge.spec.ts
   driving style (no JS bundle needed except where noted):
   - **bug 02 (`test.fail`):** fixture = current SAMPLE_PCB + `(net 1 "SIG")` + 2 pads on the
     footprint carrying `(net 1 "SIG")`; `snapshotItems()` → footprint blob must contain
     `(net 1 "SIG")`.
   - **bug 03 receiving half (`test.fail`):** `ApplyItems({removed:[FP1_TXT]})` → poll save →
     fp_text must be gone (today the parent-footprint guard keeps it).
   - **bug 05 (`test.fail`, gated on probe):** register onItems capture (+ `snapshotItems()`
     first, to register the listener + baseline), same-JS-turn `TestMoveFirst(…)` then
     `ApplyItems(<unrelated segment change>)` → moved uuid must appear in a captured wire
     within the poll window. Control variant in the same file: `TestMoveFirst` alone → emit
     arrives (proves the harness; this is also the pcbnew emit probe made permanent).
7. **`tests/playwright-kicad.config.ts`** (edit) — add the three new spec filenames to
   `BIG_MODULE_SPECS` (lines 87-108) so CI runs them on chromium-ci only.
8. **`tests/README.md`** (edit, short) — document the v2 bundle, the repro-marker convention,
   and the bug-doc cross-references.

### Phase C — headless-emit probe (decision gate, ~10 min)

Run the bug-05 control from item 6 (pcbnew) and an eeschema `TestMoveFirst`+onItems capture:
- **Emit works** → keep bug-01/04/05 e2e repros as live `test.fail`; leave the legacy two-tab
  skips as they are (removing them is follow-up material, noted in README).
- **Emit genuinely dead headless** → convert the emit-dependent repros to `test.fixme` with
  the probe result in the comment; the unit repros remain the executable evidence for bug 01.

### Phase D — new C++ test hooks (wasm layer) + docker rebuild

9. **`wasm/bindings/pcbnew_embind.cpp`** (edit) — following the `pcbCollabTestMoveFirst`
   CallAfter+COROUTINE pattern (:1080-1109), add + register:
   - `kicadCollabTestRemoveItem(uuid)` — commit.Remove + Push (bug 03 sending half),
   - `kicadCollabTestRotateItem(uuid, deg)` — rotate about own anchor (bug 04),
   - `kicadCollabTestSetPadSize(uuid, w, h)` — pad property edit (bug 04),
   - `kicadCollabTestMoveEndpoint(uuid, dx, dy)` — move a segment/shape END point only (bug 04).
10. **`wasm/bindings/eeschema_embind.cpp`** (edit) — same pattern:
    - `kicadCollabTestRemoveItem(uuid)`,
    - `kicadCollabTestRotateItem(uuid)` — rotate a symbol in place (bug 04),
    - `kicadCollabTestSetFieldText(uuid, text)` — set a symbol field's text (bug 04).
11. **`tests/kicad/ysync-repros-pcbnew.spec.ts`** (extend) + **`ysync-repros-eeschema.spec.ts`**
    (new) — the bug-04 matrix, each test = control move (proves emit) + target edit
    (`test.fail` that its uuid is emitted): pcbnew rotate/pad-size/endpoint; eeschema
    rotate/field-text (eeschema fixture gains a real symbol: minimal `lib_symbols` Device:R +
    placed `(symbol …)` with field uuids). Bug 03 sending half: `TestRemoveItem(FP1_TXT)` →
    `test.fail(emitted wire carries the parent footprint re-blob, not a bare child removal)`.
12. Rebuild: `docker/build.sh` (full kicad build; hooks are embind-only). Then run Phase D specs.

## Sequencing

A (units, immediate) → B (harness + current-wasm specs) → C (probe, adjusts B/D markers) →
D (C++ hooks + rebuild + matrix specs). Each phase lands runnable on its own.

## Verification

- Units: `pnpm --filter @pcbjam/shared test` and `pnpm --filter <standalone> test` (from
  `web/`) — new files all green (`it.fails` semantics).
- Bundle: `cd tests && npm run build:collab` produces both bundles.
- E2E: from `tests/`: `npm run test:kicad` (firefox) and
  `npx playwright test --config=playwright-kicad.config.ts --project=chromium ysync-…` for the
  new specs; report FULL summaries (passed/failed/flaky/skipped + expected-failures) per
  project convention. Check `tests/logs/kicad/<test-name>` on anything unexpected.
- Existing suites must stay green: `items-bridge.spec.ts`, `roundtrip.spec.ts`, legacy collab
  specs, existing vitest files.
- No screenshot pass needed (no render-path changes — build/test-layer only).

## Follow-ups (out of scope, noted in README)

- Un-skip/retire the legacy two-tab specs once the v2 port is trusted (per miss 11).
- Update each bug doc's Verification section in the `ysync-review` worktree with its repro
  test path (docs live on the `ysync-review` branch, separate commit there).
