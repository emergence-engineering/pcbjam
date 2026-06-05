# eeschema essential ops — findings (2026-06-05)

Work on the five "it works" eeschema operations (place symbol / place power / draw text /
draw rectangle / draw circle), both natively and over collab. Ground truth gathered by
driving the **real web app** (`localhost:3048`, `?collab=1`, two tabs) with Playwright and
by the headless e2e specs. **All changes are root-repo only — the `kicad` and `wxwidgets`
submodules are untouched.**

## Result summary

| Op | Native editor | Collab sync |
|----|---------------|-------------|
| Draw text | ✅ works (dialog → OK → place) | ✅ (already worked) |
| Draw rectangle | ✅ works | ✅ **fixed this session** |
| Draw circle | ✅ works | ✅ **fixed this session** |
| Place symbol | ◐ dialog works, but **no libraries** (can't pick) | symbol-add deferred |
| Place power symbol | ◐ same — no libraries | symbol-add deferred |

3 of 5 fully work end-to-end. The 2 symbol ops are blocked by a **separate, newly-found**
issue (no symbol libraries bundled), not by dialogs or asyncify anymore.

## Thrust A — wasm dialogs (the #1 stated blocker): root cause was NOT what the prompt assumed

The prompt hypothesized a wxwidgets C++ dialog sizing/`finishDialogSettings` bug. **Live
reproduction proved that wrong.** The wx registry reported the text-properties dialog at the
correct centered position (`(470,308) 660×384` in a 1600×1000 screen), but a screenshot
showed it jammed in the **top-left with OK clipped**. The mismatch is in the DOM/CSS layer:

- `wx.js` (`createWindow`/`setWindowRect`) makes one `.window` `<div>` (+ `.window-canvas`)
  per top-level window and positions it via **inline `style.left/top`**, which require
  `position: absolute`.
- The standalone **test-harness HTML** (`tests/apps/kicad/eeschema.html`) ships
  `.window { position: absolute }`; the **React web shell** (`WasmTool.tsx` /
  `src/index.css`) never did → dialogs computed `position: static`, ignored their
  left/top, and stacked at (0,0). This is exactly why the e2e specs (harness HTML) never
  caught it.

**Fix:** added `.window` / `.window-canvas` rules to `web/apps/frontend/src/index.css`
(mirrored from the harness; layers are `pointer-events: none` — input routes through the
main `#canvas`). **Frontend-only, no wasm rebuild.** Verified live: text-properties dialog
**and** symbol chooser now center with OK reachable; full native draw-text works
(dialog→OK→place→`SCH_TEXT "HELLO"`).

### New blocker found: no symbol libraries
After the dialog fix, the Choose Symbol / power chooser opens correctly but shows
**"0 items loaded"** — the wizard-skip config seeds an **empty** `sym-lib-table` and there
are **no `.kicad_sym` standard libraries in the wasm MEMFS** (`/usr/share/kicad/symbols`
absent; the repo doesn't vendor kicad-symbols, only `kicad/demos/*` and a fixture
`kicad/qa/data/libraries/power.kicad_sym`). So place-symbol/power can't pick a symbol.
Bundling libraries (provisioning in `web/apps/frontend/src/wasm/boot.ts`) is the follow-up;
draw text/rect/circle don't need it.

## Thrust B — collab apply of SCH_SHAPE/SCH_SYMBOL add via a tool coroutine (the headline fix)

Confirmed the documented root cause: committing a *newly-constructed* SCH_SHAPE traps in
KiCad core (`SCH_COMMIT::Push` CHT_ADD → GAL `view->Add` → an asyncify `invoke_viii`
mis-dispatch, "memory access out of bounds") **only from the programmatic CallAfter/apply
context** — never from a native draw, because native draws run inside a **tool coroutine**
(a libcontext fiber stack). The dyncall shim can't catch it (it traps inside the wrong
function, not at the call boundary), and the bridge can't devirtualize core.

**Fix (`wasm/bindings/eeschema_embind.cpp`, root repo only):** run `doApply` **inside a
`COROUTINE` fiber stack**. `kicadCollabApply`'s `CallAfter` lambda now constructs a
`COROUTINE<int,int>` whose body is `doApply(...)` and calls `cor.Call(0)`. `CallAfter` runs
on the app main stack (`ProcessPendingEvents`), which is exactly where `COROUTINE::Call`
must be invoked from. On the fiber stack the GAL add-path virtuals dispatch correctly, like
a native draw. Re-enabled the **SCH_SHAPE** hand converter in `makeItem` (reconstructs from
the geometry `itemToJson` already emits; NB `FILL_T::NO_FILL == 1`). Kept the
devirtualization hacks (`moveItemTo`/`moveFields`) — harmless and proven.

**Build gotcha:** `tool/coroutine.h` does `#include <libcontext.h>`, which the embind
compile's include path lacked → added `-I${KICAD_DIR}/thirdparty/libcontext` to
`scripts/kicad/build-kicad-target.sh`.

**Verified:**
- **Real app, two tabs:** a **rectangle** (stype 1) AND a **circle** (stype 3) drawn in
  tab A sync to tab B with identical uuid + geometry and render (blue LAYER_NOTES shapes),
  no crash, 0 console errors.
- **Headless e2e:** extended `tests/kicad/eeschema-collab.spec.ts` apply test with a
  SCH_SHAPE rectangle add — passes, no abort. Full eeschema-collab + eeschema-ui suites
  green (5 passed, 1 two-tab skipped as designed).

### SCH_SYMBOL add — still deferred, but now unblocked
The coroutine fixes the *context*; symbol-add additionally needs the **emit side** to
produce the s-expr clipboard blob (`SCH_IO_KICAD_SEXPR::Format` →
`LoadContent` reconstruct — the path `sch_editor_control.cpp` doCopy/paste uses). It's moot
until symbol libraries are bundled (you can't place a symbol natively to sync). Symbol
**move/position** already syncs via the generic `changed` path.

## Files touched (all root repo)

- `web/apps/frontend/src/index.css` — `.window` / `.window-canvas` CSS (Thrust A).
- `wasm/bindings/eeschema_embind.cpp` — COROUTINE-wrapped `doApply`; re-enabled SCH_SHAPE
  converter; include `<tool/coroutine.h>`.
- `scripts/kicad/build-kicad-target.sh` — added `thirdparty/libcontext` to the embind
  include path.
- `tests/kicad/eeschema-collab.spec.ts` — added a SCH_SHAPE rectangle apply case.

## Suggested next steps

1. **Bundle symbol libraries** (`power.kicad_sym` at minimum) into the wasm FS +
   `sym-lib-table` so place-symbol/power work — the last gap for the 5 ops.
2. **SCH_SYMBOL collab-add**: add the s-expr blob to `itemToJson` and a `LoadContent`
   reconstruct in `makeItem` (now that the coroutine context is in place). Do after (1).
