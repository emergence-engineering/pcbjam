# wxWidgets DOM-port ↔ native parity fixes (`wxwidgets-diff`)

Six defects where the wxWidgets **WASM DOM port** diverges from native
wxWidgets (wxGTK), each found in a parity audit, reproduced with a failing
test, and fixed in the **wasm layer only** — no wxWidgets core file and no
KiCad source was changed.

The common root cause is the DOM port's two-sided design (see
[`../wx-dom-port/README.md`](../wx-dom-port/README.md)): every control is a real
HTML element mirrored from a C++ state cache. Most of these bugs are the two
sides drifting apart, or the port skipping something native wxWidgets does.

Status: **all six fixed and green** (2026-06-30), plus a **seventh fix, H-1**,
implemented and KiCad-verified (2026-07-03). **H-5**, **C-1**, and **H-1** are
additionally verified through real KiCad pcbnew dialogs (the Plot dialog, the
Track & Via Properties dialog, and the Page Settings dialog). Work lives on branch
`wxwidgets-diff` (root + wxwidgets submodule); not merged to `main`.

## The fixes

| # | Sev | Bug (native behavior → DOM-port bug) | Fix location |
|---|-----|---|---|
| **C-1** | Critical | `wxEVT_CHOICE`/`LISTBOX`/`COMBOBOX` selection events never attach per-item client data → `event.GetClientData()` is always NULL → KiCad's Track & Via Properties dialog dereferences NULL on a normal selection | `src/wasm/{choice,listbox,combobox}.cpp` — call `InitCommandEventWithItems(event, n)` |
| **H-4** | High | `wxTextCtrl::Clear()`/`Remove()` update only the C++ cache; the `<input>` keeps the old text (next keystroke resurrects it) | `src/wasm/textctrl.{h,cpp}` — override `Remove()` to push to the DOM (covers `Clear()`) |
| **H-5** | High | `wxCheckListBox` check marks wiped on every item rebuild — an `Append`-then-`Check` loop loses every check but the last | `include/wx/wasm/listbox.h`, `src/wasm/checklst.{h,cpp}` — virtual `WasmSyncSelection`, override to re-apply `m_itemsChecked` |
| **H-6** | High | `wxSlider` fires only `wxEVT_SLIDER`, never the `wxEVT_SCROLL_*` family → handlers bound only to the scroll family (KiCad colour picker) never run | `src/wasm/slider.cpp` — fire `THUMBTRACK`/`CHANGED`/`THUMBRELEASE` |
| **H-9** | High | `wxConfig` read-back truncates non-ASCII at the first multi-byte char (UTF-16 `.length` used as a UTF-8 byte budget) | `build/wasm/wx.js` — length helpers return UTF-8 byte length |
| **#36** | Medium | `wxStaticText` renders the mnemonic `&` literally (`&File` shows an `&`) | `src/wasm/stattext.cpp` — `RemoveMnemonics()` before the label push |

Plus a **seventh fix added later** (2026-07-03), a distinct audit finding that had
never been implemented — KiCad e2e only, no standalone repro:

| # | Sev | Bug (native behavior → DOM-port bug) | Fix location |
|---|-----|---|---|
| **H-1** | High | `wxDialog::ShowModal` never created a `wxWindowDisabler`, so a "modal" dialog left the parent editor frame fully input-live (menubar/toolbar/canvas keep firing) | `src/wasm/dialog.cpp` — `new wxWindowDisabler(this)` in `ShowModal` (the upstream-univ mechanism the port had dropped) |

Plus a **test-harness fix**: `tests/apps/Makefile.wasm` exports `stringToNewUTF8`
(the DOM string-read bridge needs it; the production build gets it via embind
`--bind`, the standalone apps don't).

## Two test layers

1. **Standalone wxWidgets e2e** — one tiny WASM app per bug under
   `tests/apps/standalone/`, driven by `tests/e2e/parity-audit.spec.ts`. Each app
   isolates the exact buggy path and self-reports `[REPRO] <name>: PASS/FAIL` (or
   exposes live DOM state). All six are red before the fix, green after.
2. **KiCad e2e (product proof)** — three specs drive real pcbnew dialogs:
   `tests/kicad/plot-checklist.spec.ts` (the Plot dialog's layer checklist) for
   **H-5**, `tests/kicad/via-clientdata.spec.ts` (the Track & Via Properties
   dialog's predefined-via-size choice) for **C-1**, and
   `tests/kicad/modal-input-lock.spec.ts` (the Page Settings dialog disabling the
   main frame) for **H-1**. See
   [`kicad-e2e-reachability.md`](kicad-e2e-reachability.md) for why the other four
   of the original six resist a clean KiCad e2e — and why H-1's test must use a
   *real*-modal dialog (Page Settings), not a quasi-modal one (Plot / Track & Via
   already disable the parent via KiCad's own `WINDOW_DISABLER`).

See [`redgreen.md`](redgreen.md) for the exact measured red→green ledger.

## Build & run

```bash
# 1. Build the patched wxWidgets (standalone) and the repro apps
./scripts/build-wx-wasm.sh
cd tests/apps && make -f Makefile.wasm parity-repros stattext-ellipsize && cd ../..

# 2. Standalone parity tests
cd tests && npx playwright test e2e/parity-audit.spec.ts

# 3. KiCad e2e for H-5 (needs a pcbnew build)
BINARYEN_OPT_LEVEL=-O1 ./docker/build.sh pcbnew   # -O1: never -O2
cd tests && npm run setup:kicad
npx playwright test --config=playwright-kicad.config.ts --project=chromium --headed kicad/plot-checklist.spec.ts
```

## Files

- Fixes: `wxwidgets/{src/wasm/*.cpp, include/wx/wasm/*.h, build/wasm/wx.js}` (11 files).
- Standalone repros: `tests/apps/standalone/{selevent-clientdata,textctrl-clear,checklist-checks,slider-scroll,config-utf8,stattext-mnemonic}/`.
- H-1 fix: `wxwidgets/src/wasm/dialog.cpp` (`wxWindowDisabler` in `ShowModal`).
- Specs: `tests/e2e/parity-audit.spec.ts`; KiCad e2e `tests/kicad/{plot-checklist,via-clientdata,modal-input-lock}.spec.ts`.
- Patches snapshot: `features/wxwidgets-diff/{root,wxwidgets}.patch`.
