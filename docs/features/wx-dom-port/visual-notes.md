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
