# Cross-port visual comparison notes (canvas baseline vs DOM port)

Protocol: per feature, view `tests/baseline-screenshots/<name>.png` (canvas)
next to `tests/test-results/dom/<name>.png` (DOM). Expectation: same widget
geometry (within a few px), same text/content/state; only widget styling
(native control chrome, fonts antialiasing) may differ.

## Phase 2 (2026-06-10) — layout suite

`layout-01-loaded` and siblings, after the geometry-propagation and frame-bar
fixes:

- **Matches canvas:** splitter pane split position, left/right item placement
  and vertical rhythm, event-log textarea geometry and content ("Layout test
  app started / Splitter position: 300" as real selectable text), status bar
  text at the bottom, window title at top-left.
- **Expected styling deltas:** native `<textarea>` chrome vs univ-drawn text
  area; statusbar/panel grey backgrounds not painted yet (canvas islands do
  not erase-paint panel backgrounds in DOM mode — Phase 4); `wxStaticBox`
  "Event Log" caption+border missing (statbox DOM node lands in Phase 3 B1);
  text baseline within spans sits ~2px higher than canvas text.
- **Bugs found & fixed by this comparison:**
  1. DOM rects are TLW-relative, so ancestor moves must recursively refresh
     descendants' DOM geometry (children's wx rects don't change when a
     parent moves). Fixed in `wxWindowWasm::UpdateDomGeometry`.
  2. `WriteText`/`AppendText` mutate the wxTextEntry cache without
     `DoSetValue`, so the DOM `value` must be pushed there too. Fixed in
     `wxTextCtrl::WriteText`.
  3. Stub `wxFrame` didn't position bars — status bar text rendered at
     (0,0) over the title. Fixed by porting the univ bar geometry
     (`framuniv.cpp`) into `src/wasm/frame.cpp`.

## Phase 2 (2026-06-10) — dialog/timer apps, second round

`dialog-02-info-clicked` vs canvas baseline after the second fix round:

- **Matches canvas:** button rows centered with correct sizes/labels, modal
  Information dialog as near-twin (title bar + close button, two message
  lines, OK button bottom-right with stock label), grey window chrome,
  event-log textarea with content.
- **Expected deltas:** info icon missing (wxStaticBitmap is Phase 3), dialog
  border/shadow chrome thinner (Phase 5), native button styling.
- **Bugs found & fixed by this comparison round:**
  4. `wxSystemSettingsNative::GetColour` returned black for nearly all
     colours (univ theme used to mask it) — black dialog bodies/canvas
     islands. Fixed with a classic light palette (native mode only).
  5. DOM children of hidden ancestors (unselected notebook pages) stayed
     visible — visibility now syncs the whole subtree via IsShownOnScreen.
  6. Unhandled wxEraseEvent left canvas islands black in native mode —
     default background fill added (native only).
  7. DoGetBestSize measured 0x0 while elements/ancestors were display:none
     (sizers run before Show) — measurement now uses a clone in an
     offscreen always-rendered host.
  8. `white-space: nowrap` discarded multiline wxStaticText newlines →
     'pre'. wxDomSetShown also restored display:'' wiping flex → remembers
     the preferred display.
  9. Stock-id buttons with empty labels (msgdlg OK) rendered tiny — stock
     label resolution added to wxButton::Create like other ports;
     wxButtonBase::GetDefaultSize implemented.
  10. Shim-only edits didn't relink test apps — JS pre-js files are now
      Makefile dependencies of every app link rule.

## Phase 3 B1 (2026-06-10) — minimal app Controls tab

`04-controls-tab` vs canvas baseline with checkbox/radio/toggle/gauge/
slider/statline/statbox wired:

- **Matches canvas:** checkbox with native checked state, toggle button
  with pressed highlight, slider thumb position, gauge fill proportion,
  static-box group borders with legends, status bar fields, layout rhythm.
- **Native-styling deltas (accepted):** browser-blue range/progress chrome
  vs univ grey; native checkbox glyph.
- **Known gaps (tracked):** notebook tab strip renders black boxes — the
  generic notebook/tabg canvas island doesn't paint label text/background
  (Phase 4 sweep); wxRadioBox "Options" group absent (composite control,
  Phase 3 B2); File/Help menubar absent (Phase 5).

## Phase 3 B2+B3 (2026-06-10) — lists, spin, bitmaps, combo, checklist

- **Working as native DOM:** choice `<select>` (color dropdown matches),
  listbox `<select multiple>` with items, radiobox fieldset with radio
  rows, spinbutton ▲▼ pair (drives the generic wxSpinCtrl composite),
  bitmap buttons with real PNG icons (toolbar rows, art-provider icons,
  shapes), statbmp `<img>` (dialog info icon restored), editable combobox
  as `<input>`+`<datalist>` autocomplete, checklistbox checkbox rows.
- **Bugs found by comparison/probing this round:**
  11. "No image handler for type 15" warning dialog — test apps don't call
      wxInitAllImageHandlers; lazy wxPNGHandler registration + wxLogNull
      in wxDomBitmapToDataURL.
  12. Bitmaps set but invisible: images load asynchronously, so the
      measurement clone saw 0x0 — explicit img width/height from the wx
      bitmap dimensions (+ flex-shrink:0 against squish).
  13. wxDomSetIntValue would have written the selection INDEX into the
      combobox text input — datalist branch maps selection↔option text.
- **Polish items (open):** bitmap-button vertical centering; checklistbox
  selection highlight (only checked state is wired); wxLB_SINGLE uses the
  multiple select.

## Phase 4 (2026-06-10) — canvas-island sweep

- **Near-pixel twins:** AUI (dock panels, title glyphs, tints), calendar
  (month grid, weekend/selection colours, month select + year spinner),
  listctrl (virtual 10k rows, striped, headers), grid tab, dialogs.
- **Upstream-grade generic-notebook bugs found & fixed:**
  14. wxTabView::Init never initialized its background pen/brush (the
      init line is commented out upstream) — tabs drew as black boxes.
      Fixed in src/generic/tabg.cpp with wxSYS_COLOUR_BTNFACE.
  15. wxNotebook::InsertPage's ChangePage(-1, 0) fallback never synced the
      tab view's m_tabSelection, so the FIRST tab switch reported old
      selection -1 and never hid the initial page — its DOM controls
      ghosted over every later page. Fixed in src/generic/notebook.cpp by
      SetTabSelection(..., false) after the fallback.
- **Polish items (open):** generic wxSpinCtrl's text field collapses
  beside the spin pair; Event Log textarea lacks the univ scrollbar
  gutter (native scrollbars appear on overflow instead).

## Phase 5 (2026-06-10) — menus, toolbars, tooltips

- **Working as native DOM:** menubar strip (File/Edit/View/Tools/Help) with
  popup menus — items, separators, check marks, submenu expansion, hover
  highlight, outside-click dismissal, drop shadow (`menu-03-file-clicked`
  is a close twin of the canvas popup); toolbar strips with PNG icon
  buttons, toggle state, separators; tooltips as native `title`
  attributes (wxUSE_TOOLTIPS re-enabled for the DOM build).
- **Compatibility:** menu titles register as rendered elements
  (`menuitem`/`menubar`), popup items as `menuitem`, tools as `tool` —
  `clickMenuBarItem`/`findRenderedByType`-based specs pass unchanged
  (menu.spec 7/7, toolbar.spec 6/6).
- **Architecture note:** menu structures serialize C++→JS as JSON
  (wxDomMenuSetStructure); activation routes back via
  wxDomGetLastCommandId + wxDOM_EVENT_MENU → wxMenu::SendEvent. Toolbar
  identical shape (wxDomToolbarSetTools / wxDOM_EVENT_TOOL →
  wxToolBarBase::OnLeftClick with radio-group + veto handling).

## Phase 7 (2026-06-11) — KiCad on the DOM port

- **All six apps build and run** (pcbnew, eeschema, calculator,
  pl_editor, symbol_editor, gerbview); full kicad e2e suite under
  WX_PORT=dom: 28 passed / 1 flaky / 2 skipped / 0 failed.
- **Screenshots:** pcbnew = layer manager, appearance panes, toolbars,
  WebGL board canvas, native menubar (File…Help, 9 menus) — near-twin of
  the canvas reference modulo native chrome styling. eeschema = full
  editor with real checkbox filter panels. calculator = native DOM form
  controls (inputs, radios, buttons) beside canvas-island diagrams.
  Port-aware reference images: tests/wizard-04-finish-headless-dom.png.
- **Bugs found & fixed by KiCad-on-DOM:**
  16. DomMenuItemsToJson passed labels through wxString::Format, which
      returns "" when vsnprintf rejects an argument (some KiCad labels)
      → empty JSON item → whole menu document unparseable. Labels are
      now concatenated; wxDomJsonEscape hardened for ctrl chars < 0x20.
  17. The first TLW (the browser page) started logically hidden; KiCad
      never calls Show(true) on it (canvas renders regardless), so every
      pre-Show child stayed display:none. Main frame now starts shown.
  18. Keyboard arbitration was stateful (focusin/focusout flag); Firefox
      fires no focusout when a focused element is REMOVED (wizard page
      destroyed mid-focus) → flag stuck → all keys except Escape
      swallowed for the session (eeschema Backspace/Delete dead). Now a
      stateless document.activeElement check.
  19. Build pipeline: fresh build trees failed at the embind pre-compile
      (generated pcb_lexer.h not yet emitted) — found here and fixed
      independently upstream (f936eb1); upstream's version kept.
- **Known cosmetic gap:** DOM menubar/toolbar styling differs from univ
  pixels by design (native buttons, system font); the kicad reference
  regions therefore use per-port reference images.

## Appearance-panel workstreams (2026-06-12)

User-reported pcbnew issues, all fixed and e2e-pinned
(tests/kicad/appearance.spec.ts, screenshots appearance-*.png):
  20. DOM elements never clipped to ancestor viewports → layer rows
      rendered past the pane. UpdateDomGeometry now pushes
      clip-path:inset() from the accumulated ancestor client rects.
  21. wxWindowWasm::ScrollWindow never moved children (univ does) →
      scrolled panes could not scroll at all.
  22. Mouse events over DOM-backed children never reached the wx pipeline
      (listeners only on #canvas) → no hover/wheel/right-click over
      labels/sliders. Document-level forwarding into wx_dom_mouse.
  23. Wheel events died at the deepest window: wx mouse events don't
      self-propagate and native ports rely on platform routing.
      HandleMouseWheelEvent walks up to the TLW.
  24. Generic (Motif-era) notebook replaced by a DOM-native wxNotebook:
      real side-by-side tab buttons (ellipsis, no label overflow),
      reliable switching, native look; registry 'tab' contract kept.
  25. Universal tooltip layer (#wx-tooltip div, 600 ms, hover hit-test
      driven) — island widgets (color swatches, visibility toggles) get
      KiCad's SetToolTip texts; title attrs replaced by aria-label.

## DOM-only consolidation (2026-06-12)

The canvas (wxUniversal) mode and dual-build plumbing were removed; the
DOM port is THE WASM port. Rebuilding everything from clean surfaced
three latent bugs (all pre-existing — verified by rebuilding the
pre-consolidation tree, which failed identically):

  26. The DOM projection treated GetScreenPosition() as the window's
      top-left; it is ClientToScreen(0,0) — the CLIENT-AREA origin. The
      first widget with a non-zero client origin (the DOM notebook's tab
      strip) rendered its whole box a strip-height too low, overlapping
      its own pages, and ComputeAncestorClip double-added the origin,
      clipping page content (dataview/grid/minimal buttons cut to
      slivers, clicks swallowed by the strip). This was bug-logged
      earlier as "tab-strip/content slight overlap" and believed
      cosmetic. Fixed in UpdateDomGeometryRecursive (+ eager strip
      re-measure + re-projection in wxNotebook::WasmRebuildTabs).
  27. The DOM port never mirrored spin arrows and text fields into the
      e2e registry (the canvas port published them from univ paint
      hooks, which died with univ). wx-dom.js now registers
      'spinbutton' (up/down) and 'textctrl' (singleline/multiline)
      rendered elements, and clears a control's mirrored entries on
      destroy.
  28. tests: clickCanvas() used locator.click(), whose actionability
      check refuses points covered by DOM elements — in the DOM port
      real widgets legitimately cover the canvas. It now dispatches via
      page.mouse. The minimal-app comprehensive spec drives the wxChoice
      through its native <select> (browsers own that popup; it cannot be
      coordinate-clicked).
  29. wxClipboard::IsSupported suspended for up to 2 s per call
      (EM_ASYNC_JS readText raced vs timeout) on KiCad's idle path;
      overlapping suspensions clobber Asyncify.currData → "indirect call
      to null"/"signature mismatch" storms after a document loads (bug 2
      of features/async on main; fix was designed in May, landed now).
      The predicate answers from the cache, else "Clipboard API
      available".

### Known-red kicad specs (asyncify scope, NOT this feature)

The 10 file-loading kicad specs (load-pcb, pcbnew-collab, eeschema-collab,
eeschema-ui Backspace/Delete/text-dialog) sit on the unfixed asyncify
substrate: a single corrupting fault still fires at document load (fiber
swap crossing the parked main loop — bug 3 / per-context currData
authority in features/async designs A/B) and breaks subsequent keyboard
and collab-commit processing. Bisect-verified pre-existing: eeschema
binaries built from BOTH the pre-consolidation and post-consolidation wx
trees fault identically; binary timing decides whether the race is lost,
so any rebuild can flip these specs. They were red before this
consolidation (the "31 passed" gates) and stay red after it; greening
them is the async feature's exit criterion.

## Layers tab goes blank after a tab round-trip (2026-06-15, pcbjam#8)

Switching the pcbnew appearance notebook Layers → Objects/Nets → Layers left
the Layers page blank: every layer row was present in the DOM but fully
clip-pathed away, and the layers `wxScrolledWindow` viewport had collapsed to
zero height (`154x0`).

Root cause (two layers):
  30. KiCad's `APPEARANCE_CONTROLS::OnNotebookPageChanged` calls
      `m_panelLayers->Fit()` on every page change, which shrinks the page to
      its content min size and collapses the proportion-1 scrolled child's
      viewport to height 0. `wxBookCtrlBase::DoSetSelection()` fires
      `wxEVT_NOTEBOOK_PAGE_CHANGED` LAST, so this happens after the page was
      sized/shown.
  31. `wxWindowWasm::DoSetSize()` only emits `wxEVT_SIZE` (which drives
      auto-Layout) when the size actually changes. Resizing the page back to
      the page area is therefore a no-op that never re-runs the sizer, so the
      collapsed scrolled child sticks and `UpdateDomGeometry` clip-paths every
      row out of the empty ancestor viewport.

Fix: `wxNotebook::OnDomEvent` now calls `WasmRelayoutSelectedPage()` after
`SetSelection()` returns (all PAGE_CHANGED handlers done) — it re-asserts the
page to the full page area, forces `page->Layout()`, and re-projects the DOM
geometry. wxwidgets-layer only; KiCad untouched.

Test hardening: `appearance.spec.ts`'s `rowLabelTops()` previously returned
`getBoundingClientRect().top`, which is `0` (not null) for a clip-pathed row,
so the round-trip assertion passed even when the panel was blank. It now
hit-tests the row centre via `elementsFromPoint` (clip-path affects
hit-testing), so a clipped-away row reads as null and fails the assertion.

## Dock-panel resize: cursor, live preview, grey XOR lines (2026-06-19, pcbjam#20)

Resizing a docked side panel (a `wxAuiManager` dock sash, as KiCad uses for
all its side panels) was broken three ways in the DOM port: no resize cursor on
hover, no live preview during the drag, and a trail of grey vertical "stripes"
smeared across the pane when narrowing it.

Root causes (both wasm-layer):
  32. `wxAuiManager` only live-resizes when `wxUSE_AUI_LIVE_RESIZE_ALWAYS`
      (Mac/GTK3 only) or the `wxAUI_MGR_LIVE_RESIZE` flag is set; otherwise
      `OnMotion`/`OnLeftUp` paint the sash hint via `wxScreenDC` + `wxXOR`
      (`DrawResizeHint`). On a Canvas2D island XOR neither composites nor
      erases, so every drag step's `wxPaneCreateStippleBitmap` hint stays put —
      a 1px black/light stipple trail — and the panes only re-dock on mouse-up
      (no preview). Fixed by adding `__EMSCRIPTEN__` to the
      `wxUSE_AUI_LIVE_RESIZE_ALWAYS` platform list (`src/aui/framemanager.cpp`),
      exactly as the existing comment intends ("not possible to show sash
      feedback, so always use live update"). The XOR hint path is now never
      taken: panes follow the cursor live, no stripes. KiCad untouched.
  33. The wasm mouse path (`src/wasm/app.cpp` `HandleMouseEvent`) only refreshed
      the cursor when the hovered *window* changed, from that window's static
      `GetCursor()`; it never dispatched `wxEVT_SET_CURSOR`. An AUI dock sash is
      painted inside the managed frame (not a child window), so `OnSetCursor`
      (which sets `wxCURSOR_SIZEWE`/`SIZENS`) was never consulted. Fixed by
      dispatching `wxSetCursorEvent` up the window chain on motion (like the
      native ports' `HandleSetCursor`) and applying the cursor only when a
      handler supplies one — so windows that manage their own cursor (the GAL
      canvas, plain controls, busy cursor) are untouched.

Tests: `tests/e2e/aui-resize.spec.ts` pins all three on the faithful surface
(`aui_test.cpp`'s default-flag `wxAuiManager`): hover→`ew-resize`, pane width
changes mid-drag (live), and a stipple-fraction scan of the drag region
(broken ~0.12, clean ~0.001; threshold 0.02). RED before the fix, GREEN after.
