# wxWidgets WASM/DOM Port — Parity Audit vs Native (wxGTK)

*Definitive engineering report for the maintainer of an in-browser KiCad (PCBJam). 244 verified/carried findings folded with three inventory ground-truths (compiled-sources coverage map, setup.h honesty audit, DOM-bridge architecture). Every medium-and-above finding survived an adjudicator that read both the WASM and native/contract source; low items are carried (tagged).*

---

## 1. Executive summary

The wxWidgets WASM/DOM port is a real, broadly complete toolkit — not a thin shim. It is a genuine `TOOLKIT=WASM` build that compiles the full `GUI_CMN_SRC` set (grid, dataview, propgrid, AUI, STC, scrolled windows, all generic dialogs) into a 293-member core archive, plus 62 hand-written `src/wasm/*.cpp` port files, all verified present in the shipped `.a` files. The DOM-bridge design (three handle namespaces, fresh-entry event re-entry under an Asyncify-suspended stack, LIFO nested-modal pumps) is sound and is what makes in-browser KiCad work at all. **That said, real defects exist** — this is not a "zero findings" situation, and the prior report's "0 confirmed findings" headline was a tooling artifact, not the truth.

The gaps cluster into a small number of root causes rather than 244 independent bugs. The single highest-risk item is a **critical null-dereference crash**: selection command events (`wxEVT_CHOICE`/`wxEVT_COMBOBOX`/`wxEVT_LISTBOX`) are hand-rolled and never attach per-item client data, so KiCad's Track & Via Properties dialog traps the WASM module on a normal user action. The largest *class* of real gaps is **state desynchronization between C++ caches and the live DOM** — text-control caret/selection/clipboard, menu/toolbar enable-check-label staleness (no `wxEVT_MENU_OPEN`, `wxMenuItem` is a pure data stub), and check-list/radio state — where the C++ side is right but the user sees stale or wrong UI. A second structural class is **the Canvas2D backend lacking raster-ops and clip-box state** (XOR/`wxINVERT` no-op, `SetClippingRegion` silently ignored, masked/stretched blits broken). Beyond correctness, **modal dialogs are not input-modal** (no `wxWindowDisabler` is ever created), which is a genuine re-entrancy/use-after-free hazard on the Asyncify-parked stack. Rounding out the picture: partial event families (no horizontal wheel, no slider scroll-event family, no `wxEVT_CHAR` to validators), HiDPI quantized to {1×, 2×}, no working printing, accessibility essentially absent, and a `setup.h` that misrepresents the shipped configuration. None of the medium/low items are crashes; most are degraded-UX or latent. The honest verdict: **functionally usable and impressively far along, with one must-fix crash, a coherent set of attackable state-sync root causes, and a long tail of cosmetic/inherent-platform items.**

---

## 2. Severity scoreboard

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 11 (9 distinct after dedup: #11→#2, #12→#8) |
| Medium | 58 (≈50 distinct; inv-stub-todo #58–64,#69 duplicate higher items) |
| Low / carried | 174 |
| **Total** | **244** |

Dismissed/refuted candidates (not counted above): **11** (see §10).

### Subsystem × severity matrix

| Subsystem | Crit | High | Med | Low | Total |
|---|---:|---:|---:|---:|---:|
| choices-lists | 1 | 1 | 1 | 4 | 7 |
| textctrl | – | 2 | 3 | 3 | 8 |
| menus | – | 2 | 3 | 1 | 6 |
| dc-core | – | 1 | 3 | 7 | 11 |
| toplevel-frame-dialog | – | 1 | 2 | 3 | 6 |
| static-range (slider/static) | – | 1 | 1 | 7 | 9 |
| timer-config-settings | – | 1 | 4 | 3 | 8 |
| critic-uncovered | – | 2 | 1 | 2 | 5 |
| window-core | – | – | 3 | 4 | 7 |
| input | – | – | 3 | 9 | 12 |
| fonts | – | – | 3 | 4 | 7 |
| cc-accessibility | – | – | 3 | 5 | 8 |
| bitmap-image | – | – | 2 | 7 | 9 |
| gdi-resources | – | – | 2 | 2 | 4 |
| glcanvas | – | – | 2 | 6 | 8 |
| cc-hidpi-scaling | – | – | 2 | 1 | 3 |
| containers | – | – | 1 | 10 | 11 |
| clipboard-dnd | – | – | 1 | 6 | 7 |
| buttons | – | – | 1 | 6 | 7 |
| cc-printing | – | – | 1 | 4 | 5 |
| cc-net-ipc-process | – | – | 1 | 4 | 5 |
| cc-locale-mime-stdpaths-fs | – | – | – | 7 | 7 |
| tooltip-misc | – | – | – | 3 | 3 |
| app-eventloop | – | – | – | 8 | 8 |
| inv-known-limitations | – | – | 2 | 22 | 24 |
| inv-stub-todo | – | – | 13 | 36 | 49 |
| **Total** | **1** | **11** | **58** | **174** | **244** |

---

## 3. Critical & High findings

### C-1 — Selection command events carry no per-item client data → null-deref crash in KiCad (#1)
- **Severity:** Critical
- **Gap:** `wxEVT_CHOICE`/`wxEVT_COMBOBOX`/`wxEVT_LISTBOX` are constructed by hand and never call `InitCommandEventWithItems`/`SetClientData`/`SetClientObject`.
- **Evidence:** `src/wasm/choice.cpp:221-239` (sets only `SetInt`/`SetString`/`SetEventObject`), `src/wasm/combobox.cpp:107-127`, `src/wasm/listbox.cpp:289-321`. Native contract: `src/common/ctrlsub.cpp:276-302` (`InitCommandEventWithItems`/`SendSelectionChangedEvent` copy `GetClientObject(n)`/`GetClientData(n)`), `src/common/lboxcmn.cpp:186-201`; ports route through these (`src/gtk/choice.cpp:31-34`, `src/gtk/combobox.cpp:31-35`).
- **Native vs WASM:** Native always attaches the selected item's per-item client data to the event; the WASM hand-rolled events never do, so `event.GetClientData()/GetClientObject()` always return NULL.
- **Impact:** Any handler reading the event's client data gets NULL. `pcbnew/dialogs/dialog_track_via_properties.cpp:963-968 onViaSelect` does `static_cast<VIA_DIMENSION*>(aEvent.GetClientData())->m_Diameter` with no null guard → **null pointer dereference / WASM module trap** on a normal action (double-click a track/via, pick a predefined via size). The trap is unrecoverable.
- **KiCad relevance:** Confirmed crash path in a core, easily-reached pcbnew dialog (`dialog_track_via_properties_base.cpp:278/660` wires `wxEVT_COMMAND_CHOICE_SELECTED`; `:424/:525` populate via `Append(msg, viaDimension)`). All `Append(item, clientData)` + read-event-client-data handlers are equally affected.
- **Verifier note:** Confirmed on both sides; no base/generic/DOM/JS-shim path attaches the data because the WASM handlers bypass `SendSelectionChangedEvent`/`SendEvent`. Fix: replace the hand-rolled events with `SendSelectionChangedEvent(wxEVT_*)` (or call `InitCommandEventWithItems` before `HandleWindowEvent`).

---

### H-1 — Modal dialogs are not input-modal; no `wxWindowDisabler` is ever created (#2, merges #11)
- **Severity:** High
- **Gap:** `ShowModal()` never disables other top-level windows; the port replaces a file (`src/univ/dialog.cpp`) that did this in one line.
- **Evidence:** `src/wasm/dialog.cpp:270-302` (`ShowModal` = set flag, `Show(true)`, `startModal()`); `m_windowDisabler` is NULL-inited at `dialog.cpp:59`, `wxDELETE`d at `:157`, and **never `new`'d** (grep clean). Native: `src/univ/dialog.cpp:193 m_windowDisabler = new wxWindowDisabler(this)`; `wxWindowDisabler::DoDisable` (`src/common/utilscmn.cpp:1555`) disables every other shown TLW; wxGTK uses `gtk_window_set_modal` (`src/gtk/dialog.cpp:159`).
- **Native vs WASM:** Native locks input to the dialog until `EndModal`; WASM leaves the parent frame's menubar/toolbar/canvas/controls fully enabled. The gate that *would* block them — `domevents.cpp:94 if(!window->IsEnabled()) return;` and the `IsEnabled()` checks in `app.cpp:152/187/298/367` — never trips because nothing is disabled. There is also no DOM-level backdrop/`showModal()`/`pointer-events` shield (`wx.js` only does z-index stacking).
- **Impact:** While a "modal" dialog is parked under Asyncify the user can still click the GAL canvas (firing tools), menubar titles, and toolbar buttons → re-entrant dialog/tool invocation, editing the document behind a settings dialog, or `Close()`/`Destroy()` of the parent while a child's `ShowModal` frame is suspended → **use-after-free / crash**. This is exactly the nested/consecutive-modal Asyncify-corruption class the dialog.cpp comments warn about.
- **KiCad relevance:** Every modal dialog (Board Setup, Preferences, DRC, Plot, Net Classes…). e2e tests drive only the dialog, so they don't surface it.
- **Verifier note:** Confirmed; the enforcement machinery is wired and waiting — the one-line fix (create the disabler) would immediately engage the existing `IsEnabled()` guards. Related low items: focus is also not saved/restored across a modal (#186).
- **STATUS (2026-07-03):** FIXED — `wxwidgets/src/wasm/dialog.cpp` now does `m_windowDisabler = new wxWindowDisabler(this)` in `ShowModal`. Reproduced by a KiCad e2e (`tests/kicad/modal-input-lock.spec.ts`), measured RED (parent frame `enabled` stays `true` during a modal) → GREEN (`false`). Nuance this entry missed: the fix only changes behavior for *real* `wxDialog::ShowModal` dialogs (e.g. **Page Settings**). Most KiCad dialogs are opened via **`ShowQuasiModal()`**, which already disables the parent through KiCad's own `WINDOW_DISABLER` (`dialog_shim.cpp:1431`) — so "Plot / Board Setup / DRC…" listed above are *not* affected in practice (they were already input-modal). See `redgreen.md`.

---

### H-2 — `SetClippingRegion(x,y,w,h)` is a silent no-op (#3)
- **Severity:** High
- **Gap:** The rectangular DC clip reads clip members that the modern base class never populates, so the requested rectangle is never applied.
- **Evidence:** `src/wasm/dc.cpp:292-304` calls `wxDCImpl::DoSetClippingRegion(x,y,w,h)` then feeds `m_clipX1..m_clipY2` to JS `clipRect`. Base `src/common/dcbase.cpp:371-411` stores the box in `m_devClipX1..` (device units) and **never writes** `m_clipX1..` (ctor inits them to 0 at `:343`); `include/wx/dc.h:766` documents that the derived port must fill `m_clipX1..` itself (gtk/msw/qt/x11/dfb/dcpsg all do; wasm does not). JS `clipRect` (`wx.js:1194-1199`) treats `width<=0` as "uninitialized" and resets the clip to the full context.
- **Native vs WASM:** GTK applies the intersected rectangle as a real GC clip; WASM passes `clipRect(id, 0,0,0,0)` → clip reset to whole context.
- **Impact:** Every `wxDC`-level rectangular clip is ignored → silent overdraw/text bleed. (The `wxRegion` overload works; only the `(x,y,w,h)` coordinate overload is broken.)
- **KiCad relevance:** `wxGrid` cells, generic `wxDataViewCtrl`/`wxPropertyGrid` renderers, AUI tab/caption art, owner-drawn controls — all compiled-in and reachable; e.g. long cell text bleeds into neighbors.
- **Verifier note:** Confirmed; `m_clipX1` is only ever read in `src/wasm`, written nowhere. Fix: populate `m_clipX1..m_clipY2` in the port (as the other ports do).
- **STATUS (2026-07-03):** FIXED — `wxwidgets/src/wasm/dc.cpp` `DoSetClippingRegion` now mirrors the base's device-unit clip box back into `m_clipX1..m_clipY2` via `DoGetClippingRect()` (and `DestroyClippingRegion` chains to the base). Reproduced by a KiCad e2e (`tests/kicad/grid-clip-bleed.spec.ts`): Board Setup → Net Classes, 70-char netclass name next to an empty Clearance cell; measured RED (325 ink pixels bleeding across the neighbor) → GREEN (0, text clipped at the cell edge; name-cell ink identical 413/413). Nuance this entry missed: the *Text Variables* grid can't repro it — `WX_GRID::SetupColumnAutosizer` auto-fits the column to its content, masking the missing clip; Net Classes has fixed widths. See `redgreen.md`.

---

### H-3 — Text-control caret/selection accessors return a stale cache reset to 0 on every keystroke (#4, merges #62)
- **Severity:** High
- **Gap:** `GetInsertionPoint`/`GetSelection`/`GetStringSelection`/`HasSelection` return a pure C++ cache that is hard-reset to 0 on each typed character and never reads the real DOM caret/selection.
- **Evidence:** `src/wasm/textentry.cpp:139-143` (`GetInsertionPoint`), `:180-199` (`GetSelection`); reset path `textctrl.cpp:109-120` (`OnDomEvent` INPUT) → `textentry.cpp:220-232` (`DoSetValue` sets `m_insertionPoint=0`, `m_selectionStart/End=-1`). There is **no DOM bridge** to read `selectionStart/selectionEnd` (grep of `dom.h`/`wx-dom.js` returns nothing). Native: `src/gtk/textentry.cpp:771-774` (`gtk_editable_get_position`), `:818-843` (`gtk_editable_get_selection_bounds`).
- **Native vs WASM:** GTK queries the live widget; WASM returns cache that is wrong after any typing or mouse/arrow caret move.
- **Impact:** After typing `abc` (DOM caret at 3) `GetInsertionPoint()` returns 0 and `GetSelection()` returns (0,0). Because `CanCopy/CanCut` are built on `HasSelection()` (`textentrycmn.cpp:303-311`), Edit-menu Copy/Cut enable state is also wrong; insert-at-cursor lands at 0 (see H-4/#31).
- **KiCad relevance:** Pervasive — live-filter/eval `EVT_TEXT` handlers, select-on-focus, clipboard-UI enable logic. Degraded, not crashing (native browser editing still works visually).
- **Verifier note:** Confirmed; the only DOM mirror is value (`wxDomGetValue/SetValue`). No selection read-back exists anywhere in the port.
- **STATUS (2026-07-06):** FIXED (covers #30 SetSelection/SelectAll-not-pushed and #31 WriteText-at-stale-caret). Added a DOM caret/selection bridge — `wxDomGetSelectionStart/End` + `wxDomSetSelection` in `include/wx/wasm/private/dom.h` + `build/wasm/wx-dom.js` — and made `src/wasm/textentry.cpp` live-read/write it (cache fallback pre-Create); `WriteText` now inserts at the live caret. **Required a one-line KiCad change too:** `SelectAllInTextCtrls`'s `SelectAll()` was gated `#if defined(__WXMAC__)||defined(__WXMSW__)` (`common/dialog_shim.cpp:901`) and thus compiled out for the wasm toolkit — widened with `|| defined(__WXWASM__)`. Reproduced by a KiCad e2e (`tests/kicad/dialog-select-on-open.spec.ts`): Track Properties opens with the width field focused + pre-filled `0.25`, typing `5` measured RED `"0.255"` (inserted) → GREEN `"5"` (replaced). Read-path proven by the standalone `textsel` app (no KiCad-observable consumer). Load-bearing nuance: a `setSelectionRange` on a *blurred* input is dropped on the next focus, so `wxDomSetSelection` registers a one-shot focus listener to re-apply it — matching KiCad's select-then-focus order. See `redgreen.md`.

---

### H-4 — `Remove()`/`Clear()`/`RemoveSelection()` update the C++ value cache but never push to the DOM → visible text desync (#5, merges #60)
- **Severity:** High
- **Gap:** Base `wxTextEntry::Remove` erases `m_value` only; `wxTextCtrl` does not override `Remove`/`Clear`, so `wxDomSetValue` is never called.
- **Evidence:** `src/wasm/textentry.cpp:73-93` (`// TODO(dom-phase-2): mirror the new value into the DOM element.`); `include/wx/wasm/textctrl.h` overrides only `WriteText`/`OnDomEvent`/`DoSetValue`. Native: `src/gtk/textentry.cpp:695-698` (`gtk_editable_delete_text`); base `Clear(){Remove(0,-1);}` (`wx/textentry.h:60`).
- **Native vs WASM:** GTK visibly empties/shortens the control; WASM leaves the `<input>/<textarea>` showing the OLD text while `GetValue()` returns the new (shorter) text. On the next keystroke `OnDomEvent` reads the stale DOM value and the deletion is silently resurrected.
- **Impact:** `textCtrl->Clear()` empties the cache but the field still shows old text (clearing a search/filter box or log control); `RemoveSelection`/`Remove(from,to)` likewise desync. (`Replace()` happens to recover because it ends in `WriteText`, which pushes `GetValue()`.)
- **KiCad relevance:** `Clear()` on search/log/report controls is widely used; the field not clearing is a real user-visible bug. `combobox.cpp:156 wxTextEntry::Clear()` shares it.
- **Verifier note:** Confirmed; `WriteText`/`DoSetValue` DO push, proving the pattern — only the delete paths were missed.

---

### H-5 — `wxCheckListBox` check marks are wiped on every item-list rebuild (#6)
- **Severity:** High
- **Gap:** Any `Append/Insert/Delete/SetString` rebuilds all checkbox rows (unchecked) then re-applies the *selection* array, never `m_itemsChecked`.
- **Evidence:** `src/wasm/listbox.cpp:89-98` (`WasmSyncItems` → `wxDomSetItems` rebuild + `WasmSyncSelection`), `:100-108` (`WasmSyncSelection` pushes `m_itemsSelected`, never `m_itemsChecked`); `checklst.cpp` does not override `WasmSyncItems`; `wx-dom.js:715-733` rebuilds all rows unchecked; `wx-dom.js:770-772` makes selection and checked map to the same DOM boolean. Native: `src/gtk/checklst.cpp:119-136` sets the model's check column in place; `src/gtk/listbox.cpp:445-464` inserts one row preserving others.
- **Native vs WASM:** Native modifies only the touched row; WASM destroys all check marks on every list mutation. The C++ cache stays correct, but the DOM is wrong.
- **Impact:** The canonical KiCad pattern is an Append-then-Check loop, so every `Check` before the final `Append` is wiped: `dialog_plot.cpp:321-327` (`int i=Append(name); if(...) Check(i);`) → the Plot/Print layer checklists display all-but-the-last layer unchecked even though plotting uses the correct cache. `DoSetSelection` on a checklist also erroneously toggles checkboxes.
- **KiCad relevance:** `dialog_plot`, `dialog_print_pcbnew`, `dialog_print_gerbview`, `dialog_change_symbols`, `dialog_update_symbol_fields`, `dialog_sim_command`. Core layer-selection checklists are visibly wrong.
- **Verifier note:** Confirmed; visual-only (data cache correct) but pervasive and defeats the widget's purpose. Fix: re-apply `m_itemsChecked` after a rebuild and keep selection separate from checkbox state.

---

### H-6 — `wxSlider` fires only `wxEVT_SLIDER`, never the `wxEVT_SCROLL_*` family (#7, ties #220)
- **Severity:** High
- **Gap:** On `INPUT` the slider builds only `wxEVT_SLIDER`; the entire scroll-event family is unimplemented (explicit TODO).
- **Evidence:** `src/wasm/slider.cpp:130-149` (`TODO(dom-phase-3): also fire the wxScrollEvent family (THUMBTRACK/THUMBRELEASE/CHANGED)` at `:143`). Native: `src/gtk/slider.cpp:35-66` fires the specific `wxEVT_SCROLL_*` then `wxEVT_SCROLL_CHANGED` then `wxEVT_SLIDER`.
- **Native vs WASM:** Native sends the full scroll family plus the command event; WASM sends only the command event.
- **Impact:** **Concrete breakage:** `common/dialogs/dialog_color_picker_base.cpp:234-251` connects the brightness AND transparency sliders *exclusively* to `wxEVT_SCROLL_*` (→ `OnChangeBrightness`/`OnChangeAlpha`); in WASM dragging those sliders does nothing — brightness/alpha never update. Also affects `STEPPED_SLIDER::OnScroll`, `footprint_diff_widget::onSlider`, `PANEL_CABLE_SIZE::onUpdateCurrentDensity`. Sliders bound to `wxEVT_SLIDER` (e.g. `ZOOM_CORRECTION_CTRL`) still work.
- **KiCad relevance:** Color picker is a core, commonly-used dialog.
- **Verifier note:** Confirmed; documented-TODO does not mitigate the functional gap. Compounded by `wxSL_INVERSE`/`wxSL_LABELS` not honored (#136/#137 — but see #136 correction: value mapping is correct, only visual orientation/labels are lost).
- **STATUS (2026-07-06):** FIXED — `wxwidgets/src/wasm/slider.cpp` now fires `wxEVT_SCROLL_THUMBTRACK`+`wxEVT_SCROLL_CHANGED` on `input` and `wxEVT_SCROLL_THUMBRELEASE` on `change`, before `wxEVT_SLIDER`. Product-proven by a KiCad e2e (`tests/kicad/calc-slider-scroll.spec.ts`) on a surface this entry's reachability analysis missed: the **PCB Calculator → Cable Size** current-density slider (`m_slCurrentDensity`) is wired *only* to `wxEVT_SCROLL_*` → `onUpdateCurrentDensity`, which recomputes the **Ampacity** text field — a deterministic, non-pixel effect (unlike the colour picker, which doesn't open in wasm). Measured RED (0 output fields change) → GREEN (Ampacity recomputes). The calculator is a separate `docker/build.sh calculator` target. See `redgreen.md`.

---

### H-7 — Menu enable/check/label and dynamic submenus go stale: no `wxEVT_MENU_OPEN`, `wxMenuItem` is a pure data stub, idle `DoMenuUpdates` never re-pushes to DOM (#8, merges #12, #69; ties #142)
- **Severity:** High
- **Gap:** Three reinforcing defects with one root: live UpdateUI state never reaches the DOM menubar.
- **Evidence:** `wxMenuBar::OnDomEvent` (`src/wasm/menu.cpp:293-320`) handles only the click case; it never emits `wxEVT_MENU_OPEN/CLOSE/HIGHLIGHT` (grep clean). `WasmRebuildMenus()` is called only on structural mutations and checkable-click (`menu.cpp:28,172,185,197,209,250,314`), never on idle/open. `wxMenuItem` is a pure data stub with no `Enable/Check/SetItemLabel` override (`include/wx/wasm/menuitem.h:14-26`, `src/wasm/menuitem.cpp:35-41`), so the base setters only mutate C++ fields. JS opens the popup from the cached `m.items` snapshot (`wx-dom.js:1107-1144`) with no callback into C++. `wxUSE_IDLEMENUUPDATES=1` for WASM (`include/wx/platform.h:533-538`), so `wxFrameBase::OnInternalIdle → DoMenuUpdates → wxMenu::UpdateUI` runs (`framecmn.cpp:362-369`) and refreshes C++ item state — but never calls `WasmRebuildMenus`, so it is never serialized to the DOM. Native: `src/gtk/menu.cpp:823-829` fires `wxEVT_MENU_OPEN`, `framecmn.cpp:330-339` runs `DoMenuUpdates` before display, item `Check/Enable` reflect live via `gtk_*` (`gtk/menu.cpp:776-807`).
- **Native vs WASM:** Native refreshes (and shows) item enable/check/label just-in-time on open; WASM shows whatever was current at the last structural rebuild or checkable toggle.
- **Impact:** Menu items keep construction-time enable/check state across the app: Undo/Redo greying, unit/grid radio checks, layer toggles, "Open Recent" lists, etc. are stale or empty. Dynamic submenus built on open are never populated.
- **KiCad relevance:** Severe. `EDA_BASE_FRAME` binds `EVT_MENU_OPEN` (`eda_base_frame.cpp:126`); `ACTION_MENU::OnMenuEvent` runs `ACTIONS::updateMenu` only on `wxEVT_MENU_OPEN` (`action_menu.cpp:422-434`); `TOOL_DISPATCHER` keys off it (`tool_dispatcher.cpp:615`). With the event never fired, KiCad's entire menu enable/check refresh is dead.
- **Verifier note:** Confirmed on both sides. Partial masking: any structural rebuild incidentally flushes accumulated idle updates, but between such events the state is genuinely stale. The minimal fix is to emit `wxEVT_MENU_OPEN` from the JS title-click → C++ and re-serialize via `WasmRebuildMenus` after `UpdateUI`.
- **STATUS (2026-07-06):** FIXED (the menu-open refresh; `wxMenuItem`-stub and idle-serialize sub-items are subsumed). A new `wx_dom_menu_open` export → `wxMenuBar::WasmOnMenuOpen` (`src/wasm/{domevents,menu}.cpp`, `include/wx/wasm/menu.h`) fires `wxEVT_MENU_OPEN` via `wxMenu::ProcessMenuEvent` (reaching `ACTION_MENU::OnMenuEvent`), runs `menu->UpdateUI()`, and serializes fresh items; the JS title-click (`build/wasm/wx-dom.js`) calls it before opening the popup. Two mechanics the entry didn't anticipate: (1) `updateMenu` **Asyncify-suspends**, so a returned string is lost — C++ pushes the fresh JSON via `EM_ASM` and JS calls with `{async:true}`+`await`; (2) menubar ACTION_MENUs never `ClearDirty`, so `m_dirty` stays true and every open refreshes. KiCad e2e `tests/kicad/menu-undo-stale.spec.ts`: Edit▸Undo measured RED (frozen `enabled=true` on an empty undo stack) → GREEN (`false` empty-stack, `true` after an undoable move). Menu-opening regressions stay green. See `redgreen.md`.

---

### H-8 — Context-menu `DoPopupMenu` does not run UpdateUI or fire `wxEVT_MENU_OPEN` before showing (#9)
- **Severity:** High
- **Gap:** Right-click menus are serialized once and shown without a UpdateUI pass or menu-open event.
- **Evidence:** `src/wasm/window.cpp:727-762` (`WasmItemsToJson()` once at `:733`, shown via the `wxShowContextMenu` pump; no `menu->UpdateUI()`, no `wxEVT_MENU_OPEN/CLOSE`). Native: `src/common/wincmn.cpp:3067-3082` delegates to the port; wxMSW `DoPopupMenu` calls `menu->UpdateUI()`; wxGTK fires `wxEVT_MENU_OPEN` via `menu_map`/`can_activate_accel` (`gtk/menu.cpp:848-854`).
- **Native vs WASM:** Native updates item enable/check just before popping; WASM shows item states frozen at menu-build time.
- **Impact:** Right-click/context menus show stale enable/check; plain wx apps relying on `EVT_UPDATE_UI` get wrong states.
- **KiCad relevance:** High — KiCad context menus (`TOOL_MENU`/`ACTION_MENU`) depend on `wxEVT_MENU_OPEN → updateMenu` to populate/enable items (`action_menu.cpp:422-434`). KiCad partially mitigates via `CONDITIONAL_MENU::Evaluate` before `PopupMenu` in some tools (`selection_tool.cpp:99`, `tool_menu.cpp:59`), reducing but not eliminating the gap.
- **Verifier note:** Confirmed; same root as H-7. The DOM/JS shim only returns the chosen id; no UpdateUI pass runs for popups.
- **STATUS (2026-07-07):** FIXED — `wxwidgets/src/wasm/window.cpp` `DoPopupMenu` now fires `wxEVT_MENU_OPEN` via `wxMenu::ProcessMenuEvent` and runs `menu->UpdateUI()` before serializing the popup (mirrors `wxMenuBar::WasmOnMenuOpen`). KiCad e2e `tests/kicad/contextmenu-fresh.spec.ts`: the pcbnew **Measure tool** right-click menu uses the no-arg `TOOL_MENU::ShowContextMenu()` (`pcb_viewer_tools.cpp:441`) — the one overload that only `SetDirty()`s and is *not* pre-`Evaluate()`d in C++ (contrast `ShowContextMenu(SELECTION&)`, `tool_menu.cpp:57`, which runs `Evaluate()`+`UpdateAll()` and masks the bug for the selection menu). Because a `CONDITIONAL_MENU`'s items don't exist until `Evaluate()` runs, the RED symptom is an **empty popup** (0 items), not a stale bit. Measured RED (measure menu `[]`, selection-menu control `["…","Zoom","Grid"]`) → GREEN (measure menu `["Cancel","Copy","Zoom","Grid"]`); regressions (`contextmenu-scrollbar-pcbnew`, `menu-undo-stale`) stay green. See `redgreen.md`.

---

### H-9 — Non-ASCII config values/keys are silently truncated on read (UTF-16 count used as UTF-8 byte budget) (#10)
- **Severity:** High
- **Gap:** The read path sizes the C++ buffer from the JS string's `.length` (UTF-16 code units) but `stringToUTF8` interprets that as a max **byte** budget.
- **Evidence:** `src/wasm/config.cpp:291-313` (`DoReadString`), `:204-219` (`GetNextEntry`), `:154-176` (`GetNextGroup`); `wx.js` `getConfigEntryLength` returns `value.length`, `getConfigEntry` → `stringToUTF8(value, buf, length+1)`. For any non-ASCII char the UTF-8 byte length exceeds the char count, so the buffer is undersized and the string is truncated at the first multibyte char. Native: `wxRegConfig`/`wxFileConfig` return the stored string byte-for-byte.
- **Native vs WASM:** Native returns the full string; WASM returns e.g. `"café"` (5 bytes) read back as `"caf"`. Writes are fine (localStorage holds the full string); only the C++ read-back is corrupted.
- **Impact:** Silent data **corruption** on read of any config value/name with non-ASCII content (also truncates group/entry names from `GetNextGroup/GetNextEntry`).
- **KiCad relevance:** Recent-file paths and user strings with international content (`/home/José/board.kicad_pcb`) read back truncated, breaking recent-files and any wxConfig-backed string for i18n users.
- **Verifier note:** Confirmed safe-truncation (not overflow). Fix: have `getConfigEntryLength/KeyLength` return `lengthBytesUTF8(value)`.

---

## 4. Medium findings

Compact table (deduped; inv-stub-todo mediums #58/#59 → C/P part of #32, #60 → #5, #61 → #30, #62 → #4, #63 → #47, #64 → #20, #69 → H-7 — not relisted).

| id | subsystem | title | wasm evidence | impact | KiCad relevance |
|---|---|---|---|---|---|
| 13 | window-core | `wxEVT_MOUSE_CAPTURE_LOST` never fired | `window.cpp:1441-1451`; no `NotifyCaptureLost` in port | Capturing widgets/tools wedge "still dragging" when capture pre-empted | splitter/AUI sash, grid drag-select; tools aborting drag on capture-lost |
| 14 | window-core | `SetFocus()` never blurs the prior DOM element | `window.cpp:934-968`; no blur primitive anywhere | Keystrokes go to a stale `<input>` after programmatic focus to canvas | `canvas->SetFocus()` to redirect hotkeys w/o a user click |
| 15 | window-core | `Reparent()` not overridden → cross-TLW reparent orphans DOM nodes | base `wincmn.cpp:1376-1416`; node bound at create (`window.cpp:282`) | Control stays under old TLW container; destroyed with it | wxAUI float of a pane with DOM-backed controls |
| 16 | toplevel | `IsActive()` always false; activation never tracked | `toplevel.h:60/81`; `SetActive` has 0 callers | `IsActive()` wrong everywhere; `EVT_ACTIVATE` doesn't fire on intra-app frame switch | `sch_edit_frame`, `symbol_viewer_frame`, `footprint_viewer_frame` bind `EVT_ACTIVATE` |
| 17 | toplevel | Enter doesn't activate default button unless it holds DOM focus | `button.cpp:83-90`; no `WXK_RETURN→GetDefaultItem()` (`app.cpp:600-640`) | Enter in a dialog field doesn't invoke OK; default not highlighted | Common KiCad dialog UX (Esc-to-cancel does work) |
| 18 | dc-core | `DoBlit` ignores `useMask` + raster-op, breaks base StretchBlit | `dc.cpp:514-535` (rop/useMask WXUNUSED, no LogicalToDevice) | Masked blits opaque; stretched/positioned blits at wrong pos, unscaled | scaled `wxStaticBitmap`/preview/`wxRendererNative`, masked icons |
| 19 | dc-core | Region clip never sets clip-box state; JS reset can drop viewport clip | `dc.cpp:249-290`; never sets `m_clipping`/`m_clipX1..` | `GetClippingBox` reports whole DC; region clips can paint outside window | paint handlers that query clip before repaint |
| 20 | dc-core | `SetLogicalFunction` no-op (XOR/`wxINVERT`) | `dc.cpp:233-237` empty | XOR/`wxINVERT` rubber-band does nothing | generic splitter/sash/caret XOR trackers (GAL uses WebGL) |
| 21 | gdi-resources | `wxPen::SetColour` drops the colour alpha | `pen.cpp:159-164` (`GetRGBA()`→`wxColour(unsigned long)` forces opaque) | Translucent pen strokes render opaque (brush keeps alpha — inconsistent) | wxDC colour swatches/previews/propgrid cells |
| 22 | gdi-resources | `wxBrush` hatch styles no-op (solid fill) | `brush.cpp:155-168` (`wxFAIL_MSG`, stores style) | Hatch fills draw solid; debug asserts on construction | zone/DRC/preview swatches (GAL unaffected) |
| 23 | bitmap-image | `ConvertToImage()` drops the bitmap mask | `bitmap.cpp:578-634` never touches `m_mask` | Masked bitmap loses transparency on round-trip (Rescale/ConvertToDisabled) | mostly alpha PNGs used → limited; genuine contract gap |
| 24 | bitmap-image | `GetSubBitmap()` loses mask + alpha flag | `bitmap.cpp:734-767` (`// TODO: copy mask`, no `SetHasAlpha`) | Sub-bitmap `HasAlpha()` false, mask gone → later ConvertToImage drops alpha | metadata/round-trip correctness (blits look right) |
| 25 | fonts | `wxNativeFontInfo` serialization round-trip broken | `font.cpp:205-208` `FromString` always false; `ToString` emits CSS | Stored wx fonts can never be reloaded (`wxConfig`/`wxFontData`/propgrid) | KiCad uses JSON settings → narrow but total contract break |
| 26 | fonts | Default (`-1`/`wxDEFAULT`) font size not resolved | `font.cpp:100` no `SetSizeOrDefault` | `GetPointSize()==-1`, invalid CSS, negative pixel size | code building a font from a default-size `wxFontInfo` |
| 27 | fonts | Text metrics: descent and external-leading always 0 | `font.cpp:255,261,265`; canvas exposes real metrics but discards | Baseline/descent positioning wrong; row heights approximate | `GetPixelSize().y` → grid row/report-box heights |
| 28 | glcanvas | `wxGLContext` sharing ignored; context aliases its own canvas | `glcanvas.cpp:279/291/311` | With ≥2 OpenGL canvases, 2nd canvas's `g_fontTexture` invalid but reload suppressed | footprint-preview alongside board → blank bitmap-font text |
| 29 | glcanvas | GL `<canvas>` not repositioned on ancestor move, never clipped | only moved in `glcanvas.cpp:455-468`; `UpdateDomGeometryRecursive` skips `m_cssId`; no clip-path | Stranded/overspilling GL canvas on move-only relayout / clipped containers | main editor mitigated (fills pane); embedded/scrolled previews not |
| 30 | textctrl | `SetInsertionPoint/SetSelection/SelectAll` don't move DOM caret | `textentry.cpp:130-178` cache-only; no DOM setter | Programmatic caret/selection invisible & ineffective (select-on-focus, validator highlight) | many KiCad dialogs select-all on focus |
| 31 | textctrl | `WriteText` inserts at stale cached caret (0); `AppendText` never scrolls | `textentry.cpp:48-71`; `ShowPosition` no-op | Insert-at-cursor lands at pos 0; appended log lines not auto-scrolled | autocomplete fragments, append-to-log controls |
| 32 | textctrl | Cut/Copy/Paste no-ops (programmatic/menu) | `textentry.cpp:95-108` (TODO async clipboard) | Edit-menu/accelerator/validator clipboard ops do nothing; enable state wrong | Edit>Cut/Copy/Paste on text fields (Ctrl-C/X/V via browser still work) |
| 33 | buttons | `wxButton::SetDefault()` effectively no-op | `button.cpp:83-90`; no `GetDefaultItem`/`WXK_RETURN` path; WXUNIV=0 | Enter doesn't activate default button; no default styling | `dialog_shim.cpp:1616` marks every KiCad dialog's OK default |
| 34 | choices-lists | `wxEVT_LISTBOX_DCLICK` never fired | `listbox.cpp:289-321`; no `dblclick` listener | "double-click to confirm/open" handlers never run | `eeschema/symbol_viewer_frame.cpp:96` (viewer stubbed anyway) |
| 35 | containers | `DeleteTool/RemoveTool/ClearTools` don't update DOM until next `Realize()` | `toolbar.cpp:107-117` only `InvalidateBestSize` | Stale tool buttons persist; `ClearTools()` looks like a no-op | KiCad uses wxAuiToolBar; native wxToolBar not instantiated |
| 36 | static-range | `wxStaticText` renders mnemonic `&` literally | `stattext.cpp:67-91` pushes raw label (no `GetLabelText()`) | ~17 dialog labels show a stray `&`; `&&` not collapsed | eeschema/pl_editor pin props, find/replace, defaults dialogs |
| 37 | menus | Radio menu-items: no exclusivity, can be unchecked | `menu.cpp:305-308`/`window.cpp:754-756` blind `Toggle()` | `wxITEM_RADIO` act like independent checkboxes | units/grid/contrast radio menus visibly wrong |
| 38 | menus | `wxMenuBar::EnableTop` no DOM effect | `menu.cpp:203-210`; JSON has no `enabled` for top menus | Disabled top menu still opens, not greyed | KiCad occasionally disables whole top menus |
| 39 | menus | Menu accelerators/mnemonics stripped, never registered | `menu.cpp:125` `GetItemLabelText()` strips `\tCtrl+X` & `&`; no accel infra | No shortcut hints in menus, no Alt-mnemonic nav | KiCad routes hotkeys via TOOL_DISPATCHER → functionality survives, hints lost |
| 40 | clipboard-dnd | Clipboard text-only; bitmap/file/HTML/custom rejected | `clipbrd.cpp:284-313` | **Image paste dead in KiCad** (`GetImageFromClipboard` always null) | `pcb_control.cpp:1170`, `sch_editor_control.cpp:1666` fall to text; text path works |
| 41 | input | Wheel rotation not normalized; `deltaMode` ignored; `m_wheelDelta` non-standard | `mouse.cpp:190-209` (`m_wheelDelta=10`, raw delta) | Device-dependent scroll/zoom speed; trackpad pixel-delta ≈10× | GAL zoom keys off `GetWheelRotation()/Delta()` |
| 42 | input | `GetUnicodeKey`/`m_keyCode` wrong for non-ASCII keys | `keyboard.cpp:258-283` (only ASCII ≤127) | wx-level key events garbage/0 for accented/non-Latin | canvas key handling (text fields are DOM `<input>`) |
| 43 | input | Global accelerators dead while a DOM editable is focused; browser default fires | `app.cpp:583-594` returns EM_FALSE for non-Esc | Ctrl+S/O/W leak to browser chrome; accelerators dead | editing a value then pressing save/undo |
| 44 | timer-config | Malformed flat keys for non-root paths (no separator) | `config.cpp:67-126` (`/foo`+`bar`→`config/foobar`) | Enumeration & group delete broken for non-root groups; latent collisions | wxFileHistory round-trips but not enumerable/clearable |
| 45 | timer-config | `GetNumberOfGroups(true)` ignores recursive flag | `config.cpp:243-246` ($1 not forwarded) | Recursive group counts under-report | low direct use; clear correctness bug |
| 46 | timer-config | Continuous timers fire a catch-up storm after suspension | `timer.cpp:65-81` absolute deadline, clamp [0,interval] | Burst of redundant `wxEVT_TIMER` on tab refocus/long load | canvas refresh/animation/autosave |
| 47 | timer-config | `GetMetric()` returns 0 for ALL metrics (should be value, -1 unknown) | `settings.cpp:69-73` | Scrollbar gutter/screen/dclick/drag = 0; defeats the -1 fallback | sizers/dataview editors; partly masked by DOM scrollbars |
| 48 | cc-printing | Real printing is a silent no-op | `dcpsg.cpp:1799` `wxExecute("lpr…")` can't fork; PS discarded; reports success | File→Print shows dialogs then no output, no error | `dialog_print_generic.cpp:300-306` (Plot→PDF/SVG is separate, works) |
| 49 | cc-hidpi | DPR quantized to {1.0, 2.0}, capped at 2× | `display.cpp:56/71`; `wx.js:441`; `kiplatform/ui.cpp:95` | Blurry at 1.25× (125% Windows) and >2× tablets/4K | GAL canvas pixel-perfect only at exactly 1×/2× |
| 50 | cc-hidpi | Runtime DPR change desyncs JS backing-store vs C++ scale; no `wxDPIChangedEvent` | `wx.js:437-444` cache never reset; `display.cpp:68-72` C++ re-queries | Browser zoom past 150% → canvas mis-scaled (clipped/half-size) until reload | browser zoom is routine |
| 51 | cc-accessibility | Toolbar icon buttons have no accessible name | `wx-dom.js:1167-1183` (img, no aria-label/alt) | Icon toolbars announced as bare "button" | KiCad toolbars are almost entirely icon-only |
| 52 | cc-accessibility | Menus have no ARIA semantics, no keyboard nav | `wx-dom.js:913-986` plain divs; only Esc handled | Menus mouse-only, opaque to screen readers | menus are a primary KiCad surface |
| 53 | cc-accessibility | Tooltip text written into `aria-label`, clobbering accessible name | `tooltip.cpp:161-167 wxDomSetAriaLabel` | Control announced as its tooltip, not its label (WCAG 2.5.3) | every widget with both a label and a tooltip |
| 54 | cc-net-ipc | `wxExecute`/`wxShell`/`wxKill` non-functional (no fork/exec) | `utilsunx.cpp:680/785` fork returns -1 | All "launch external program" features fail (gracefully) | `launch_ext`, `eda_doc`, netlist plugins, bom, step export |
| 55 | critic-uncovered | `wxEVT_CHAR` never delivered to focused DOM text controls | `app.cpp:567-578` EM_FALSE on editable | As-you-type validator/`OnChar` filtering doesn't run | `ENV_VAR_NAME_VALIDATOR::OnChar` (no Validate) accepts illegal silently |
| 56 | inv-known-limitations | eeschema symbol viewer/chooser sub-frames stubbed to `nullptr` on EMSCRIPTEN | `eeschema.cpp:223-248` | Symbol viewer/chooser unavailable in eeschema | documented MVP scope |
| 57 | inv-known-limitations | Symbol editor: no bundled libs, viewer/chooser stubbed, MEMFS only | `eeschema.cpp`; `SyncLibraries` libCount=0 | Symbol editor largely non-functional for real symbol work | documented; asset gap |
| 65 | inv-stub-todo | `wxMask::InitFromMonoBitmap` builds no mask, returns true | `bitmap.cpp:344-350` | Mono-derived masks empty (SetMask rejects / NULL deref in CreateComposite) | uncommon; masks usually from colour/image |
| 66 | inv-stub-todo | `wxRadioBox::Enable(n,enable)` caches only, no DOM | `radiobox.cpp:117-125` | Individual radio item never visually disables; stays clickable | wxRadioBox items |
| 67 | inv-stub-todo | `wxListBox` `wxLB_SINGLE` not honored (multi `<select>`) | `listbox.cpp:77`; `wx-dom.js:155-157` `.multiple=true` | Default single-select listbox permits multi-row selection | default listboxes |
| 68 | inv-stub-todo | `wxFontEnumerator` needs Chromium Local Font Access; `fixedWidthOnly` ignored | `fontenum.cpp:25-28,98-106` | Empty font list off-Chromium; monospace filter dropped everywhere | font pickers |
| 70 | inv-stub-todo | `DoGetClientSize()` doesn't subtract scrollbar gutters | `window.cpp:1297-1300` | Content under the ~17px gutter; scroll extents off | wxScrolledWindow panels (cosmetic for canvas) |

---

## 5. Low / polish findings

All low items are carried through. Tag: **(V)** = independently verified high-confidence; **(C)** = carried/unverified (severity polish). Duplicates of higher findings noted as `= id`.

### app-eventloop
| id | title | note |
|---|---|---|
| 71 | Horizontal wheel built then discarded **(V)** | `app.cpp:703-705` empty if; `domevents.cpp` no deltaX. = #149. Horizontal canvas pan dead (`wx_view_controls.cpp:425-495`) |
| 72 | `OnExit()` never called **(C)** | `evtloop.cpp:159-195`; `OnEventLoopExit` never fires; KiCad doesn't override |
| 73 | Loop exit code discarded (Run returns 0) **(C)** | `evtloop.cpp:170-194`; mitigated (`ShowQuasiModal` returns GetReturnCode) |
| 74 | `DoYieldFor` can't deliver browser input during sync yield **(V)** | `evtloop.cpp:149-157`; Asyncify substrate is the real path; ~28 `wxYield` sites |
| 75 | `RequestMore()` ignored; idle on fixed 1-in-3-frame cadence **(C)** | `evtloop.cpp:19-32`; ~20 Hz; `WakeUpIdle` no-op |
| 76 | `DispatchTimeout` is `wxFAIL` stub **(C)** | `evtloop.cpp:137-142`; only caller is sockets (unused) |
| 77 | `AddSourceForFD` wxFAILs **(C)** | `app.cpp:470-477`; no FDs in browser; `wxUSE_EVENTLOOP_SOURCE` 0 anyway |
| 78 | utils.cpp platform-info stubs **(C)** | `utils.cpp` OsVersion/Bell/CpuArch/64Bit/NEW_WINDOW; = #201/#231-237 |

### window-core
| id | title | note |
|---|---|---|
| 79 | `Update()` never overridden → no synchronous repaint **(V)** | base no-op; only paints on next yield; browser can't composite mid-task anyway |
| 80 | `DoGetClientSize()` returns full size **(V)** | = #70; ~17px gutter overlay occlusion |
| 81 | `Raise()/Lower()` reorder wx list only, not DOM z-order **(C)** | `window.cpp:811-829`; rare for overlapping sibling DOM controls |
| 82 | No partial repaint: `Refresh()` ignores rect **(C)** | `window.cpp:1006-1015`; over-paint perf only; GAL repaints fully |

### toplevel-frame-dialog
| id | title | note |
|---|---|---|
| 83 | `ShowModal(std::function)` sets callback after blocking call → never fires **(V)** | `dialog.cpp:304-309`; dead code; no KiCad callers |
| 84 | `IsModalShowing()` declared, never defined **(C)** | `dialog.h:58`; latent link error; unused |
| 85 | `SetTitle()` on secondary frame doesn't refresh port-drawn caption **(C)** | `toplevel.cpp:174-184`; main-frame `document.title` works |

### dc-core
| id | title | note |
|---|---|---|
| 86 | Primitives never call `CalcBoundingBox` **(C)** | DC bounding box always empty; KiCad rarely uses it |
| 87 | `DoDrawArc` strokes spurious radius, unscaled radius **(C)** | `dc.cpp:450-472`; pen-only arc gets a centre line |
| 88 | Minor `Clear()`/`DrawText` divergences **(C)** | Clear fills within clip; baseline heuristic |
| 89 | `DoGetPixel` `wxFAIL`, returns true **(V)** | `dc.cpp:315-322`; = #212; pixel read-back unsupported (GC DC also unsupported) |
| 90 | `DoFloodFill` `wxFAIL` stub **(C/V)** | `dc.cpp:619-628`; = #213; returns true (should be false) |
| 91 | `DoCrossHair` `wxFAIL` stub **(C/V)** | `dc.cpp:537-541`; = #214; no KiCad caller |
| 92 | `SetPalette` `wxFAIL` stub **(C)** | `dc.cpp:167-171`; KiCad is 32bpp RGBA |

### gdi-resources
| id | title | note |
|---|---|---|
| 93 | Pen hatch styles no-op (solid line) **(C)** | `pen.cpp:185-213`; dash styles work; hatch rare |
| 94 | Polygon `wxRegion` ctor not implemented (generic gap) **(C)** | `region.h:26-28`→generic `wxFAIL`; KiCad uses no `wxRegion` |

### bitmap-image
| id | title | note |
|---|---|---|
| 95 | `DoDrawBitmap`/`DoBlit` ignore `useMask`; mask always baked **(C)** | `bitmap.cpp:183-225`/`dc.cpp:499-520`; KiCad icons use alpha |
| 96 | `SaveFile()` claims success, writes nothing **(V)** | `bitmap.cpp:770-777`; = #216; KiCad exports via `wxImage::SaveFile` |
| 97 | `LoadFile()` stub returns false **(V)** | `bitmap.cpp:779-784`; = #217; icons load via `wxImage` path |
| 98 | `wxMask::InitFromMonoBitmap` stub **(C)** | = #65 |
| 99 | `GetPalette/SetPalette` assert (GTK silently no-ops) **(C)** | `bitmap.cpp:831-844`; debug-only divergence |
| 100 | `wxBitmapRefData` doesn't override `IsOk()` **(C)** | degenerate 0×0 refData reports Ok |
| 101 | `SetMask(NULL)` null-derefs **(C)** | `bitmap.cpp:700-717`; unreachable (wxGCDC off, no NULL callers) |

### fonts
| id | title | note |
|---|---|---|
| 102 | Pixel-size fonts mis-sized (treated as pt) **(V)** | `font.cpp:93-97`; ~33% too large; stock fonts unaffected |
| 103 | `fontutil.cpp` encoding helpers `wxFAIL` stubs with misleading returns **(C)** | `fontutil.cpp:22-55`; Unicode-only in browser |
| 104 | DOM controls don't render underline/strikethrough **(C)** | CSS `font` shorthand can't carry text-decoration; canvas path does |
| 105 | `EnumerateFacenames` Chromium-only, returns families, ignores fixedWidth **(C)** | = #68 |

### glcanvas
| id | title | note |
|---|---|---|
| 106 | Context version/profile/ES2/Debug attrs silently dropped **(V)** | `glcanvas.cpp:280/537/579-592`; always WebGL2; KiCad wants WebGL2 → benign |
| 107 | `IsExtensionSupported()` undefined (latent link error) **(C)** | only referenced in non-Emscripten branches |
| 108 | Default arm over-skips value-less attrs (sRGB) **(C)** | `glcanvas.cpp:594-603`; KiCad uses no sRGB FB |
| 109 | Hardcoded WebGL defaults diverge (alpha/preserveDrawingBuffer/powerPreference) **(C)** | perf cost for 2D GAL; powerPreference flagged for Safari |
| 110 | No WebGL context-loss handling **(C)** | GPU/tab reset → dead canvas; native wx doesn't surface this either |
| 111 | No relaxation of `SetCurrent` `IsShown()` assert; KiCad guard is `__WXGTK__`-gated **(C)** | debug assert reachable during GAL teardown |

### textctrl
| id | title | note |
|---|---|---|
| 112 | `SetMaxLength` no-op; `wxEVT_TEXT_MAXLEN` never fires **(V)** | base no-op; no `maxlength` set; length-capped fields unbounded |
| 113 | `ShowPosition` no-op (no scroll-to-position) **(C)** | `textctrl.cpp:239-242`; log/report panels don't follow output |
| 114 | `SetStyle/GetStyle/SetDefaultStyle` unimplemented (base false) **(C)** | no per-range/coloured text in multiline |

### buttons
| id | title | note |
|---|---|---|
| 115 | Best-size ignores `GetDefaultSize()` floor (dead code) **(V)** | no `DoGetBestSize` override; OK/Cancel rows can mismatch |
| 116 | Only `State_Normal` bitmap shown; toggle doesn't swap on press **(C)** | `anybutton.cpp:21-38`; KiCad bitmap toggles are custom panels |
| 117 | Radio-group walk mishandles `wxRB_SINGLE` **(C)** | `radiobut.cpp:55-82`; no `wxRB_SINGLE` in KiCad |
| 118 | New radio group has no selection (GTK auto-selects first) **(C)** | GTK-specific, not cross-platform invariant |
| 119 | Button/toggle/radio mnemonic accelerators do nothing **(C)** | intentional, in-code documented |
| 120 | Toggle `Create` applies stock label over caller's **(C)** | `tglbtn.cpp:56`; toggles rarely use stock ids |

### choices-lists
| id | title | note |
|---|---|---|
| 121 | Editable combobox no `wxEVT_TEXT_ENTER` on Enter **(C)** | `combobox.cpp:95-133`; KiCad uses Enter mostly on wxTextCtrl |
| 122 | Combobox `Popup()/Dismiss()` no-ops; no DROPDOWN/CLOSEUP **(C)** | `combobox.cpp:160-168`; 0 KiCad hits |
| 123 | `wxLB_SORT`/`wxCB_SORT` ignored while `IsSorted()` true **(C)** | `listbox.cpp:248-257`/`choice.cpp:173-185`; 0 KiCad hits |
| 124 | Listbox scroll-to/visibility no-ops; `wxLB_SINGLE` as multi `<select>` **(C)** | = #67/#224 |

### containers
| id | title | note |
|---|---|---|
| 125 | Notebook page images stored but never rendered on tabs **(V)** | `notebook.cpp:155-163`; `dialog_sync_sheet_pins` warning icon dropped |
| 126 | Only `wxBK_TOP` tab placement; BOTTOM/LEFT/RIGHT render as top **(C)** | `notebook.cpp:303-329`; KiCad uses top tabs |
| 127 | No keyboard tab navigation (arrows/Ctrl+PgUp/Dn) **(C)** | `notebook.cpp:276-297`; click only |
| 128 | `wxITEM_DROPDOWN` tools unsupported **(C)** | `toolbar.cpp:181-187`; KiCad uses wxAuiToolBar dropdowns |
| 129 | `wxEVT_TOOL_RCLICKED` never fired **(C)** | native toolbar unused |
| 130 | `FindToolForPosition()` NULL → no `wxEVT_TOOL_ENTER`/longhelp **(C)** | short-help tooltips work |
| 131 | `SetToolNormalBitmap/DisabledBitmap` not overridden **(C)** | runtime icon change no-op |
| 132 | `AddControl` tools not laid out in DOM strip **(C)** | native toolbar unused |
| 133 | Disabled tools ignore app disabled bitmap **(C)** | browser default greying used |
| 134 | Vertical toolbars render horizontal **(C)** | KiCad vertical toolbars are wxAuiToolBar |

### static-range
| id | title | note |
|---|---|---|
| 135 | Standalone `wxScrollBar` fires reduced scroll set (page→CHANGED only) **(C)** | `scrolbar.cpp:107-146`; KiCad uses scrolled-window gutters |
| 136 | `wxSL_INVERSE` ignored **(V, corrected)** | visual orientation only; **value mapping is correct** (GTK doesn't use ValueInvertOrNot) |
| 137 | `wxSL_LABELS/MIN_MAX/VALUE_LABEL` not rendered **(C)** | color-picker sliders pass `wxSL_LABELS`; cosmetic |
| 138 | `SetLineSize/SetPageSize` not reflected to DOM step **(C)** | keyboard increments use browser defaults |
| 139 | `DoGetBestSize` hardcoded 100×20 / 20×100 **(C)** | cosmetic sizing |
| 140 | `wxALIGN_RIGHT/CENTRE_H` not applied to static text **(C)** | only visible when wider than text |
| 141 | `SetScaleMode/GetScaleMode` not overridden (bitmap at native size) **(C)** | KiCad uses native icon size |

### menus
| id | title | note |
|---|---|---|
| 142 | `wxEVT_MENU_HIGHLIGHT`/`wxEVT_MENU_CLOSE` never fired **(V)** | no status-bar menu hints; `ACTION_MENU` highlight preview never triggers; part of H-7 root |

### clipboard-dnd
| id | title | note |
|---|---|---|
| 143 | `IsSupported` returns true for text whenever Clipboard API exists **(C)** | intentional (avoids 2s asyncify park); benign |
| 144 | `wxDropSource::DoDragDrop` non-blocking, always `wxDragNone` **(V)** | `dnd.cpp:261-284`; no KiCad callers; result via `OnDragResult` |
| 145 | External drops reach only `wxEVT_DROP_FILES`, not `wxDropTarget` **(C)** | KiCad frames use `wxEVT_DROP_FILES` → works; only bitmap2component (not a WASM target) affected |
| 146 | One `wxDropFilesEvent` per file vs single event **(C)** | harmless; KiCad accumulates per-event |
| 147 | `SetData`/`Clear` overwrite OS clipboard with empty text **(C)** | redundant async write; no standalone Clear callers |
| 148 | `DoConvertToPng` over-allocates +100 (uninit leak) **(C)** | decode-safe; only via bitmap DnD (rejected) |

### input
| id | title | note |
|---|---|---|
| 149 | Horizontal wheel computed, never dispatched **(V)** | = #71; trackpad horizontal pan dead on GAL |
| 150 | Aux (X1/X2) buttons unsupported, assert in debug **(C)** | `mouse.cpp:22-60,164-168`; KiCad rarely binds aux |
| 151 | No `wxEVT_CHAR` for Ctrl/Alt+printable on canvas **(C)** | KiCad uses accel tables/KEY_DOWN |
| 152 | Several stock cursors mis-mapped (magnifier→I-beam) **(C)** | `cursor.cpp`; defined ZOOMIN/PROGRESS CSS cursors unused |
| 153 | Busy cursor overridden on window change **(C)** | `app.cpp:248-262` missing `!wxIsBusy()` guard |
| 154 | `wxSetCursor`/`Install` lack `IsOk()` guard (null-deref) **(C)** | `cursor.cpp:255-337`; callers fall back to standard cursor |
| 155 | `wxCursor` from XBM bits unimplemented **(C)** | image cursors work |
| 156 | Double-click detection ignores movement (time-only, hardcoded 500ms) **(C)** | `mouse.cpp:75-93`; spurious dclick in lists |
| 157 | `KeyCodeNeedsKeyDownEvent` declared, never defined **(C)** | dead symbol; latent link error |

### timer-config-settings
| id | title | note |
|---|---|---|
| 158 | Write failures swallowed; `DoWriteString` always true **(V)** | `config.cpp:378-391`; Safari Private/quota → silent non-persistence reported as success |
| 159 | `Stop()` can't cancel pending callback (bounded churn) **(C)** | self-cleaning; no UAF |
| 160 | `GetFont()` returns one hardcoded 10pt swiss for all indices **(V)** | = #211; no fixed-pitch font, no DPI scaling |

### tooltip-misc
| id | title | note |
|---|---|---|
| 161 | `wxToolTip` never bound to window → aria-label path dead, `GetWindow()` always NULL **(V)** | no `DoSetToolTip` override; visible tooltip still works |
| 162 | Static tooltip config setters no-op; delay hardcoded; AutoPop ignored **(C)** | `tooltip.h:29-33`; KiCad `SetAutoPop(10000)` ignored |
| 163 | `wxDisplay::GetScaleFactor()` returns 1.0 on HiDPI **(C)** | `display.cpp:80-101`; KiCad routes via window, not display |

### cc-printing
| id | title | note |
|---|---|---|
| 164 | No browser print/PDF/download output path **(V, reframed)** | reframe: feature gap, not "gratuitous disable" — preview hidden also on Mac/GTK upstream; KiCad-fork decision |
| 165 | "Print to File" yields an invisible MEMFS `.ps` **(V)** | `dcpsg.cpp:1789-1802`; never surfaced; whole wx Print arch non-functional in-browser |
| 166 | Pipeline links only because build flips POSTSCRIPT on **(C)** | checked-in `setup.h:1424` (0) disagrees with generated header (1) |
| 167 | PostScript text fidelity depends on AFM files **(C)** | moot while output discarded |

### cc-hidpi-scaling
| id | title | note |
|---|---|---|
| 168 | `GetDPI()` (96→1.0) inconsistent with `GetDPIScaleFactor()` (2.0) **(V)** | `panel_toolbar_customization.cpp:483-484` preview icons 2× too large; deliberate CSS-px design |

### cc-accessibility
| id | title | note |
|---|---|---|
| 169 | Tooltips hover-only, never on keyboard focus **(C)** | icon toolbars rely on tooltip as only name → nothing for keyboard users |
| 170 | `wxDomSetEnabled` doesn't expose disabled on `<div>` composites **(C)** | `wx-dom.js:822-828`; opacity-only |
| 171 | Owner-drawn canvas islands: zero a11y exposure **(C)** | no role/aria/tabindex; GAL invisible to screen readers (accelerators still work) |
| 172 | No high-contrast/forced-colors; hardcoded colors **(C)** | inline colors defeat forced-colors mode |
| 173 | Programmatic tab-order reordering no-op **(C)** | DOM order = creation order |

### cc-net-ipc-process
| id | title | note |
|---|---|---|
| 174 | `wxSingleInstanceChecker` always "no other instance" **(V)** | per-tab MEMFS; benign (always-override is correct fallback) |
| 175 | `wxSocket` async I/O never delivers; FD dispatcher never pumped **(V)** | no raw TCP; KiCad networking is outside wx |
| 176 | `wxIPC` (TCP) non-functional **(C)** | KiCad IPC is in-process KIWAY |
| 177 | `AddSourceForFD` stub also breaks signal/async-exec pipes **(C)** | signals meaningless in browser |

### cc-locale-mime-stdpaths-fs
| id | title | note |
|---|---|---|
| 178 | `GetNumberOfGroups()` ignores `bRecursive` **(C)** | = #45 |
| 179 | `wxMimeTypesManager` empty (no associations) **(C)** | no `/usr/share/mime`; KiCad ships own bitmaps |
| 180 | `wxFileSystemWatcher` compiled out (`wxUSE_FSWATCHER 0`) **(V)** | class absent; no external-change detection (moot in single-tab MEMFS) |
| 181 | File dialogs are generic widgets over MEMFS only **(V)** | inherent sandbox; real file I/O delegated to host |
| 182 | `wxStandardPaths` returns Unix-style virtual paths, empty on fresh FS **(C)** | KiCad seeds MEMFS via KICAD env logic |
| 183 | `wxLocale` can't switch CRT locale (translations still load) **(C)** | newlib C/POSIX only; KiCad forces "C" for I/O |
| 184 | OS file drops routed only via `wxEVT_DROP_FILES`, single-canvas hit-test **(C)** | KiCad frames use `DragAcceptFiles` → works |

### critic-uncovered
| id | title | note |
|---|---|---|
| 185 | `DoBlit` ignores rop+mask → generic overlay substrate unsupported **(C)** | = part of #18; KiCad uses no `wxOverlay` (GAL=WebGL) |
| 186 | `ShowModal` doesn't save/restore previously-focused window **(C)** | folded under H-1 |

### inv-known-limitations (mostly documented design/scope)
| id | title | note |
|---|---|---|
| 187 | `wxComboBox::SetSelection` no bounds check **(C)** | TODO-tracked |
| 188 | `wxRadioBox` per-item Enable/Show not reflected to DOM **(C)** | = #66/#219 |
| 189 | CheckBox/RadioButton `OnDomEvent` read DOM without null-guard **(C)** | safe in practice |
| 190 | `wxSpinCtrl` text field collapses beside arrows **(C)** | composite sizing polish |
| 191 | `wxBitmapButton` bitmap vertical centering off **(C)** | polish |
| 192 | `wxCheckListBox` selection highlight missing **(C)** | only checked wired |
| 193 | `wxListBox` `wxLB_SINGLE` as multi `<select>` **(C)** | = #67 |
| 194 | Text-area/scrolled widgets lack wxUniversal gutter **(C)** | native browser scrollbars on overflow |
| 195 | Panel/statusbar grey bg not erase-painted around canvas islands **(C)** | Phase-4 |
| 196 | Secondary-window `wxGLCanvas` z-lifted above chrome (3D-viewer occlusion) **(V)** | `wx.js:831` `zIndex=2147483647`; documented tradeoff; only a modal over the GL region occluded |
| 197 | `wxFileName::GetSize` stubbed (`wxInvalidSize`) **(C)** | virtual FS |
| 198 | `wxFileDialog` partial (browser/MEMFS picker) **(V)** | by-design sandbox; open/save/multiple work |
| 199 | `wxGraphicsContext` not implemented ("not needed") **(C)** | KiCad uses GL GAL |
| 200 | `wxRichTextCtrl` disabled in build **(C)** | `--disable-richtext`; unused |
| 201 | `wxGetOsVersion` stubbed **(C)** | = #232 |
| 202 | Timer tests timing-sensitive (flake) **(C)** | — |
| 203 | Tree tests click-position flake **(C)** | — |
| 204 | Known-red kicad file-loading specs (likely stale) **(C)** | now-green after menubar-UAF fix |
| 205 | gerbview launch-scope limits (MEMFS, loading out of scope) **(C)** | per-app MVP |
| 206 | pl_editor: MEMFS only, no parent-dir accel, tooling untested **(C)** | per-app MVP |
| 207 | KiCad caps disabled/stubbed (3D viewer, export, importers, SPICE, curl, libgit2) **(V)** | intentional build flags (`KICAD_BUILD_3D_VIEWER_WASM=OFF`) |
| 208 | KiCad caps permanently off (SpaceMouse, ODBC, IPC, Python, fswatcher, webview) **(C)** | platform-incompatible |

### inv-stub-todo (209–244 — duplicates of higher findings + small stubs)
| id | title | note |
|---|---|---|
| 209 | `wxTextEntry::Copy()` no-op **(V)** | = #32; programmatic-only (Ctrl-C via browser works) |
| 210 | `WriteText/DoSetValue` mirror via wxTextCtrl override; bare combobox WriteText gap **(V, corrected)** | DoSetValue IS covered for combobox; only WriteText/AppendText/Remove unmirrored |
| 211 | `GetFont()` one hardcoded font **(V)** | = #160 |
| 212 | `DoGetPixel` not implemented **(V)** | = #89 |
| 213 | `DoFloodFill` not implemented **(V)** | = #90 |
| 214 | `DoCrossHair` not implemented **(V)** | = #91; no KiCad caller |
| 215 | `GetSubBitmap()` loses mask **(V)** | = #24 |
| 216 | `SaveFile()` claims success, writes nothing **(V)** | = #96 |
| 217 | `LoadFile()` not implemented **(V)** | = #97 |
| 218 | `AddData()` rejects non-text formats **(V)** | = #40; KiCad copy/paste is text s-expr |
| 219 | `wxRadioBox::Show(n)` caches only **(V)** | = #66/#188 |
| 220 | Slider only `wxEVT_SLIDER` **(V)** | = H-6; in-product impact low today (3D opacity uses wxEVT_SLIDER) |
| 221 | Slider `DoGetBestSize` hardcoded **(V)** | = #139; GTK also hardcodes long axis |
| 222 | `wxCheckBox::DoSet3StateValue` can't show indeterminate **(V)** | logical state retained; cosmetic |
| 223 | `wxComboBox::Popup()/Dismiss()` no-ops **(V)** | = #122; base default is `wxFAIL` (no-op is safer); KiCad callers are `__WXOSX__`-only |
| 224 | `wxListBox::DoSetFirstItem()` no-op **(V)** | = #124; EnsureVisible also base no-op |
| 225 | `wxTextCtrl::ShowPosition()` no-op **(V)** | = #113 |
| 226 | `wxAnyButton::DoSetBitmap()` only `State_Normal` **(V)** | = #116 |
| 227 | `wxToolTip` global config setters no-op **(V, corrected)** | only Enable/SetDelay are real on GTK; KiCad calls match port default → no regression |
| 228 | `wxBrush::SetStyle()` rejects hatch **(V)** | = #22; debug assert + solid fill |
| 229 | `wxPen::SetStyle()` traps unknown styles **(V, corrected)** | also traps valid in-range hatch/stipple-mask enums; debug-only assert (style still stored) |
| 230 | `wxCursor` XBM ctor not implemented **(C)** | = #155 |
| 231 | `wxBell()` empty (no sound) **(C)** | — |
| 232 | `wxGetOsVersion()` version args unused **(C)** | = #201 |
| 233 | `wxCheckOsVersion()` always true **(C)** | — |
| 234 | `wxIsPlatform64Bit()` false **(C)** | arguably correct for wasm32 |
| 235 | `wxGetCpuArchitectureName()` "unknown" **(C)** | — |
| 236 | `wxDoLaunchDefaultBrowser()` ignores NEW_WINDOW **(C)** | — |
| 237 | `wxGetBrowserInfo()` version not populated **(C)** | — |
| 238 | `wxEventLoop::DispatchTimeout()` not implemented **(C)** | = #76 |
| 239 | `wxGLContext` sharing not implemented **(V)** | = #28; single per-canvas context auto-shares in practice |
| 240 | TLW `Maximize/Iconize/Restore` no-ops **(C)** | no window manager in a tab |
| 241 | `wxDC` printing hooks empty **(C)** | print pagination no-op |
| 242 | `AddSourceForFD()` not supported **(C)** | = #77/#177 |
| 243 | `wxGUIAppTraits::ShowAssertDialog()` returns false **(C)** | no assert dialog |
| 244 | `wxMemoryDC` stale read-back TODO comment (likely stale) **(C)** | verify; DoSelect+BeginRawAccess SyncToCpp appears to work |

---

## 6. Cross-cutting themes (root causes)

The 244 findings collapse into ~10 attackable root causes. Fixing the root usually fixes a cluster.

**RC-1 — Text-entry has no caret/selection DOM bridge, and cache mutators are asymmetric.** `m_value`/`m_insertionPoint`/`m_selectionStart/End` are pure C++ caches; there is **no** read or write path to the element's `selectionStart/selectionEnd` anywhere in the port, and `OnDomEvent(INPUT)` hard-resets the caret to 0 on each keystroke. Mutators that push `GetValue()` (`WriteText`/`DoSetValue`) were patched; the delete/caret/clipboard mutators (`Remove`/`Clear`/`SetInsertionPoint`/`SetSelection`/`Cut`/`Copy`/`Paste`) were not. *Members:* #4,#5,#30,#31,#32,#60,#61,#62,#112,#113,#114,#209,#210,#225. *Attack:* add a `wxDomGetSelection`/`wxDomSetSelectionRange` bridge and route `Remove/Clear` through `wxDomSetValue`; this fixes correctness, clipboard enable-state, and insert-at-cursor at once. *File:* `src/wasm/textentry.cpp` + `textctrl.cpp` + `include/wx/wasm/private/dom.h`.

**RC-2 — Menu/toolbar state is a snapshot, never refreshed.** `wxMenuItem` is a pure data stub (no `Enable/Check/SetItemLabel` reaching the DOM), `wxEVT_MENU_OPEN/CLOSE/HIGHLIGHT` are never fired, idle `DoMenuUpdates` mutates only C++ fields, and the JS popup renders the cached `m.items` array. So the entire `wxUpdateUIEvent`/menu-open refresh cycle is invisible in the DOM. *Members:* #8,#9,#12,#37,#38,#39,#69,#142, plus toolbar #35,#130,#131. *Attack:* (a) emit `wxEVT_MENU_OPEN` from the JS title/context-menu click → C++ and re-serialize via `WasmRebuildMenus` after `UpdateUI`; (b) make `wxMenuItem::Enable/Check/SetItemLabel` mark the bar dirty + rebuild. This is the single highest-leverage UX fix after the crash. *File:* `src/wasm/menu.cpp`, `src/wasm/window.cpp` (`DoPopupMenu`), `wx-dom.js`.

**RC-3 — Canvas2D has no raster-ops and the DC clip-box state is never populated.** HTML5 Canvas2D lacks bitwise XOR; the port no-ops `SetLogicalFunction`, ignores `useMask`/rop in `DoBlit`, and — distinctly — never writes the `m_clipX1..`/`m_clipping` members that `GetClippingBox` and the rectangular-clip JS path depend on. *Members:* #3,#18,#19,#20,#64,#86,#185. *Attack:* the clip-box bug (#3) is a pure, fixable port omission (populate `m_clipX1..`); XOR/overlay are largely inherent to Canvas2D and mostly moot because KiCad's interactive overlays use the GL GAL. *File:* `src/wasm/dc.cpp`.

**RC-4 — Selection/list semantic events are hand-rolled and lossy.** Built-by-hand `wxEVT_CHOICE/COMBOBOX/LISTBOX` omit per-item client data (the **critical crash**, #1); the same "rebuild-and-reapply-selection" machinery wipes check-list checks (#6) and never fires list double-click (#34) or honors sort styles (#123). *Attack:* route all of these through the canonical `SendSelectionChangedEvent`/`SendEvent`/`SendCheckEvent` base helpers instead of constructing events by hand. *File:* `src/wasm/choice.cpp`, `combobox.cpp`, `listbox.cpp`, `checklst.cpp`.

**RC-5 — Partial event families.** Several wx event families are only partially generated: horizontal wheel is built then discarded (#71/#149), wheel deltas aren't normalized (#41), sliders emit only the command event not the scroll family (#7/#220), standalone scrollbars emit a reduced set (#135), `wxEVT_CHAR` never reaches focused text controls so validators don't filter (#55/#151), capture-lost never fires (#13), and `wxDPIChangedEvent`/`wxEVT_MENU_*`/`AUX` buttons are absent (#50,#142,#150). *Attack:* dispatch the horizontal-wheel event (one-line in `app.cpp:703`), add the scroll family in `slider.cpp:130`, and decide on a `wxEVT_CHAR`/validator strategy. *Files:* `src/wasm/app.cpp`, `mouse.cpp`, `slider.cpp`, `domevents.cpp`.

**RC-6 — Modal/dialog modality is incomplete.** No `wxWindowDisabler` is ever created (#2/#11) so dialogs aren't input-modal — a real re-entrancy/UAF hazard on the Asyncify-parked stack; focus isn't saved/restored (#186); Enter doesn't activate the default button (#17/#33); `IsActive()` is always false (#16); the `std::function` `ShowModal` overload is dead (#83). *Attack:* the disabler is a one-liner that lights up already-present `IsEnabled()` guards. *File:* `src/wasm/dialog.cpp`, `button.cpp`.

**RC-7 — HiDPI is quantized and internally inconsistent.** DPR is bucketed to {1.0, 2.0} and capped at 2× (#49), the JS backing-store scale is cached and never reset on runtime DPR change (#50), and `GetDPI()` (fixed 96) disagrees with `GetDPIScaleFactor()` (2.0) and `wxDisplay::GetScaleFactor()` (1.0) (#163,#168). *Attack:* thread the true continuous `emscripten_get_device_pixel_ratio()` through both the C++ and JS scale and invalidate the JS cache + emit `wxDPIChangedEvent` on resize. *File:* `src/wasm/display.cpp`, `wx.js`.

**RC-8 — No real printing.** The wx Print architecture is compiled (PostScript DC enabled in the build) but has no browser device: `EndDoc` calls `wxExecute("lpr …")` which can't fork, the `.ps` is discarded yet `Print()` reports success, print-to-file lands in unreachable MEMFS, and in-app preview is disabled. *Members:* #48,#164,#165,#166,#167. *Attack:* a real fix is an in-browser PDF/SVG export + download path; KiCad's own Plot pipeline already covers the primary need.

**RC-9 — Accessibility is essentially absent (a "DOM port had the opportunity" gap).** Icon toolbar buttons have no accessible name (#51), menus have no ARIA/keyboard nav (#52), the tooltip clobbers the accessible name via `aria-label` (#53) while the intended aria path is dead because the tooltip is never bound to its window (#161), tooltips are hover-only (#169), `<div>` composites don't expose disabled state (#170), the GAL canvas is invisible to screen readers (#171), and there's no high-contrast support (#172). The data to fix the top items already exists in the JSON (`t.tooltip`/`t.label`). *File:* `wx-dom.js`, `src/wasm/tooltip.cpp`.

**RC-10 — Bitmap mask/alpha metadata loss + lying success returns.** `ConvertToImage` drops the mask (#23), `GetSubBitmap` loses mask+alpha (#24/#215), blits always bake the mask ignoring `useMask` (#18/#95), `InitFromMonoBitmap` is a stub (#65/#98), and `SaveFile` returns `true` while writing nothing (#96/#216) while `LoadFile` is dead (#97/#217). Mostly latent because KiCad uses alpha PNGs via the `wxImage` path, but `SaveFile`'s false-success is a real footgun. *File:* `src/wasm/bitmap.cpp`.

**Config honesty (RC-11)** and **inherent-platform gaps (RC-12)** are covered in §7. The recurring meta-pattern: the port faithfully maintains C++ state but **drops the C++→DOM push** for a specific mutator family (text deletes, menu UpdateUI, check-list checks, per-item radio enable/show). Several "stubs" return `true`/no-error, turning silent gaps into false-success traps (#48,#90,#96,#158,#213,#216).

---

## 7. Whole missing subsystems & config honesty

### Coverage map (from `inv_compiled-sources.md`)
The WASM build is a genuine `TOOLKIT=WASM` library; the full `GUI_CMN_SRC` (grid, treectrl, dataview, splitter, vscroll, propgrid) is compiled and **verified against 293 archived members** of `libwx_wasmu_core`, not just the bakefile. All 62 `src/wasm/*.cpp` are present. Of the 35 `src/gtk/*.cpp` subsystems with no `src/wasm` counterpart:

- **Class a (generic fallback compiled):** aboutdlg, animate, bmpcbox, calctrl, clrpicker, collpane, colordlg, **dataview** (KiCad-critical), dirdlg, filectrl, **filedlg** (KiCad open/save), filepicker, fontdlg, fontpicker, hyperlink, infobar, mdi, **msgdlg**, notifmsg, **print** (dialogs only), renderer, **scrolwin**, spinctrl, srchctrl, textmeasure — *real generic widgets, no gap.*
- **Class b (base/common/other-lib):** filehistory, mimetype (degraded — empty mime DB), overlay, sockgtk (base wxSocket compiled, never pumped).
- **Class c (GENUINE GAPS, flag ON but nothing compiled):** **taskbar** (`wxUSE_TASKBARICON 1` but no impl; `wx/taskbar.h:83-95` has no WASM class → incomplete type if any TU includes it) and **webview** (`wxUSE_WEBVIEW 1` but `libwx_wasmu_webview` is an 88-byte dummy). Both are browser-N/A and KiCad-unused — harmless today but **misrepresent capability** and are latent link hazards.
- **Class d (intentionally N/A):** nativewin (HWND/GdkWindow handles meaningless in browser).

**`wxFileSystemWatcher` (#180)** is genuinely compiled out (`wxUSE_FSWATCHER 0` in the generated header; no inotify/kqueue) — the concrete type does not exist; any `#if wxUSE_FSWATCHER` code is gone. Moot in a single-tab MEMFS world but the contract capability is absent. **`wxGraphicsContext`/`wxGCDC` (`wxUSE_GRAPHICS_CONTEXT 0`)** is the *one* true wasm-vs-desktop disablement that matters: GAL is unaffected (own GL), only wx-level anti-aliased `wxDC` drawing in some dialogs falls back to plain `wxDC`.

### Disabled / misrepresented setup.h features (from `inv_disabled-features.md`)
The headline is a **config-honesty defect**: `include/wx/wasm/setup.h` is the **stock `setup_inc.h` template copied verbatim** with only two WASM edits (`wxUSE_OPENGL_EMULATION 1`, `wxUSE_THEME_WASM 0`). `include/wx/wasm/chkconf.h` is **empty** (8-line comment header), so the port force-corrects nothing. The actual build is **configure-driven** (`build-wx-wasm.sh` runs `emconfigure … --disable-richtext --without-libtiff --disable-xlocale --with-opengl`), regenerating a `setup.h` into the build tree that the compiler actually sees. Consequences:

- **The checked-in header LIES about the shipped value:** `wxUSE_RICHTEXT`, `wxUSE_XLOCALE`, `wxUSE_LIBTIFF` all say `1` but ship as `0` (#200; also `wxUSE_POSTSCRIPT` 0 in checked-in vs 1 generated, the print-link footgun #166). `wxUSE_XLOCALE 0` degrades locale-aware numeric parsing — relevant to KiCad coordinate parsing.
- **Knobs left `1` that can't work in a browser** (no `src/wasm` backend): `wxUSE_SOCKETS`/`PROTOCOL_*`/`URL`/`FS_INET` (#175,#176), `wxUSE_FSWATCHER` (overridden to 0 in build), `wxUSE_IPC`/`SNGLINST_CHECKER` (#174,#176), `wxUSE_DYNLIB_CLASS`/`DYNAMIC_LOADER`/`DIALUP_MANAGER`, `wxUSE_SOUND`/`MEDIACTRL`/`JOYSTICK`, `wxUSE_STACKWALKER`/`DEBUGREPORT`, `wxUSE_TASKBARICON`, `wxUSE_PRINTING_ARCHITECTURE` (#48). Mostly graceful dead capability + binary bloat (the binary is size-critical, ~65 MB gz).
- **The only unambiguous numeric wasm-0/gtk-1 diff** is `wxUSE_IPV6` (cosmetic). `wxUSE_GRAPHICS_CONTEXT 0` is the only meaningful conscious disablement.

**Recommendation:** populate `wx/wasm/chkconf.h` to force-off the browser-impossible knobs (sockets/IPV6/FS_INET/PROTOCOL_*/URL/FSWATCHER/IPC/DIALUP/DYNLIB/JOYSTICK/SOUND/MEDIACTRL/STACKWALKER/DEBUGREPORT/TASKBARICON/PRINTING_ARCHITECTURE), and audit the *configure-generated* header as the source of truth rather than the checked-in one.

---

## 8. Recommended priorities (value-to-effort)

1. **Fix the selection client-data crash (#1).** *Tiny effort, eliminates a guaranteed module trap.* Route `wxEVT_CHOICE/COMBOBOX/LISTBOX` through `SendSelectionChangedEvent`/`InitCommandEventWithItems`. → `src/wasm/choice.cpp`, `combobox.cpp`, `listbox.cpp`.
2. **Create the `wxWindowDisabler` in `ShowModal` (#2/#11).** *One line; lights up existing `IsEnabled()` guards; closes a UAF/re-entrancy class.* → `src/wasm/dialog.cpp:270`.
3. **Wire menu UpdateUI/`wxEVT_MENU_OPEN` to the DOM (#8/#9/#12/#37/#38/#142).** *Medium effort, broad UX win* — fixes stale Undo/Redo/check/enable across the whole app and context menus. → `src/wasm/menu.cpp`, `window.cpp`, `wx-dom.js`.
4. **Fix `SetClippingRegion(x,y,w,h)` (#3) and config UTF-8 truncation (#10).** *Both are small, localized correctness bugs with data/visual impact.* → `src/wasm/dc.cpp:292`, `config.cpp` + `wx.js` (`lengthBytesUTF8`).
5. **Re-apply check-list checks after rebuild (#6) + Plot/Print correctness.** *Small; the Plot/Print dialogs are core and visibly wrong.* → `src/wasm/checklst.cpp`/`listbox.cpp:100`.
6. **Add the text caret/selection DOM bridge (RC-1: #4,#5,#30,#31,#32).** *Medium; fixes a whole cluster (caret, clipboard, Clear, insert-at-cursor, validator highlight).* → `dom.h` + `textentry.cpp`/`textctrl.cpp`.
7. **Dispatch horizontal wheel + slider scroll family (#71/#149, #7/#220).** *Small; restores trackpad canvas pan and color-picker brightness/alpha.* → `app.cpp:703`, `slider.cpp:130`.
8. **Strip the `&` mnemonic in `wxStaticText` (#36).** *One line, matches the established `GetLabelText()` pattern used by every other control; removes ~17 visible stray ampersands.* → `src/wasm/stattext.cpp:90`.
9. **HiDPI: de-quantize DPR + invalidate JS cache on zoom + emit `wxDPIChangedEvent` (#49/#50/#168).** *Medium; fixes blur at 125%/3× and the zoom-mis-scale-until-reload.* → `display.cpp`, `wx.js`.
10. **Accessibility quick wins (#51/#53/#161):** set `aria-label = tooltip||label` on toolbar buttons and switch tooltips from `aria-label` to `aria-description`/`title`; bind the tooltip to its window. *Low effort, the data already exists.* → `wx-dom.js:1167`, `tooltip.cpp`.
11. **Config honesty:** populate `wx/wasm/chkconf.h`, reconcile the checked-in `setup.h` with the generated header, and stop misrepresenting RICHTEXT/XLOCALE/LIBTIFF/sockets/taskbar/webview. *Low effort, reduces bloat + latent link hazards.* → `include/wx/wasm/chkconf.h`, `setup.h`.
12. **Stop lying-success returns (#48,#90,#96,#158,#213,#216):** make stubs return `false`, so callers can detect failure. *Trivial, removes silent-data-loss traps.*

---

## 9. What is solid

- **The DOM-bridge architecture is well-designed and correct in its hard parts.** Three cleanly separated handle namespaces (`m_cssId` for TLW/GL canvases in `windowMap`; `m_domId` for native controls in `controls`/`gs_domWindows`; owner-drawn windows with neither, painting into the TLW's shared Canvas2D). Lifecycle teardown in `~wxWindowWasm` unregisters from all three registries and drops dangling focus/capture/tooltip pointers (`window.cpp:204`).
- **The Asyncify event-loop integration is genuinely hard and done well.** Top loop via `emscripten_set_main_loop` with the `"unwind"` sentinel; nested/modal loops via `EM_ASYNC_JS` + `setTimeout` pump with a **LIFO resolver stack** so inner modals exit before outer; every error path resolves loudly so a parked stack never freezes silently. The `handlesleep.js` `Asyncify.currData` save/restore shim is what makes nested modal pumps + KiCad coroutine tools survive — a non-obvious, correct fix.
- **Fresh-entry event re-entry works under suspension.** `wx_dom_event`/`wx_dom_mouse` re-enter wx through the exact same `HandleMouseEvent`/`OnDomEvent` paths as native callbacks, keeping capture/dclick/hover synthesis in one place, with a disciplined canvas-path-vs-control-path double-dispatch partition.
- **The real generic widgets are all present and compiled** (verified in the archives, not just the bakefile): wxGrid, generic wxDataViewCtrl (choosers/inspectors), wxPropertyGrid, wxAUI docking, Scintilla (STC), wxScrolledWindow, all generic dialogs (file/dir/color/font/message/print). KiCad's panels depend on these and they are not gaps.
- **`wxScrollBar` is fully implemented** (drag, track-click paging, auto-hide, correct thumb events) — the old "no-op stub" claim is stale (refuted, §10). **Clipboard text copy/paste** (the dominant KiCad path) works correctly via the async browser Clipboard API with a thoughtful capability-probe to avoid asyncify-suspension crashes. **Threads work** (`-pthread -matomics`, real POSIX `wxThread`). **File dialogs** are functional generic widgets bridged to MEMFS with a real `<input type=file>` import + download export.
- **Bitmaps:** masks are first-class on the image→bitmap direction and in clone; alpha PNGs (KiCad's actual icon format) round-trip correctly. The mask losses are on rarer sub-bitmap/ConvertToImage paths.

---

## 10. Verification appendix

**Process:** 244 findings were extracted from a 23-subsystem deep comparison; every medium-and-above item was independently re-checked by an adjudicator that read both the WASM port and the native/contract (wxGTK/common) source, with explicit `verifier_note`/`verifier_correction` fields. Low items were carried through and tagged. **11 candidate findings were refuted/dismissed** after reading the actual code (they would otherwise have inflated the count or asserted false native contracts).

**Notable dismissed candidates:**

| Dismissed claim | Why refuted |
|---|---|
| `wxWindow::DoPopupMenu` is a broken `wxFAIL` stub | The asserted string doesn't exist; `window.cpp:727-768` is a complete implementation (the *real* gap is the UpdateUI/menu-open omission, captured as #9). |
| `wxScrollBar` is a no-op (no draggable thumb) | `src/wasm/scrolbar.cpp` read in full: complete (drag, track-click, auto-hide, thumb events via `wx-dom.js:528-653`). The "no-op" DOCUMENTED-LIMITATION entry is stale. |
| `wxThread`/threading stubbed | Build compiles `-pthread -matomics`, `wxUSE_THREADS 1`, real `unix/threadpsx.cpp` linked; no wasm thread override. |
| `wxTextEntry::Undo()/Redo()` broken vs GTK | wxGTK's `Undo/Redo` are **identical** TODO no-ops (`gtk/textentry.cpp:742-760`); not a parity regression. |
| `wxTextEntry::CanUndo()/CanRedo()` hardwired false vs GTK | wxGTK is identical (`return false`); base declares pure virtual with no default. |
| `wxDC::SetPalette()` / `wxBitmap::GetPalette()/SetPalette()` worse than GTK | wxGTK's are themselves `wxFAIL`/`return NULL`/no-op stubs under `wxUSE_PALETTE`; no native contract being violated. |
| `wxCheckListBox` renders plain `<option>`, no checkbox UI | Stale TODO comment; `checklst.h:53` returns the `"checklistbox"` node type and `wx-dom.js` builds real checkbox rows (the real bug is check-state wipe-on-rebuild, #6). |
| `wxToolBar::FindToolForPosition()` returns NULL vs GTK | wxGTK does the *same* (`wxFAIL_MSG`, returns NULL); GTK delivers tool-enter via a separate signal. |
| `wxWindow::DoFreeze()` no-op breaks Freeze/Thaw | Identical to the base-class default `wxWindowBase::DoFreeze(){}`; not a port-specific defect. |
| web-init app: load-only, no save/S3/auth/collab | The spec explicitly lists these as non-goals for the iteration (documented scope, not a defect). |

**Net:** 1 critical + 9 distinct high + ~50 distinct medium + 174 carried low survive verification; the prior report's "0 confirmed findings" headline is corrected by this list.
