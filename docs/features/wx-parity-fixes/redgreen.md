# Parity fixes red-green ledger

Every fix was driven test-first: the test was run against the **unpatched** DOM
port to confirm it fails for the right reason (RED), then against the **patched**
port to confirm it passes (GREEN). "Right reason" = the captured `[REPRO] …: FAIL`
line or the observed stale DOM value, not an unrelated harness error.

## Standalone wxWidgets e2e — `tests/e2e/parity-audit.spec.ts`

Apps under `tests/apps/standalone/`. Run: `npx playwright test e2e/parity-audit.spec.ts`.

| # | Test / app | RED (unpatched) | GREEN (patched) |
|---|---|---|---|
| C-1 | `selevent-clientdata` — choice/listbox/combobox selection carries client data | `choice_clientdata: FAIL (GetClientObject()==null)` | `choice/listbox/combobox_clientdata: PASS (DATA_B)` |
| H-4 | `textctrl-clear` — `Remove(1,5)` then `Clear()` update the `<input>` | `<input>` still shows `"hello world"` (Playwright: `"h[ello] world"`) | `"h world"` then `""` |
| H-5 | `checklist-checks` — `Append`-then-`Check` evens (0,2,4) of 5 rows | DOM checkboxes = `[✗,✗,✗,✗,✗]` (all wiped) | `[✓,✗,✓,✗,✓]` |
| H-6 | `slider-scroll` — slider bound only to `wxEVT_SCROLL_*`, dragged to 70 | only `slider_command: 70` (no scroll family) | `slider_thumbtrack: 70`, `slider_changed: 70`, `slider_command: 70` |
| H-9 | `config-utf8` — write/read `"café-résumé-naïve-Žluťoučký-日本語-Ω"` + non-ASCII key | `config_value: FAIL (read back 'café-résumé-naïve-Žluťoučk')`; `config_keyname: FAIL` | `config_value: PASS`, `config_keyname: PASS` |
| #36 | `stattext-mnemonic` — label `"&Layer && Net"` | `<span>` shows `"&Layer && Net"` | `"Layer & Net"` |

Final run: **6 parity tests + 4 existing dom-port-bug tests green**; a widget
regression sweep (specialized/pickers/validators/clipboard/dataview/listctrl/
collapsible/wizard) = **49 green, 0 regressions**.

### Two harness corrections made during the first green run (not product-fix bugs)
- **selevent**: `choice` went green immediately; the `listbox` step then hit
  `stringToNewUTF8 is not a function` — a missing runtime export in the standalone
  build (added to `Makefile.wasm` `BASE_LDFLAGS`; production gets it via embind).
- **config**: the value round-trip passed; my *key-name* sub-assertion accidentally
  exercised a different, still-unfixed bug (#44, a missing path separator) rather
  than the truncation bug — rewritten to use an absolute key so it isolates H-9.

## KiCad e2e (product proof) — `tests/kicad/plot-checklist.spec.ts`

pcbnew's Plot dialog fills its layer list with the exact interleaved
`Append`-then-`Check` loop the H-5 bug breaks (`dialog_plot.cpp:351-354`); a
fresh board's default plot selection is
`LSET{F_SilkS,B_SilkS,F_Mask,B_Mask,F_Paste,B_Paste,Edge_Cuts}` (+Cu).

Built pcbnew at `-O1` twice:

| # | KiCad surface | RED (pcbnew vs unpatched wx) | GREEN (pcbnew vs patched wx) |
|---|---|---|---|
| **H-5** | pcbnew Plot dialog layer checklist | **`0 of 48` layers checked** | **`9 of 48` checked** |

Method: `git -C wxwidgets stash` (revert fixes) → `BINARYEN_OPT_LEVEL=-O1
docker/build.sh pcbnew` → `npm run setup:kicad` → run test (RED) → `git -C
wxwidgets stash pop` (restore fixes) → rebuild → run test (GREEN). The Plot dialog
does open in WASM pcbnew (the colour picker, notably, does not).

## KiCad e2e (product proof) — `tests/kicad/via-clientdata.spec.ts` (C-1)

A crafted board seeds two predefined via sizes via `(setup (user_via 0.9 0.45)
(user_via 1.1 0.55))` plus one via of size `0.7 / 0.35`. The test selects the via
(Ctrl+A on a board that contains only the via), opens the Track & Via Properties
dialog (E → `PCB_ACTIONS::properties`), and picks the predefined `0.9 / 0.45`
entry in the `m_predefinedViaSizesCtrl` wxChoice. That `change` fires
`wxChoice::OnDomEvent` → `onViaSelect`
(`dialog_track_via_properties.cpp:1674-1680`), which does, with **no null guard**:
`viaDimension = event.GetClientData(); m_viaDiameter.ChangeValue(
viaDimension->m_Diameter )`.

Built pcbnew at `-O1` twice (both measured end-to-end in WASM pcbnew):

| # | KiCad surface | RED (pcbnew vs unpatched wx) | GREEN (pcbnew vs patched wx) |
|---|---|---|---|
| **C-1** | Track & Via Properties → predefined via size → Via-diameter field | Via-diameter → **`0`** — *measured* | Via-diameter → **`0.9`** — *measured* |

- **GREEN — measured**: the diameter field transitions `0.7 → 0.9`
  (`[VIA] diameter field before: "0.7"` → `after: "0.9"`); test passes.
- **RED — measured** on a pcbnew build with `choice.cpp`'s
  `InitCommandEventWithItems` reverted: the diameter field transitions `0.7 → 0`
  (`[VIA] diameter field after: "0"`) and the test fails (`expected 0.9,
  received 0`). `onViaSelect` reads the choice event's `GetClientData()`, which is
  NULL without the fix, so `->m_Diameter` reads 0 (WASM null-deref-reads-zero).
  This matches the standalone `selevent-clientdata` RED above
  (`choice_clientdata: FAIL (GetClientObject()==null)`) on the same
  `wxChoice::OnDomEvent` path. (The spec also has an `Aborted(` guard for builds
  that trap instead of reading zero.)

Method: revert the `InitCommandEventWithItems` line in
`wxwidgets/src/wasm/choice.cpp` (the via-size control is a `wxChoice`) →
`BINARYEN_OPT_LEVEL=-O1 docker/build.sh pcbnew` → `npm run setup:kicad` → run the
spec (RED, diameter `0`) → restore the fix + rebuild → run (GREEN, diameter `0.9`).

> **Build caveat for a pruned worktree:** OpenCASCADE is a *mandatory* KiCad link
> dep (`CMakeLists.txt find_package(OCC)` is `FATAL_ERROR` if absent). A worktree
> whose `kicad-wasm-<branch>` docker volumes were pruned must re-provision the
> sysroot from scratch (`docker/build.sh pcbnew --build-deps`, ~30 min incl. OCC)
> — its OCC must be built with this fork's legacy `-fexceptions` model. Reusing
> another worktree's warm sysroot fails to link if its OCC used the newer
> `-fwasm-exceptions` model (`undefined symbol: __cpp_exception`).

## KiCad e2e (product proof) — `tests/kicad/modal-input-lock.spec.ts` (H-1)

Unlike C-1 and H-5 (already fixed among the six), **H-1 was unimplemented** — this
is the first time it was fixed. H-1: real modal dialogs (`wxDialog::ShowModal`)
never created a `wxWindowDisabler`, so the parent editor frame stayed input-live
behind the "modal". Fix (`wxwidgets/src/wasm/dialog.cpp`, `wxDialog::ShowModal`):
`m_windowDisabler = new wxWindowDisabler(this)` — the upstream-univ mechanism the
DOM port had dropped (teardown via the pre-existing `wxDELETE(m_windowDisabler)` in
`Show(false)`).

**Dialog choice is load-bearing.** The test drives pcbnew's **Page Settings**
dialog, shown via a *real* `wxDialog::ShowModal()` (`board_editor_control.cpp:534`;
`DIALOG_SHIM::ShowModal`, `dialog_shim.cpp:1386`, forwards straight to
`wxDialog::ShowModal` with no disabler of its own). The obvious candidates are the
**wrong** target: both **Plot** and **Track & Via Properties** are shown via
`ShowQuasiModal()` (`board_editor_control.cpp:565`, `edit_tool.cpp:2306`), which
runs KiCad's own nested loop and creates a `WINDOW_DISABLER(parent)`
(`dialog_shim.cpp:1431`) — so the parent is disabled *with or without* the wx fix.
(Measured: opening Plot on the *unpatched* binary already reported the frame
disabled — a false green — which is what flushed out this distinction.) So H-1's
real user impact in KiCad is limited to real-`ShowModal` dialogs.

**Signal:** the port re-emits a window's `enabled` flag into
`window.wxElementRegistry` on every `DoEnable()` (`window.cpp:1438`), so the pcbnew
main frame's registry entry flips `enabled: true → false` the instant the disabler
runs — and the *same* `wxWindow::IsEnabled()` parent-walk that flips it is what
every input gate consults (`app.cpp` mouse/keyboard/wheel, `domevents.cpp`
control/toolbar/menu-item). The test reads `registry.getElement(<PcbFrame id>).enabled`.

Built pcbnew at `-O1` once (RED = the pre-existing binary, which never had H-1;
GREEN = the post-fix build):

| # | KiCad surface | RED (pcbnew vs unpatched wx) | GREEN (pcbnew vs patched wx) |
|---|---|---|---|
| **H-1** | Page Settings modal open → main-frame `enabled` | **`true`** — frame stays live — *measured* | **`false`** — frame input-disabled — *measured* |

- **RED — measured**: `[H1] PcbFrame.enabled while the Page Settings modal is open: true`
  → `expect(false)` fails (`received true`); test fails.
- **GREEN — measured**: the same line reads `false`, the frame re-enables to `true`
  after the dialog closes (round-trip verifies the `wxDELETE(m_windowDisabler)`
  teardown), and no `Aborted(`; test passes (15.8s).

Method: measure RED against the current binary (no build needed — H-1 was never
built in) → add the `wxWindowDisabler` line → `BINARYEN_OPT_LEVEL=-O1
docker/build.sh pcbnew` → `npm run setup:kicad` → run the spec (GREEN).

**Residual (documented, not fixed):** the C++ disabler blocks all *consequential*
input (canvas tools, toolbar/menu-item commands, keyboard) but a menubar dropdown
still *visually* opens over the modal (its popup is built in pure JS,
`wx-dom.js:1127`, bypassing the C++ gate) though its items do nothing. Closing that
cosmetic leak would need a DOM-level backdrop/`inert` shield — deliberately out of
scope to stay close to upstream.

## KiCad e2e (product proof) — `tests/kicad/grid-clip-bleed.spec.ts` (H-2)

H-2: `wxWasmDCImpl::DoSetClippingRegion(x,y,w,h)` fed `m_clipX1..m_clipY2` to the
JS `clipRect`, but the modern `wxDCImpl` base stores the clip box only in the
*private* `m_devClipX1..` members — `m_clipX1..` stay ctor-zero — so JS always
received `clipRect(id, 0,0,0,0)`, which `wx.js` treats as "uninitialized" and
resets to a whole-context clip. Every rectangular DC clip (`wxDCClipper`,
`SetClippingRegion(wxRect)`) was a silent no-op; the `wxRegion` overload worked.
Fix (`wxwidgets/src/wasm/dc.cpp`): after the base call, read the accumulated box
back with `DoGetClippingRect()` and mirror it into `m_clipX1..m_clipY2` (the
`wx/dc.h:766` contract every other port fulfills itself); `DestroyClippingRegion`
now chains to the base (resetting the clip-state members) instead of only
flipping `m_clipping`.

**Surface choice is load-bearing.** wxGrid clips every cell's text to its cell via
exactly the broken path (`wxGrid::DrawTextRectangle` → `wxDCClipper`,
`grid.cpp:7336`), and KiCad's `WX_GRID` disables cell overflow
(`wx_grid.cpp:214`), so a long cell text must truncate at its own cell edge even
next to an *empty* neighbor. But the obvious grid — Board Setup → **Text
Variables** — is the **wrong** target: `WX_GRID::SetupColumnAutosizer` re-runs
`AutoSizeColumn()` on `wxEVT_GRID_CELL_CHANGED`/`wxEVT_UPDATE_UI`, so committing a
70-char name simply *widened the Name column to fit* (measured: column grew to
~980px, pushed the Value column off-view behind an h-scrollbar) — nothing left to
clip, bug invisible. Board Setup → **Net Classes** has fixed column widths (no
autosizer; `min_best_width` from `"555,555555 mils"` ≈ 96px) and a newly added
netclass row leaves its Clearance cell empty.

**Why the bleed survives a full repaint:** `DrawGridCellArea` draws cells in
*descending* order (`grid.cpp:6497` reverse loop), so the Name cell (1,0) paints
*after* its neighbor (1,1) and the unclipped overflow lands on top of the
already-painted empty cell; only gridlines/highlight (which don't cover the cell
interior) paint later.

**Driving the grid (three port gotchas baked into the spec):**
- The "+" button is a `STD_BITMAP_BUTTON` — a custom-painted `wxPanel`, which the
  element registry *skips* — so it can't be found by type; the spec clicks it
  blind at the grid rect's bottom-left + (13, 16) (offsets verified on-screen).
- Keys typed into a DOM editable never reach wx (audit #43/#55), so Enter cannot
  commit the cell editor. The spec clicks "+" a *second* time:
  `WX_GRID::OnAddRow` calls `CommitPendingChanges()` first (mouse events do reach
  wx), committing the payload row.
- The netclass grid inserts new rows at the *top*, so the second "+" click also
  shifts the payload row to row 1 and moves the cursor/row-selection highlight
  (dark navy — would fake ink) to the fresh row 0, leaving row 1 clean to
  measure. A mean-luminance guard (>128) fails loudly if a highlight ever lands
  on the measured cell anyway.

**Signal:** type a 70×`W` name (~700px vs the 96px Name column), commit, then
count dark ("ink", luminance < 128) pixels inside the *empty* Clearance cell
(1,1) interior (4px inset; device-scale screenshot → offscreen-canvas
`getImageData`). Precondition: the Name cell (1,0) must itself contain painted
text (ink > 50) so a failed commit can't fake a pass.

| # | KiCad surface | RED (pcbnew vs unpatched wx) | GREEN (pcbnew vs patched wx) |
|---|---|---|---|
| **H-2** | Board Setup → Net Classes, empty Clearance cell next to 70-char name | **ink=325**, mean=191.5 — name bleeds across the whole grid — *measured* | **ink=0**, mean=255.0 — name clipped at its cell edge — *measured* |

- **RED — measured**: `[H2] name cell: ink=413 mean=181.7; clearance cell: ink=325
  mean=191.5` → `expect(325).toBeLessThan(5)` fails; identical on retry
  (deterministic). The failure screenshot shows the name crossing Clearance …
  DP Width to the grid edge.
- **GREEN — measured**: `[H2] name cell: ink=413 mean=181.7; clearance cell: ink=0
  mean=255.0` — the name-cell ink count is *identical* to RED (413), proving the
  same text painted and only the clipping changed; test passes (20.2s), no
  `Aborted(`.

Method: measure RED against the current binary (fix not yet built) → apply the
`dc.cpp` fix → `BINARYEN_OPT_LEVEL=-O1 docker/build.sh pcbnew` → rerun the spec
(GREEN) → regression-run `plot-checklist` / `via-clientdata` / `modal-input-lock`.

**Residual (documented, not fixed):** a genuinely *empty* clip intersection still
degenerates to a whole-context clip (the `wx.js` `width<=0 → full` guard, kept as
defense-in-depth, can't express an empty clip); no KiCad surface hits this.
Finding #19 (the `wxRegion` overload never sets the C++ clip-box members) is a
separate audit item, untouched here.

## KiCad e2e (product proof) — `tests/kicad/dialog-select-on-open.spec.ts` (H-3/#30/#31)

H-3: the wasm port's `wxTextEntry` caret/selection was a pure C++ cache —
`GetInsertionPoint`/`GetSelection` never read the DOM `<input>`'s
`selectionStart`/`selectionEnd`, and every DOM `input` event reset the cached
caret to 0 (`textctrl.cpp` INPUT → `wxTextEntry::DoSetValue`). #30: `SetSelection`/
`SelectAll`/`SetInsertionPoint` wrote only the cache, never `setSelectionRange`.
#31: `WriteText` inserted at the stale caret. Fix (wx port):
`include/wx/wasm/private/dom.h` + `build/wasm/wx-dom.js` add
`wxDomGetSelectionStart/End` + `wxDomSetSelection`; `src/wasm/textentry.cpp`
live-reads/writes the DOM when the element exists (cache fallback pre-Create) and
`WriteText` computes its insert position from the live selection.

**KiCad surface: select-all-on-dialog-open.** `DIALOG_SHIM::OnPaint` first-paint
runs `SelectAllInTextCtrls()` then focuses the initial-focus control
(`dialog_shim.cpp:1343-1357`) so typing replaces a pre-filled field. Two things
were broken in wasm and both had to be fixed:
1. The `SelectAll()` inside `SelectAllInTextCtrls` was gated
   `#if defined(__WXMAC__) || defined(__WXMSW__)` (`dialog_shim.cpp:901`) — the
   wasm build defines `__WXWASM__`/`__WXUNIVERSAL__`, so it was **compiled out
   entirely**. Widened the gate with `|| defined(__WXWASM__)` (the actual product
   fix — dialogs regain native type-to-replace).
2. Even when called, `SetSelection` never reached the DOM (#30).

**The load-bearing discovery (drove a bridge-level design choice):** a selection
set via `setSelectionRange` on a **blurred** `<input>` is dropped when the element
is later focused (the browser restores its own caret on focus). But that is
exactly KiCad's order — `SelectAllInTextCtrls` runs while the field is still
unfocused, then `ForceFocus` focuses it. So `wxDomSetSelection` (wx-dom.js), when
it sets a selection on a non-active element, registers a **one-shot `focus`
listener that re-applies the range** — making "select then focus" behave like
native. Verified at the wx layer first: the standalone `textsel` app's write-half
(`SetSelection(2,7)` on a button-blurred field → focus → read) was RED without
this and GREEN with it.

**Surface: Track & Via Properties on a single-track board.** With a track
selected the dialog sets initial focus on `m_TrackWidthCtrl`
(`dialog_track_via_properties.cpp:845-846`), a plain wxTextCtrl pre-filled with
the width. (A via board is wrong — focus would land on the net selector.) The
test injects a `(segment … (width 0.25) …)` board, Ctrl+A selects the track, `e`
opens the dialog, then — **without clicking** — types `5` into the focused field.

| # | KiCad surface | RED (pcbnew vs unpatched) | GREEN (pcbnew vs patched wx + kicad gate) |
|---|---|---|---|
| **H-3** | Track Properties open, focused width field pre-filled `0.25`, type `5` | **`"0.255"`** — inserted — *measured* | **`"5"`** — selected pre-fill replaced — *measured* |

- **RED — measured**: `[H3] width field value after typing "5": "0.255"` →
  `expect("0.255").toBe("5")` fails; identical on retry.
- **GREEN — measured**: `[H3] … after typing "5": "5"` (pre-fill `"0.25"` at open,
  precondition confirms focus landed on the width field); passes (20.9s), no
  `Aborted(`.

Standalone (read-path proof, no KiCad-observable consumer): `textsel` app +
`tests/e2e/parity-audit.spec.ts`. READ half — put a real DOM selection (4,9) /
type at the end, ask C++: RED `insertion=0 sel=0,0` → GREEN `insertion=4 sel=4,9`
/ `insertion=12`. WRITE half — `SetSelection(2,7)`/`SelectAll()` → assert the DOM
selection: RED unchanged → GREEN `[2,7]`/`[0,12]`. Full parity-audit suite 7/7.

Method: KiCad spec RED vs the current binary → wx fix → standalone RED→GREEN
(fast, no docker) → kicad gate line → `BINARYEN_OPT_LEVEL=-O1 docker/build.sh
pcbnew` → KiCad spec GREEN → regressions (`via-clientdata`, `grid-clip-bleed`,
`plot-checklist`, `modal-input-lock`, `load-pcb`).

**Note on `wxDomSetValue`:** it now skips a no-op `el.value = value` assignment
(`el.value !== value` guard) — reassigning the same string collapses the DOM
caret to the end, which would undo a selection just placed by `wxDomSetSelection`.

## KiCad e2e (product proof) — `tests/kicad/calc-slider-scroll.spec.ts` (H-6)

H-6: `wxSlider` in the DOM port fired only `wxEVT_SLIDER`, never the
`wxEVT_SCROLL_*` family, so handlers bound *exclusively* to the scroll family
never ran. Fix (`wxwidgets/src/wasm/slider.cpp`, already in the tree): on the DOM
`input` event fire `wxEVT_SCROLL_THUMBTRACK` + `wxEVT_SCROLL_CHANGED`, and on
`change` fire `wxEVT_SCROLL_THUMBRELEASE`, before the `wxEVT_SLIDER` command
event (mirrors `src/gtk/slider.cpp`).

**Surface the reachability doc missed.** `kicad-e2e-reachability.md` marked H-6
"blocked" because it only considered the colour picker (doesn't open in wasm)
and the Appearance opacity sliders (canvas-pixel effect). But the **PCB
Calculator → Cable Size** panel has the exact pattern with a *readable text
field* effect: `m_slCurrentDensity` is wired **only** to `wxEVT_SCROLL_*`
(`panel_cable_size_base.cpp:283-`) → `onUpdateCurrentDensity`, whose body
recomputes the **Ampacity** output (`panel_cable_size.cpp:199`). The calculator
runs in wasm (`calculator.spec.ts`); the panel is `pcb_calculator_frame.cpp:173`.
(The calculator app is a separate `docker/build.sh calculator` target — it must
be built + staged alongside pcbnew for this spec.)

**The e2e:** open the calculator, dismiss the first-run wizard, `clickTreeItem
('Cable Size')`, snapshot every editable text `<input>`, drive the range slider
to `12` (`el.value=…; dispatch input+change`), re-snapshot, assert ≥1 field
changed. Only the slider is touched between snapshots, so any change is
attributable to it.

| # | KiCad surface | RED (calculator vs unfixed slider) | GREEN (vs fixed slider) |
|---|---|---|---|
| **H-6** | Cable Size current-density slider → output fields | **0 fields changed** — the scroll event never fires, `onUpdateCurrentDensity` never runs — *measured* | **1 field changed** — Ampacity recomputes — *measured* |

- **RED — measured**: `[H6] output fields changed by the slider move: 0` (the
  Ampacity field stays `2.35619`) → `expect(0).toBeGreaterThan(0)` fails.
- **GREEN — measured**: `[H6] output fields changed by the slider move: 1`
  (Ampacity `2.35619 → 9.42478`); test passes.

Method: measured GREEN against the current binary (fix already staged) →
`git checkout src/wasm/slider.cpp` to revert to the unfixed HEAD → `docker/
build.sh calculator` → RED → restore the fix.

## KiCad e2e (product proof) — `tests/kicad/menu-undo-stale.spec.ts` (H-7)

H-7: `wxEVT_MENU_OPEN` was never fired — the DOM menubar opens its popup from a
cached JS snapshot and never calls into C++, and the menu is only re-serialized
to the DOM on structural mutations. KiCad refreshes menu enable/check **only** on
`wxEVT_MENU_OPEN` (`ACTION_MENU::OnMenuEvent` → `ACTIONS::updateMenu`,
`action_menu.cpp:424`), so every item kept its construction-time state.

**Fix (wx port):** a new `wx_dom_menu_open(domId, menuIndex)` export
(`src/wasm/domevents.cpp`) → `wxMenuBar::WasmOnMenuOpen` (`src/wasm/menu.cpp`)
fires `wxEVT_MENU_OPEN` via `wxMenu::ProcessMenuEvent` (reaching KiCad's
ACTION_MENU handler + the frame), runs `menu->UpdateUI()`, then serializes the
menu. The JS title-click handler (`build/wasm/wx-dom.js`) calls it before opening
the popup and uses the fresh items.

**Two non-obvious mechanics (each cost an iteration):**
1. **The refresh Asyncify-suspends** (`updateMenu` runs through the tool
   framework). A string returned across that suspension is **lost** — the sync
   ccall resolves to `null` (measured: `[MENUOPEN] fresh=NULL`). Fix: C++ pushes
   the fresh JSON to a JS store via `EM_ASM` (`wxDomSetOpenMenuItems`), which
   survives suspend/resume, and the JS handler calls the ccall with
   `{async:true}` + `await` so the popup opens only after the refresh completes.
2. **`m_dirty` gates `updateMenu`** (`action_menu.cpp:424`), but menubar
   ACTION_MENUs never `ClearDirty` (only context menus do, `tool_menu.cpp:61`),
   so `m_dirty` stays true and **every** open refreshes — which is exactly what
   the test needs (both reads refresh).

**The e2e:** load a one-footprint board (empty undo stack), open **Edit**, read
the rendered `Undo` menuitem's `enabled` (E0); `kicadCollabTestMoveFirst` (a real
`BOARD_COMMIT::Push` → one undo entry — pump the canvas so the deferred commit
drains); reopen Edit, read `enabled` (E1).

| # | KiCad surface | RED (pcbnew vs unpatched) | GREEN (vs patched) |
|---|---|---|---|
| **H-7** | Edit▸Undo `enabled`, empty stack → after an undoable move | **E0=`true`, E1=`true`** — frozen at the construction default, never tracks the stack — *measured* | **E0=`false`, E1=`true`** — disabled on the empty stack, enabled after the move — *measured* |

- **RED — measured**: `[H7] Undo.enabled with an empty undo stack: true` →
  `expect(E0).toBe(false)` fails (the frozen default is `true`).
- **GREEN — measured**: the C++ push logs `UndoEnabled=false` on the first open
  and `UndoEnabled=true` on the second; E0=`false`, E1=`true`; test passes
  (15.8s). Menu-opening regressions (`plot-checklist`, `modal-input-lock`,
  `grid-clip-bleed`) stay green under the new async menu-open path.

Method: RED = the current binary (H-7 was never implemented) → implement the fix
→ `BINARYEN_OPT_LEVEL=-O1 docker/build.sh pcbnew` → GREEN. The JS side
(`wx-dom.js`) is a separate script (not compiled into the wasm), so its
iterations were validated without rebuilding.

## KiCad e2e (product proof) — `tests/kicad/contextmenu-fresh.spec.ts` (H-8)

H-8 is the right-click sibling of H-7. `wxWindowWasm::DoPopupMenu`
(`src/wasm/window.cpp`) serialized the popup once via `WasmItemsToJson()` and
never fired `wxEVT_MENU_OPEN` or ran a `menu->UpdateUI()` pass. Fix: fire both
before serializing — mirrors `wxMenuBar::WasmOnMenuOpen`.

**Why the pcbnew *selection* menu can't repro it (the surface trap):** KiCad
pre-refreshes most context menus in C++ before the popup —
`TOOL_MENU::ShowContextMenu(SELECTION&)` (`tool_menu.cpp:57`) runs `Evaluate()`
\+ `UpdateAll()` + `ClearDirty()`, so the selection menu is fully fresh even in
RED. The gap survives only in the **no-arg** `TOOL_MENU::ShowContextMenu()`
overload (`tool_menu.cpp:66`), which just `SetDirty()`s and shows — relying
entirely on `wxEVT_MENU_OPEN` → `updateMenu` (gated on `m_dirty`, true here) to
`Evaluate` the `CONDITIONAL_MENU`. The **pcbnew Measure tool** uses it
(`pcb_viewer_tools.cpp:441`). Because a `CONDITIONAL_MENU`'s items don't
materialize until `Evaluate()` runs, the RED trap isn't a stale bit but an
**empty menu**: the cloned popup (`tool_manager.cpp:971`) serializes 0 items.
The clone keeps `m_dirty=true` (constructor default; `copyFrom` doesn't copy
it), so the fix's `wxEVT_MENU_OPEN` does trigger `updateMenu` on it.

**The e2e:** boot pcbnew.html; right-click the canvas after a left-click
(selection menu — the CONTROL) → must be populated in both builds; then activate
Measure (Ctrl+Shift+M) and right-click → the SIGNAL.

| # | KiCad surface | RED (unpatched) | GREEN (patched) |
|---|---|---|---|
| **H-8** | Measure-tool canvas right-click menu | **0 items — empty popup** (CONDITIONAL_MENU never Evaluated) — *measured* | **4 items `["Cancel","Copy","Zoom","Grid"]`** (Evaluated on open) — *measured* |

- **RED — measured**: `[H8] selection-tool menu (5): [...,"Zoom","Grid"]` (control
  OK) but `[H8] measure-tool menu (0): []` →
  `expect(measLabels.length).toBeGreaterThan(0)` fails.
- **GREEN — measured**: `[H8] measure-tool menu (4): ["Cancel","Copy","Zoom","Grid"]`;
  test passes (15.2s). The measure menu's items differ from the selection menu's
  (`Cancel`/`Copy` vs `Get and Move Footprint`/`Paste`), confirming the Measure
  tool activated and its *own* no-arg menu is the one that was empty in RED.

The selection-menu control proves the failure is specific to the
`wxEVT_MENU_OPEN` / no-arg path, not a general popup break. Same root as H-7;
`window.cpp` change → full pcbnew rebuild. Build gotcha on a memory-tight Mac:
the host-side binaryen `-O1` asyncify-shrink pass wants ~10-15 GB — run the build
**detached** (`nohup … & disown`, not a reap-prone tracked background task) with
`BINARYEN_CORES=2` to keep peak RAM under the ceiling.
