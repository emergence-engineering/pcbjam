# Init prompt — eeschema essential ops (place symbol / power / text / rect / circle)

Paste the block below into a fresh session.

---

We're on branch `feature/yjs-bridge` (kicad-wasm, 3 repos: root + `kicad` + `wxwidgets`
submodules). The Yjs collaborative-editing bridge for eeschema mostly works, and several core
eeschema-in-wasm UI bugs were fixed. **This session's goal: make the five operations that
define an "it works" eeschema actually work — both natively in the editor AND synced over
collab:**

1. **Place symbol** (SCH_SYMBOL)
2. **Place power symbol** (SCH_SYMBOL with a power lib symbol)
3. **Draw text** (SCH_TEXT)
4. **Draw rectangle** (SCH_SHAPE)
5. **Draw circle** (SCH_SHAPE)

Collab can't be called "working" while adding shapes/symbols doesn't sync, and the editor
can't be called "working" while you can't place a symbol or finish a text dialog.

**First read these memory entries** (MEMORY.md): `yjs_bridge_feature`,
`eeschema_collab_asyncify_apply`, `wasm_eeschema_ui_modal_hotkey_fixes`,
`feedback_build_reuse_schematic_cache`, `wasm_embind_relink_gotcha`, `web_wizard_skip_config_seed`.
Also `features/yjs-bridge/0006-eeschema-apply-findings.md`.

## Current state (what works / what doesn't)

**Native editor (wasm):**
- ✅ Backspace deletes, Delete deletes (hotkey fix). Esc cancels the active tool (focus fix) —
  but Esc also exits *browser* fullscreen (unpreventable browser behavior; use a maximized
  window, not fullscreen).
- ✅ Quasi-modal dialogs no longer freeze the app (nested event loops now pump via Asyncify in
  `wxwidgets/src/wasm/evtloop.cpp`; the text-properties dialog opens + closes).
- ◐ **Drawing rectangles/circles works natively** (user-confirmed) — but see collab below.
- ✗ **Dialogs open in the wrong position / are mis-sized so the OK button is clipped or
  unclickable** (the text-properties dialog, and almost certainly the **symbol chooser** and
  **power-symbol chooser**). This blocks native place-symbol / place-power / finishing draw-text.
  Symptom: `winuniv.cpp(925) SetScrollbar: page size can't be greater than range` asserts; the
  dialog content overflows its frame. This is the **#1 blocker for the native ops.**

**Collab apply (peer side):**
- ✅ Wire add/move, delete (any type), SCH_TEXT add, SCH_LABEL add, and **move** of
  symbols/junctions/labels incl. their text fields (devirtualized `Move` + `moveFields`).
- ✗ **SCH_SHAPE add (rect/circle) does NOT sync** — reconstructing+committing a new shape traps
  in **KiCad core** `SCH_COMMIT::Push` → `view->Add` of a new shape (`invoke_viii` →
  "memory access out of bounds").
- ✗ **SCH_SYMBOL add does NOT sync** — the s-expr clipboard-blob reconstruction traps in the
  parser `LoadContent` (`invoke_iii` → "table index is out of bounds").

## Root causes (read these — they drive the approach)

1. **Asyncify `call_indirect` mis-dispatch from the apply context.** Editor mutation code invoked
   from our `CallAfter`/apply path (NOT inside a tool coroutine) mis-dispatches virtual calls
   (`invoke_*`) — silently no-ops or traps. We fixed it for **our own** calls by *devirtualizing*
   (explicit class-qualified calls → plain `call`, not `call_indirect`) — see
   `moveItemTo`/`moveFields` in `wasm/bindings/eeschema_embind.cpp`. But shape-add and symbol-add
   trap **inside KiCad core** (`view->Add`→`ViewGetLayers`; the s-expr parser), which the bridge
   can't devirtualize.
   - **Fix direction (the headline task): route the apply through a tool coroutine.** Native edits
     don't trap because the TOOL_MANAGER runs tool actions as coroutines (the Asyncify root /
     `emscripten_fiber_swap` context). Make `doApply` run there — e.g. register a custom
     `TOOL_ACTION` whose handler does the SCH_COMMIT and `m_toolManager->RunAction(...)` it
     (instead of `frame->CallAfter([]{ doApply… })`). This is **untested** but should fix BOTH
     shape-add and symbol-add at once, and likely lets the devirtualization hacks be removed.
     The dyncall shim (`scripts/common/shims/dyncall-binding.js.tmpl`) only catches the
     "signature mismatch" variant — it can't catch these "out of bounds" traps (they fire inside
     the wrong function), so a JS-shim fix is not viable here.

2. **Wasm dialog layout/positioning.** `DIALOG_SHIM::finishDialogSettings` calls `Fit()` +
   `Centre()`, but in the wasm port the dialog ends up mis-sized/positioned (OK clipped). Likely
   in `wxwidgets/src/wasm/toplevel.cpp` (window position/size, `Centre`, client-area origin —
   note `GetScreenPositionOfClientOrigin` "no window" asserts) and/or the wasm dialog/sizer Fit.
   Fixing this is high-leverage: it unblocks the symbol chooser, power chooser, and text dialog
   all at once.

## Suggested plan

- **Thrust A — wasm dialogs usable (unblocks native place-symbol / place-power / draw-text).**
  Reproduce the text-properties dialog and the symbol chooser in the real app; fix the
  size/position so OK is reachable. Start in `wxwidgets/src/wasm/toplevel.cpp` +
  `dialog.cpp`/`evtloop.cpp`; check how the dialog's size/position is computed vs the viewport.
- **Thrust B — collab apply via a tool coroutine (unblocks shape/symbol ADD sync).** Re-enable
  the SCH_SHAPE hand converter (itemToJson already emits shape geometry: `stype`/`sx`/`sy`/
  `ex`/`ey`/`cx`/`cy`/`width`/`fill`; NOTE `FILL_T::NO_FILL == 1`, not 0) and the SCH_SYMBOL
  s-expr-blob converter, but run `doApply` inside a coroutine so `view->Add` and the parser stop
  trapping. Verify a circle/rect/symbol added in tab A appears in tab B.

Do them in either order; A is more self-contained, B is the bigger unknown.

## Architecture / key files

- **Collab bridge (root repo, zero kicad-fork change):** `wasm/bindings/eeschema_embind.cpp` —
  `doApply` (deferred via `frame->CallAfter`), `makeItem` (per-type construct; SCH_SHAPE add is
  currently DEFERRED/logged, SCH_SYMBOL add too), `moveItemTo`/`moveFields` (devirtualized move),
  `itemToJson`/`snapshotItems`/`COLLAB_LISTENER` (emit), `kicadCollabApply/Snapshot/GetPos/
  TestMoveFirst`.
- **JS reconciler/transport (unchanged, generic):** `web/apps/frontend/src/wasm/collab/`. Collab
  gated by `?collab=1` in `WasmTool.tsx`; channel = `kicad-collab:<slug>:<path>`.
- **Native tools:** `kicad/eeschema/tools/sch_drawing_tools.cpp` (createNewText → DIALOG_TEXT_
  PROPERTIES::ShowQuasiModal; drawShapes → `new SCH_SHAPE(type, LAYER_NOTES, 0, fill)`;
  placeSymbol). Symbol chooser dialog: `kicad/eeschema/dialogs/dialog_symbol_chooser*`.
- **Wasm dialog/event infra:** `wxwidgets/src/wasm/dialog.cpp` (ShowModal via Asyncify
  `startModal`), `evtloop.cpp` (nested-loop Asyncify pump for ShowQuasiModal), `toplevel.cpp`
  (TLW position/size/Centre/fullscreen), `app.cpp` (key + mouse routing, toolbar-focus fix),
  `window.cpp` (ClientToScreen). `kicad/common/dialog_shim.cpp` (ShowQuasiModal, finishDialogSettings).

## Build / test / verify

- **Build (reuse the warm wxWidgets cache — a fresh per-branch container OOMs at exit 137):**
  `COMPOSE_PROJECT_NAME=kicad-wasm-feature-schematic KICAD_NO_MONITOR=1 ./docker/build.sh eeschema`
  (~8 min embind-only; ~12–15 min if you touch `kicad`/`wxwidgets` since it recompiles those
  incrementally + relinks. Auto-relinks embind-only changes. Don't pipe output; it logs to
  `logs/build/`. The host-side asyncify + `wasm-opt -O2` pass runs AFTER the docker "build
  complete!" line — wait for the final ~104 MB `output/eeschema.wasm`, not the ~189 MB
  pre-opt one.) Then `cd tests && npm run setup:kicad`.
- **Headless e2e:** `cd tests && npx playwright test --config=playwright-kicad.config.ts
  --project=firefox kicad/eeschema-ui.spec.ts kicad/eeschema-collab.spec.ts`. NOTE: the apply
  path DOES work headless (mutates the model) but the GL canvas can't paint headless (incomplete
  window → "no window" assert), so dialog/visual checks need the real app. `kicadCollabSnapshot`
  only exposes top-level items (not child field positions) — verify field/visual behavior with a
  real-app screenshot (force a redraw first, e.g. resize the window — Playwright WebGL captures
  go stale otherwise).
- **Real app:** `cd web && pnpm dev` (frontend :3048, server :3050; `pnpm db:up && pnpm
  db:migrate` once). Demo project `demo` has `demo.kicad_sch` (the ECC83 push-pull, 26 symbols).
  Two tabs: `http://localhost:3048/p/demo/eeschema/demo.kicad_sch?collab=1`. Devtools console
  shows `[collab]` logs. (Tab navigation may pop a `beforeunload` dialog — clear with
  `window.onbeforeunload = null` first.) `Module.kicadCollabApply(json)` /
  `kicadCollabSnapshot()` / `kicadCollabGetPos(uuid)` are callable from the console for probing.
- **Fast-debug:** patch the built `tests/apps/kicad/eeschema.js` with `console.log` and run a
  spec WITHOUT a rebuild; `tests/logs/kicad/<spec>/*.log` captures the console. Granular
  `EM_ASM({ console.log(...) })` markers in the C++ to bisect a hang/trap.

## Recent commits (this branch)

root: `a00cbd9` (move carries symbol/label fields), `9fa475f` (symbol move devirtualize +
wxwidgets bump), `9b90be0` (quasi-modal no-freeze + Backspace delete), `8b26c64` (SCH_SHAPE emit
+ defer shape/symbol add). kicad: `4132395` (Backspace hotkey). wxwidgets: `ea599f7` (toolbar
focus), `c27fe8b` (quasi-modal Asyncify pump). Use `/git-feature-commit` to commit across the 3
repos. NOTE: `a00cbd9` is **unsigned** (gpg passphrase wasn't cached) — `git commit --amend -S`
it once gpg is unlocked if signed history matters.
