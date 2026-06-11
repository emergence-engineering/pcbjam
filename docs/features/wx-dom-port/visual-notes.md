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
