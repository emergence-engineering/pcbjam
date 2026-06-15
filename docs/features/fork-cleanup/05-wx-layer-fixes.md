# 05 — Fix in the wxWidgets wasm port, not in KiCad

> Several KiCad-side `#ifdef __EMSCRIPTEN__` patches work around quirks of the wxUniversal /
> wasm port. The project rule is to fix wasm-only bugs **in the wasm layer**. Moving these
> into the `wxwidgets` fork's wasm port removes the KiCad divergence — and in the tooltip
> case, *re-enables a whole class of UI*. The wx wasm port is the sanctioned place for this
> work, so these don't count against the "minimize upstream edits" goal the way KiCad edits do.

## 1. HiDPI scale factor — currently changes native behavior

`common/gal/hidpi_gl_canvas.cpp` (+2/−2) changes `GetScaleFactor()` from
`GetContentScaleFactor()` to `GetDPIScaleFactor()` **unconditionally** — and those two
differ on MSW, so this silently alters native Windows builds (see
[07](07-native-build-bugs-and-tooling.md)). Likewise `pcbnew/widgets/appearance_controls.cpp`
(+4/−1) swaps `GetScaleFactor()`→`GetContentScaleFactor()` in `GetBestSize()`.

**Do:** implement `GetContentScaleFactor()` correctly (devicePixelRatio) in the wx wasm port
and revert both KiCad edits.

## 2. `GetCurrentSelection()` on wxUniversal choices

`common/eda_draw_frame.cpp` (+8), `pcbnew/dialogs/panel_setup_layers.cpp` (+2/−2),
`eeschema/dialogs/dialog_sim_command.cpp` (+1/−1) work around wxUniversal's
wxChoice/wxComboBox where `GetCurrentSelection()` / `IsEmpty()` misbehave, by substituting
`GetSelection()` / `GetCount()`.

**Do:** make `GetCurrentSelection()` delegate to `GetSelection()` in the wxUniv/wasm layer —
removes all of these at once. (Some of these are also upstream-friendly as plain wx fixes;
see [06](06-upstreamable-patches.md).)

## 3. Header self-sufficiency

`include/gal/hidpi_gl_canvas.h` (+1) adds `#include <wx/window.h>` before `wx/glcanvas.h`
because the wx wasm port's `glcanvas.h` isn't self-sufficient.

**Do:** fix the include self-sufficiency in the wx wasm port's `glcanvas.h`; revert the
KiCad include. (Trivially upstreamable as header hygiene either way.)

## 4. Tooltips — implement `wxToolTip` in the wasm port (this re-enables a feature)

`wxUSE_TOOLTIPS` is **0** in the generated wasm setup.h because upstream wxWidgets configure
hard-disables tooltips for wxUniversal ("wxTooltip not supported yet in wxUniversal",
`wxwidgets/configure.in:7316`) — there is no `src/univ/tooltip.cpp`. KiCad carries ~12 files
of `wxUSE_TOOLTIPS` guards / `#ifndef __EMSCRIPTEN__ wxToolTip::Enable` to cope.

**Do (porting task, 2–4 days, in the wx fork):** add `src/wasm/tooltip.cpp` +
`include/wx/wasm/tooltip.h` — a generic tooltip (hover timer + a `wxTipWindow`/`wxPopupWindow`
near the pointer; popups are already proven working per `tests/WHATWORKS.md`), patch the
configure gate for the wasm port, regen configure, wire into the makefiles.

**Then, KiCad-side, this becomes pure deletion:**

- Remove `#ifndef __EMSCRIPTEN__` around `wxToolTip::Enable(...)` in
  `common/pgm_base.cpp`, `common/dialogs/dialog_design_block_properties.cpp`,
  `eeschema/dialogs/dialog_sheet_properties.cpp`, `eeschema/dialogs/dialog_symbol_properties.cpp`.
- The `#if wxUSE_TOOLTIPS` guards (`include/widgets/wx_dataviewctrl.h`,
  `common/dialogs/dialog_paste_special.cpp`, `common/widgets/wx_infobar.cpp`,
  `pcbnew/dialogs/dialog_board_reannotate.cpp`, `include/pcb_base_frame.h`) auto-activate —
  and can be dropped as fork diff, ~8 files reclaimed.

Big UX win: every `SetToolTip(...)` in KiCad lights up. (The interim upstream-friendly move
is to re-spell the bare `#ifndef __EMSCRIPTEN__` guards as `#if wxUSE_TOOLTIPS` — see
[06](06-upstreamable-patches.md) — so they're correct regardless of when the wx work lands.)

## 5. Other wx-port-shaped items

- `common/pgm_base.cpp` `wxToolTip::Enable/SetAutoPop` under `#ifndef __EMSCRIPTEN__` — folds
  into §4, or provide a no-op `wxToolTip` in the port.
- `common/tool/actions.cpp` Backspace hotkey — handled by config in [03](03-config-not-code.md).
- `wxUSE_FSWATCHER` (off): leave off — MEMFS has no change notification and nothing edits
  files externally in a single-user browser. KiCad's `#if wxUSE_FSWATCHER` guards are
  upstream-friendly as-is (see [06](06-upstreamable-patches.md)).

## Net

| KiCad edit | wx-port fix | Removes |
|---|---|---|
| `hidpi_gl_canvas.cpp`, `appearance_controls.cpp` | `GetContentScaleFactor()` | 2 files + a native bug |
| `eda_draw_frame.cpp`, `panel_setup_layers.cpp`, `dialog_sim_command.cpp` | `GetCurrentSelection()` delegate | 3 files |
| `hidpi_gl_canvas.h` | self-sufficient `glcanvas.h` | 1 header |
| ~12 tooltip-guard files | `src/wasm/tooltip.cpp` | ~12 files **+ enables tooltips** |
