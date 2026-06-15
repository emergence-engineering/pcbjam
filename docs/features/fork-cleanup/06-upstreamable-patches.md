# 06 — Upstreamable patches

> Some of the diff is genuine bug fixes or standard portability guards that upstream KiCad /
> wxWidgets would plausibly accept. Once merged upstream, the divergence **disappears on the
> next submodule bump** — net-zero, and it's the right thing to do regardless. This doc is
> the submit list. Trim fork-specific comments (e.g. references to `features/…` paths) before
> sending.

## Submit-ready bug fixes

### RTree `ELEMTYPEREAL` overflow — `libs/kimath/src/geometry/shape_poly_set.cpp` (+9/−1)

`splitCollinearOutlines()` instantiated `RTree<intptr_t, intptr_t, 2, intptr_t>`. On wasm32
`intptr_t` is 32-bit, but `ELEMTYPEREAL` holds `sumOfSquares` values ~10¹⁴ → overflow → the
`rtree.h:1771` Classify assert fires on **every PCB load**. Every other KiCad RTree
instantiation already uses `double`. The fix is `intptr_t` → `double` for the
`ELEMTYPEREAL` template arg. This is an upstream typo, not a wasm issue — submit as-is.
(Recorded in the `rtree-intptr-overflow-fix` memory.)

### Default alternate hotkey never applied — `common/tool/action_manager.cpp` (+5)

`processHotKey` never copies `m_defaultHotKeyAlt` → `m_hotKeyAlt`, so `DefaultHotkeyAlt()` is
dead in default configs upstream. One-line fix (`aAction->m_hotKeyAlt = aAction->m_defaultHotKeyAlt;`).
Submit as a standalone bug fix. (Note: this is the real fix behind the Backspace-delete
behavior; see [03](03-config-not-code.md) §2.)

## Standard portability guards (no-ops for native builds)

These re-spell wasm-driven conditionals using the wx feature-test macros upstream already
honors, so they're harmless on native and make the wasm build correct:

- **`wxUSE_TOOLTIPS` guards** — `include/widgets/wx_dataviewctrl.h` (the
  `DoSetToolTipText() override` only exists when the base virtual does),
  `common/dialogs/dialog_paste_special.cpp`, `common/widgets/wx_infobar.cpp`,
  `pcbnew/dialogs/dialog_board_reannotate.cpp`. Re-spell the bare `#ifndef __EMSCRIPTEN__`
  variants (in the dialogs from [05](05-wx-layer-fixes.md) §4) to `#if wxUSE_TOOLTIPS` and
  submit the lot.
- **`wxUSE_FSWATCHER` guards** — `include/pcb_base_frame.h`, `pcbnew/pcb_base_frame.cpp`,
  `eeschema/sch_base_frame.cpp`/`.h` (watcher members + `setFPWatcher`/`OnFPChange` bodies).
  Standard feature test; upstream builds compile unchanged.
- **ngspice header guard** — `common/build_version.cpp` (+3) shouldn't require
  `<ngspice/sharedspice.h>` when SPICE is off; the version-print dispatch already has an
  `"unknown"` fallback. (`#ifdef KICAD_SPICE` would be even cleaner.)

## Output-correctness fixes

- **UTF-8 s-expr output** — `common/io/kicad/kicad_io_utils.cpp` (+2/−2):
  `Print("(%ls …)", aKey.wc_str())` → `Print("(%s …)", aKey.ToUTF8().data())`. `%ls`
  misbehaves in the wasm libc printf path; UTF-8 is strictly more correct for the format.
- **IWYU includes** — `gerbview/events_called_functions.cpp`, `gerbview/toolbars_gerber.cpp`,
  `gerbview/tools/gerbview_control.cpp` add `#include <wx/choice.h>` (transitively present on
  native ports, missing on wasm). Pure include hygiene.
- **wxUniv choice fixes** — `eeschema/dialogs/dialog_sim_command.cpp`
  (`IsEmpty()`→`GetCount()>0`), `pcbnew/dialogs/panel_setup_layers.cpp`
  (`GetCurrentSelection()`→`GetSelection()`), `dialog_board_reannotate.cpp`
  (`wxS(" ")`→`wxT(" ")` ternary-type fix). Correct on all ports.

## Feature proposals (larger, medium prospects)

- **Drawing-sheet item KIID** — the collab/yjs feature adds `KIID m_Uuid` to `DS_DATA_ITEM`
  and an optional `(uuid …)` token in `.kicad_wks` (`common/drawing_sheet/drawing_sheet.keywords`,
  `drawing_sheet_parser.cpp` +24, `ds_data_model_io.cpp` +4, `include/drawing_sheet/ds_data_item.h`
  +4). This is a real file-format change — no runtime hook can substitute (there's no
  drawing-sheet listener API upstream, and persistence is the point). But "give drawing-sheet
  items stable identity like every other `EDA_ITEM`" is a defensible upstream proposal, and
  the parser ignores-unknown so it's forward-compatible. If accepted, the format fork
  vanishes. (Related: [10](10-3d-viewer.md) has no bearing here; the collab hook itself is in
  `pl_editor_frame.cpp` and stays — see below.)
- **`python_scripting.h` header hygiene** — moving `#include <Python.h>` out of the header
  into the `.cpp` would dissolve the ~7 scripting include-gates across KiCad files
  (see [`../../../features/python/research.md`](../../../features/python/research.md)).
- **Plugin self-registration** — moving the `REGISTER_PLUGIN` statics into each plugin's own
  `.cpp` (the pattern `PCB_IO_MGR` half-uses) lets the importer exclusions in
  [08](08-importers.md) be pure CMake instead of `#ifndef` blocks in `sch_io_mgr.cpp` /
  `pcb_io_mgr.cpp`.

## Not worth proposing

- **Optional protobuf** — upstream explicitly keeps protobuf mandatory ("required even when
  the IPC API is not enabled … likely to be used in other applications in the future"). It
  doesn't matter anyway: our IPC-API gates are dead and get reverted ([01](01-revert-dead-code.md)).

## The one collab hook that has no upstream home

`pagelayout_editor/pl_editor_frame.cpp` (+15) calls `kicadCollabOnModify()` from
`OnModify()` under `__EMSCRIPTEN__`. There is **no** drawing-sheet listener/observer API
upstream (pcbnew uses `BOARD_LISTENER` with zero source hooks; eeschema has
`SCHEMATIC_LISTENER`; the drawing-sheet model has neither). So this hook genuinely stays —
though 11 of its 15 lines are comment and can be trimmed. The clean exit is proposing a
drawing-sheet `OnModify` notification upstream (low-medium prospect).
