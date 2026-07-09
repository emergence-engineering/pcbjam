# KiCad e2e reachability of the parity bugs

All six fixes are proven red→green by the **standalone** wxWidgets e2e tests. A
separate question is which can *also* be reproduced through a **real KiCad app**
as a product-level e2e test. This documents that investigation (done against a
live pcbnew build) so nobody has to re-derive it.

**Answer:** **H-5**, **C-1**, and **H-1** have product-level KiCad e2e proofs
(`tests/kicad/plot-checklist.spec.ts`, `tests/kicad/via-clientdata.spec.ts`,
`tests/kicad/modal-input-lock.spec.ts`). The remaining four of the original six
each have a specific, verified blocker.

> **Update (2026-07-01):** C-1 was originally logged here as "Blocked-ish". That
> was overcautious — it *is* reachable and cleanly DOM-assertable. See the C-1 row
> and "How C-1 is reproduced" below.
>
> **Update (2026-07-03):** **H-1** (a separate audit finding, not one of the six —
> "modal dialogs are not input-modal") was **implemented** and given a KiCad e2e.
> The audit called it unsurfaceable ("e2e tests drive only the dialog"); it isn't.
> See "How H-1 is reproduced" below — the catch is that most KiCad dialogs are
> *quasi-modal* and already disable the parent, so the test must pick a real
> `wxDialog::ShowModal` dialog (Page Settings).

## Which pcbnew dialogs actually open in WASM

Probed by driving the File menu and inspecting the DOM:

| Dialog | Opens? | Notable widgets seen |
|---|---|---|
| **Plot** (`File → Plot…`) | ✅ | `wxCheckListBox` (48 layer rows), choices, text fields |
| **Print** (`File → Print…`) | ✅ | `wxCheckListBox`, `m_colorTheme` `wxChoice` with client data |
| **Board Setup** (`File → Board Setup…`) | ✅ | 13 choices, 28 text fields (treebook of panels) |
| **Page Settings** (`File → Page Settings…`) | ✅ | 16-opt page-size choice, ~21 title-block text fields |
| **Colour picker** (swatch → picker) | ❌ | does not open in WASM (blocks H-6 via that path) |

Menus (menubar + popups) are always present.

## Per-bug verdict

| Bug | Reachable surface | Cleanly assertable? | Verdict |
|---|---|---|---|
| **H-5** checklist | Plot dialog ✅ | ✅ count checked `[data-wx-check-list] input:checked` | **DONE** — `tests/kicad/plot-checklist.spec.ts` |
| **C-1** client-data | Track & Via Properties dialog | ✅ Via-diameter field value | **DONE** — `tests/kicad/via-clientdata.spec.ts`. Print's `m_colorTheme` is read via the *control* (`GetClientData(n)`), not the event, so it does *not* exercise C-1; the via dialog's `onViaSelect` is the one true event-path consumer (an exhaustive tree sweep found exactly one). |
| **#30** caret/`SelectAll` | UNIT_BINDER numeric fields (everywhere) | ✅ `input.selectionStart/End` | **Fragile**: KiCad only calls `SelectAll()` on *indeterminate multi-select* or *validation error* (`unit_binder.cpp:233,302,395,410`) — not on plain focus. Needs a specific multi-select or out-of-range setup. This one is *unfixed* (deferred backlog) so it would be RED on the current build (1 build to fix). |
| **H-6** slider | Appearance panel's 6 `STEPPED_SLIDER` opacity sliders (always visible) | ❌ effect is a **canvas opacity change** | **Blocked**: only assertable by canvas pixel-diff (inherently flaky) — same problem as the colour picker. |
| **#36** stattext `&` | — | ✅ span text | **Unreachable**: KiCad `&` mnemonics are on buttons/menu items, **not `wxStaticText`**. No `&` static label in any dialog that opens (Plot/Print/Page Settings all checked). |
| **H-4** textctrl Clear | needs a dialog with Clear/Reset on a text field | ✅ input value | **No clean surface found** in the dialogs that open. |
| **H-9** config UTF-8 | — | — | **Unreachable**: no UI action writes then reads back a non-ASCII config value. |

## Why H-5 works where Print's checklist doesn't

The bug only manifests when `Append` and `Check` are **interleaved** in one loop:
each `Append` rebuilds the DOM rows unchecked, so a `Check` from an earlier
iteration is wiped by a later `Append`.

- **Plot** (`dialog_plot.cpp:351-354`): `int i = Append(name); if(sel) Check(i);`
  in one loop → interleaved → **bug manifests** (0 of 48 checked).
- **Print** (`dialog_print_pcbnew.cpp:118` then `:156`): appends *all* layers in
  the constructor, then checks selected layers in a *separate* loop in
  `TransferDataToWindow()` → no `Append` after the `Check`s → **bug does not
  manifest**.

So Print is not a valid second H-5 surface — a useful confirmation that the fix's
trigger is understood precisely.

## How C-1 is reproduced (`tests/kicad/via-clientdata.spec.ts`)

The perceived fragility came from two assumptions that turned out to be avoidable:

- **"needs a configured predefined via size"** — true, but the list is seeded
  straight from the board file: `(setup (user_via <dia_mm> <drill_mm>) …)` populates
  `m_ViasDimensionsList` (`pcb_io_kicad_sexpr_parser.cpp:2585`), so the dialog's
  `m_predefinedViaSizesCtrl` choice is pre-filled on load — no Board Setup clicks.
- **"needs board + via + fragile 5-step canvas interaction"** — the board contains
  *only* the via, so **Edit → Select All (Ctrl+A)** selects exactly the via (which
  satisfies the tracks/vias-only condition `EDIT_TOOL::Properties` requires) with no
  canvas-pixel math. Press **E** to open the dialog.

The rest is a clean DOM assertion. The via's own diameter is `0.7 mm` (distinct from
the two predefined sizes and from 0). Picking predefined `"0.9 / 0.45"` fires the
`<select>` `change` → `wxChoice::OnDomEvent` → `onViaSelect`, which reads
`event.GetClientData()`:

- **GREEN (fixed):** the Via-diameter `<input>` goes `0.7 → 0.9`.
- **RED (bug):** `GetClientData()` is NULL, so `viaDimension->m_Diameter` reads 0 →
  the field goes `0.7 → 0` (memory `wasm-null-deref-reads-zero`).

The symptom is *silent wrong values*, not a crash — so the assertion is the field
value, plus a WASM-abort guard for the (rarer) trap case.

## How H-1 is reproduced (`tests/kicad/modal-input-lock.spec.ts`)

H-1: `wxDialog::ShowModal` never created a `wxWindowDisabler`, so a "modal" dialog
left the parent editor frame fully input-live. The audit deemed this unsurfaceable
by e2e ("e2e tests drive only the dialog"). Two facts make it surfaceable — and one
made the first attempt a false green:

- **Signal.** Disabling the parent frame flips its `IsEnabled()`, and the port
  re-emits `enabled` into `window.wxElementRegistry` on every `DoEnable()`
  (`window.cpp:1438`). So the pcbnew main frame's registry entry flips
  `enabled: true → false` the instant a real modal opens — and that same
  `IsEnabled()` walk is exactly what every input gate consults. The test just reads
  `registry.getElement(<PcbFrame id>).enabled` before / during / after the modal.
- **Dialog choice is load-bearing** (the trap). Most KiCad dialogs are opened via
  KiCad's **`ShowQuasiModal()`**, which runs its own nested loop and *already*
  creates a `WINDOW_DISABLER(parent)` (`dialog_shim.cpp:1431`) — so the parent is
  disabled with or without the wx fix. **Plot** (`board_editor_control.cpp:565`) and
  **Track & Via Properties** (`edit_tool.cpp:2306`) are both quasi-modal: driving
  Plot on the *unpatched* binary already reported the frame disabled (a false green
  that flushed this out). The test therefore drives **Page Settings**, shown via a
  *real* `wxDialog::ShowModal()` (`board_editor_control.cpp:534`; `DIALOG_SHIM::ShowModal`
  forwards straight through, adding no disabler of its own). So H-1's real user
  impact in KiCad is limited to the real-`ShowModal` dialogs.

Measured RED (frame `enabled` stays `true` while Page Settings is open → fail) /
GREEN (`false` while open, `true` after close → pass); see `redgreen.md`. Residual:
a menubar dropdown still *visually* opens over the modal (pure-JS popup, no C++
gate) though its items do nothing — cosmetic, would need a DOM shield, out of scope.

## Recommendation

The cleanly-reachable Critical/High surfaces now have product-level proofs:
**H-5** (`plot-checklist.spec.ts`), **C-1** (`via-clientdata.spec.ts`), and **H-1**
(`modal-input-lock.spec.ts`, which also *implemented* the fix). The remaining four
of the original six are best left to the standalone suite (their KiCad surfaces need
a validation-error setup, a canvas pixel-diff, or don't exist — see the table).
