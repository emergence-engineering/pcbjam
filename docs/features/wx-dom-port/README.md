# wxWidgets DOM port (`feature/wx-dom-port`)

A second WASM build mode where wxWidgets widgets are **real HTML elements**
(`wxButton` → `<button>`, `wxTextCtrl` → `<input>`, menus → popup divs)
instead of wxUniversal pixels on a canvas. Goals: styleable modern UI,
native text input/IME, accessibility, crisp rendering — while the existing
canvas port keeps working unchanged from the same source tree.

Status: COMPLETE (Phases 0–7). wxWidgets-side port done, both wx e2e
suites green from one tree, and all six KiCad apps (pcbnew, eeschema,
calculator, pl_editor, symbol_editor, gerbview) build and run on the DOM
port — full kicad e2e suite green under `WX_PORT=dom` (28/0, 1 flaky,
2 skipped). Build with `WX_PORT=dom docker/build.sh <app>` (outputs in
`output/dom/`); test with `WX_PORT=dom npm run test:kicad`. Work
intentionally stays on `feature/wx-dom-port` (root + wxwidgets + kicad) —
not merged to `main`/`wasm-port`.

## Architecture in one page

- **One toolkit, two modes.** `--with-wasm --enable-universal` = canvas
  (untouched); `--with-wasm` alone = DOM. Selection is file-level via the
  build system: `src/univ/` only in canvas builds, `WASM_SRC` (native
  controls) only under `WXUNIV_0`. Source of truth is
  `build/bakefiles/files.bkl` → dockerized bakefile regenerates
  `Makefile.in`/`autoconf_inc.m4` → autoconf regenerates `configure`
  (`scripts/build-wxuniversal-wasm.sh` auto-detects each stage's
  staleness; `--dom` flag selects the mode).
- **C++ owns state; the DOM is a projection.** Controls call
  `WasmCreateDomNode("type")` once in `Create()`; the shared
  `wxWindowWasm` machinery then syncs geometry (TLW-relative absolute
  positioning, recursing into descendants), visibility
  (`IsShownOnScreen`, whole subtree), enabled/font/focus/destruction.
  DOM-native state (typed text, checked, selection) syncs back through
  events into C++ caches so getters stay synchronous.
- **Layout is wx sizers, not CSS.** DOM contributes intrinsic measurement
  only (clone-based, in an offscreen always-rendered host — sizers run
  before `Show()`); positions are written as absolute `left/top/w/h`.
- **Events** flow element listener → `ccall('wx_dom_event')` →
  `domevents.cpp` routing table → virtual `wxWindowWasm::OnDomEvent` —
  the same direct-dispatch pattern as the port's mouse callbacks (proven
  against Asyncify-suspended modals). Keyboard arbitration: keystrokes go
  untouched to focused DOM editables (Escape excepted).
- **Canvas islands.** Owner-drawn/generic widgets (wxGrid, listctrl,
  tree, AUI, STC, calendar...) keep painting via the shared `dc.cpp`
  Canvas2D path inside per-window canvases; they render near-pixel-equal
  to the canvas port.
- **Menus/toolbars** serialize C++→JS as JSON; popups are DOM divs;
  command ids route back via `wxDOM_EVENT_MENU`/`TOOL`. Menu titles,
  items, and tools register as rendered elements with the same
  type strings the canvas port uses, so registry-based e2e utilities work
  identically on both ports.

Key files: `wxwidgets/build/wasm/wx-dom.js` (the whole JS control layer),
`wxwidgets/include/wx/wasm/private/dom.h` (C++→JS bridge),
`wxwidgets/src/wasm/domevents.cpp` (event routing + bitmap data URLs),
`wxwidgets/src/wasm/window.cpp` (DOM-backing machinery, guarded
`#ifndef __WXUNIVERSAL__`).

## What works (e2e-verified, WX_PORT=dom)

Full `tests/e2e` suite green (256/0; canvas 263/0 from the same tree, its
stable screenshot set byte-identical to the pre-feature reference).

- Native DOM: stattext, button (stock labels, default size), textctrl
  (single/multi/password, two-way sync, wxEVT_TEXT/_ENTER), checkbox,
  radiobutton (HTML name groups from wxRB_GROUP chains), radiobox,
  togglebutton, gauge, slider, statline, statbox, statbmp (PNG data
  URLs), bitmap buttons, choice, listbox, editable combobox
  (input+datalist), checklistbox, spinbutton (drives generic wxSpinCtrl),
  menubar+menus, toolbar, tooltips (title attrs), dialogs (shared
  Asyncify ShowModal), frame bar geometry (univ-parity).
- Canvas islands verified visually: AUI, calendar, virtual listctrl,
  grid, tree, propgrid, STC.

## Known gaps / polish (tracked in visual-notes.md)

- wxSpinCtrl text field collapses beside the spin pair (generic composite
  sizing); bitmap-button vertical centering; checklistbox selection
  highlight; wxLB_SINGLE uses a multiple `<select>`; native scrollbars
  replace univ gutters.
- Tracker hooks in `src/generic/`+aui/stc/propgrid are shared with the
  canvas port and stay until the canvas port retires (the DOM port itself
  doesn't need them — its controls register from creation + ARIA). The
  univ hooks die with univ automatically.

## Upstreaming surface (vs `wasm-port` base)

8 commits, ~107 files: the port directory itself (new files), 35
dispatch-header branches (2–4 lines each), build-system entries
(bakefile-generated), one-line `prntbase.cpp` PostScript condition, and
two genuine upstream bug fixes in the generic notebook
(`tabg.cpp` uninitialized background brush; `notebook.cpp` first-page
selection never syncing the tab view). Zero changes to univ/aui/stc.

See `visual-notes.md` for the 15-bug log the cross-port screenshot
comparison protocol produced.
