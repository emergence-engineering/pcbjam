# wxAuiToolBar Registration — Tool Selection Fix

## Context

The nested Asyncify collision bug (see `0002-wasm-coroutine-deep-dive.md` and `../../research/threading_1.md`) is fixed. KiCad WASM now loads through the startup wizard without crashing, and the full PCBnew UI renders — menus, left drawing-tool sidebar with Line/Circle/Rectangle icons, layer panel, PCB canvas — all visible.

But tools still don't work end-to-end:

- **User observation**: clicking the Draw Lines tool in the browser doesn't visibly select it or make it function.
- **E2E test**: `select draw lines and draw on the board` can't even attempt a click — it fails earlier at `wxElementRegistry.findAllRendered({ elementType: 'tool' })` because the returned array is empty.

Both signals point at the same gap: **wxAuiToolBar never registers its tools with the rendered-element registry**. The intended outcome of this fix is to make all wxAuiToolBar buttons (Draw Lines and siblings) clickable, selectable, and functional in the browser build.

---

## Root Cause

### The registry and how it gets populated

`window.wxElementRegistry` is a JS-side registry of UI elements used by Playwright tests to find controls by type/label/tooltip. For elements that are not standalone wxWindow instances (e.g., toolbar buttons rendered as pixels on a parent canvas), wxWidgets calls a C++ bridge `WasmRegisterRenderedElement()` which invokes the JS helper `wxRenderedElementRegister()`.

Canonical definition: `wxwidgets/src/wasm/window.cpp:182-214`:
```cpp
void WasmRegisterRenderedElement(
    wxWindow* parent,
    const char* elementType,   // "tool", "menuitem", "sash", "auipart", ...
    const char* subType,
    int index,
    const wxString& label,
    const wxString& tooltip,
    int screenX, int screenY,
    int width, int height,
    bool enabled);
```

### Where it's currently called

Grepping `wxwidgets/src/` for `WasmRegisterRenderedElement`:

| File | What it registers |
|---|---|
| `src/univ/toolbar.cpp:557-607` | Regular wxToolBar items (in `RecalcToolBitmapCache`) |
| `src/univ/menu.cpp` | Menu bar items, popup menu items |
| `src/aui/framemanager.cpp:2687-2787` | AUI pane captions, close/pin/maximize buttons |
| `src/aui/tabart.cpp:392,1137` | Tab headers |
| `src/univ/textctrl.cpp:4304-4319` | Text control segments |
| `src/propgrid/propgrid.cpp:2509-2537` | Property grid rows |
| `src/stc/stc.cpp:5203-5213` | Styled text cells |

### The gap

`wxwidgets/src/aui/auibar.cpp` has **zero** `__EMSCRIPTEN__` blocks and **zero** calls to `WasmRegisterRenderedElement`. Verified:
```
$ grep -nE "__EMSCRIPTEN__|WasmRegister" wxwidgets/src/aui/auibar.cpp
(no matches)

$ git log --oneline -n 10 src/aui/auibar.cpp
# Only upstream wxWidgets commits — our fork hasn't modified this file.
```

KiCad's left drawing-tool sidebar is a `wxAuiToolBar` (not `wxToolBar`), which is why its tools are invisible to the registry.

### Test log evidence

From `tests/logs/kicad/pcbnew/pcbnew-spec-ts-pcbnew-wasm-select-draw-lines-and-draw-on-the-board.log`:

```
[TEST] rendered summary {"count":42,"byType":{
    "searchctrl":3,"searchbutton":4,"sash":2,"auipart":4,
    "combobutton":8,"combotextarea":8,"textctrl":1,"tab":3,"menuitem":9
},"tools":[]}
```

Everything else registers. `tools` is the only empty bucket.

### The log is otherwise clean

Filtering out diagnostic output (`WASM_FCONTEXT`, `DIAG_*`, `wxLog DEBUG`) leaves only three substantive lines, all informational:
```
[DIAG_SHOWMODAL] About to call startModal()
Debug: EndModal: 5100
[DIAG_SHOWMODAL] startModal() returned 5100
```

No exceptions, no crashes, no fiber errors, no `jump-ghost`, `main_refresh=1` stable. The nested Asyncify fix is holding. **The only remaining issue between "UI loads" and "tool works" is this registration gap.**

### Separating the two signals

The registry gap directly explains the **test failure**. It does NOT directly explain the **user's manual observation** — registry population is test-only infrastructure and has no effect on in-browser interactivity.

Hypothesis: once tools are registered, the test will click the tool via coordinates from the registry and produce a log that either shows the click succeeded (no bug — user's "doesn't select" was a display misreading because state wasn't exposed) or shows concrete failure evidence (real activation bug, e.g., another variant of coroutine/asyncify interaction). Either way, the registration fix is strictly additive and unblocks diagnosis.

---

## The Fix

### Summary

Two small changes, one new block:

1. **Extend the registry signature** to include `checked` state (needed so the test can verify selection).
2. **Add a registration block** to `wxAuiToolBar::OnPaint()` following the `univ/toolbar.cpp` pattern.
3. **Update existing callers** to pass a `checked` value (`false` for non-toggleable, real state for `wxItemCheck/wxItemRadio`).

### Change 1 — extend `WasmRegisterRenderedElement` signature

**File: `wxwidgets/src/wasm/window.cpp`** (function at line 182)

Add a `bool checked` parameter and pass it through to the JS helper:

```cpp
void WasmRegisterRenderedElement(
    wxWindow* parent,
    const char* elementType,
    const char* subType,
    int index,
    const wxString& label,
    const wxString& tooltip,
    int screenX, int screenY,
    int width, int height,
    bool enabled,
    bool checked)         // ← NEW
{
    if (!parent) return;
    uintptr_t parentId = reinterpret_cast<uintptr_t>(parent);

    EM_ASM({
        var id = $0.toString() + ':' + UTF8ToString($1) + ':' + $2;
        wxRenderedElementRegister(
            id,
            $0.toString(),
            UTF8ToString($1),   // elementType
            UTF8ToString($3),   // subType
            UTF8ToString($4),   // label
            UTF8ToString($5),   // tooltip
            $6, $7, $8, $9,     // x, y, w, h
            $10 ? true : false, // enabled
            $2,                 // index
            $11 ? true : false  // ← checked
        );
    },
    parentId, elementType, index, subType,
    label.utf8_str().data(), tooltip.utf8_str().data(),
    screenX, screenY, width, height,
    enabled, checked);
}
```

**File: `wxwidgets/build/wasm/wx.js`** (helper at line 297)

```javascript
function wxRenderedElementRegister(
    id, parentId, elementType, subType,
    label, tooltip, screenX, screenY, width, height,
    enabled, index, checked)   // ← NEW
{
    if (window.wxElementRegistry) {
        window.wxElementRegistry.registerRendered(id, {
            id, parentId, elementType, subType,
            label, tooltip,
            screenX, screenY, width, height,
            centerX: screenX + Math.floor(width / 2),
            centerY: screenY + Math.floor(height / 2),
            enabled,
            index,
            checked: !!checked,   // ← NEW
            lastUpdated: Date.now()
        });
    }
}
```

Also update `wxRenderedElementUpdate` (same file, around line 321) similarly, so subsequent updates can change `checked`.

### Change 2 — register wxAuiToolBar tools

**File: `wxwidgets/src/aui/auibar.cpp`** (inside `OnPaint`, after the main item-paint loop, before the overflow paint at line ~2501)

```cpp
#ifdef __EMSCRIPTEN__
    // Update element registry with toolbar tools (for E2E test automation).
    // Runs after every paint so state (enabled/checked, layout) stays current.
    extern void WasmRegisterRenderedElement(
        wxWindow* parent, const char* elementType, const char* subType,
        int index, const wxString& label, const wxString& tooltip,
        int screenX, int screenY, int width, int height,
        bool enabled, bool checked);
    extern void WasmUnregisterRenderedElementsByParent(wxWindow* parent);

    WasmUnregisterRenderedElementsByParent(this);

    wxPoint screenPos = GetScreenPosition();
    for (size_t j = 0, itemCount = m_items.GetCount(); j < itemCount; ++j)
    {
        wxAuiToolBarItem& item = m_items.Item(j);

        if (!item.m_sizerItem)
            continue;
        if (item.m_kind == wxITEM_SEPARATOR)
            continue;

        wxRect itemRect = item.m_sizerItem->GetRect();

        // Skip items scrolled off the end (match the paint loop's cutoff)
        if ((horizontal  && itemRect.x + itemRect.width  >= last_extent) ||
            (!horizontal && itemRect.y + itemRect.height >= last_extent))
            continue;

        const char* subType = (item.m_kind == wxITEM_CONTROL) ? "control" : "button";
        bool isEnabled = !(item.m_state & wxAUI_BUTTON_STATE_DISABLED);
        bool isChecked = (item.m_state & wxAUI_BUTTON_STATE_CHECKED) != 0;

        WasmRegisterRenderedElement(
            this,
            "tool",
            subType,
            static_cast<int>(j),
            item.m_label,
            item.m_shortHelp,
            screenPos.x + itemRect.x,
            screenPos.y + itemRect.y,
            itemRect.width,
            itemRect.height,
            isEnabled,
            isChecked
        );
    }
#endif
```

Notes:
- `item.m_label` / `item.m_shortHelp` are the verified field names (`wxwidgets/include/wx/aui/auibar.h:231,235`).
- `wxAUI_BUTTON_STATE_CHECKED` is already how `wxAuiToolBar::OnLeftUp` tracks toggle state (see line 2676 `m_actionItem->m_state & wxAUI_BUTTON_STATE_CHECKED`).
- Placing the block inside OnPaint means every repaint refreshes the registry, which keeps `checked`/`enabled` state synchronized with visible state without needing a separate update path.

### Change 3 — update existing callers to pass `checked`

Every existing `WasmRegisterRenderedElement` call must pass a new final arg. Most don't have meaningful checked state:

- `src/univ/menu.cpp` — pass `false` (or `menuItem->IsChecked()` for check-menu-items, already available)
- `src/aui/framemanager.cpp` (pane parts) — pass `false`
- `src/aui/tabart.cpp` — pass `false` for non-selected tabs, `true` for the active tab (`page.active`)
- `src/univ/textctrl.cpp`, `src/propgrid/propgrid.cpp`, `src/stc/stc.cpp` — pass `false`
- `src/univ/toolbar.cpp` — pass `tool->IsToggled()` (real value for the regular wxToolBar path)

This is a small mechanical change: add `, false` (or the appropriate value) to each existing call site.

---

## Verification

### Build

1. **wxWidgets standalone build** (fast): `./scripts/build-wxuniversal-wasm.sh`
2. **KiCad rebuild** (needed because KiCad statically links wxWidgets; this is the slow step): `./docker/build.sh`
3. **Setup test artifacts**: handled automatically by `npm run test:kicad`'s `setup:kicad` step.

### Run

```bash
cd tests
npm run test:kicad
```

Expectations for `pcbnew.spec.ts`:

- **Test 1** (`click through setup wizard to load PCBnew`): still passes (already passing, unaffected by this change).
- **Test 2** (`select draw lines and draw on the board`): now proceeds past the `findAllRendered` poll. Three possible outcomes:
  1. **Passes fully** — tools were simply invisible to the test before; the user's "doesn't select" manual report was a display misreading (likely state changed but they didn't see the visual update, or they tested a stale build).
  2. **Fails at the `checked` poll (5s)** — tool renders, click reaches it, but activation path (ACTION_TOOLBAR → TOOL_MANAGER → coroutine) has a real functional bug. Follow up using the log.
  3. **Fails at the initial `findAllRendered` poll still** — registration isn't firing; something wrong with the build/binding. Debug by inspecting the generated `pcbnew.js` for the new signature.

### Diagnostic signals in the log

After the click, watch for these patterns:

- `[WASM_FCONTEXT] entry-call ctx=…` new fiber created after click → activation coroutine started. Any subsequent failure is in tool logic, not plumbing.
- No fiber activity at all after the click → click didn't route to ACTION_TOOLBAR. Suspect event routing through the canvas (`wxwidgets/src/wasm/window.cpp` mouse handlers, possibly `kicad/common/gal/webgl/webgl_gal.cpp` which has a WASM-specific uncommitted change).
- Fiber starts but never yields / doesn't hit the tool's `Wait()` loop → similar class of coroutine bug to the Asyncify fix, but different trigger.

### Follow-up scenarios

If the test still fails after this fix, use the above signals to narrow to:

- **Rendering-only**: `Refresh(false); Update()` already runs in `wxAuiToolBar::OnLeftUp` at line 2683–2684, so this is unlikely; but if the registry updates yet the canvas visibly doesn't, something is suppressing paint.
- **Coroutine activation**: new variant of nested-asyncify (maybe menu → tool → dialog nesting). Extend `coroutine-nested` standalone test with the matching scenario.
- **Event routing**: audit the DOM-event → wxWidgets-event bridge. If clicks on coordinates in the canvas aren't reaching wxAuiToolBar, the bridge has regressed.

---

## Files Touched

| File | Change |
|---|---|
| `wxwidgets/src/wasm/window.cpp` | Add `bool checked` param to `WasmRegisterRenderedElement` signature |
| `wxwidgets/build/wasm/wx.js` | Add `checked` arg to `wxRenderedElementRegister` and `wxRenderedElementUpdate` JS helpers |
| `wxwidgets/src/aui/auibar.cpp` | **NEW** registration block in `OnPaint()` (~30 lines in `#ifdef __EMSCRIPTEN__`) |
| `wxwidgets/src/univ/toolbar.cpp` | Pass `tool->IsToggled()` as new final arg |
| `wxwidgets/src/univ/menu.cpp` | Pass `false` (or `IsChecked()` for check items) |
| `wxwidgets/src/aui/framemanager.cpp` | Pass `false` |
| `wxwidgets/src/aui/tabart.cpp` | Pass `page.active` where appropriate, else `false` |
| `wxwidgets/src/univ/textctrl.cpp`, `propgrid/propgrid.cpp`, `stc/stc.cpp` | Pass `false` |

Net: +~50 lines of new code, ~8 files touched. The wxWidgets fork drift grows by one localized patch — no protocol or architectural change.