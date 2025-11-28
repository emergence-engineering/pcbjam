# Phase 4: Comprehensive wxWidgets WASM Test Application

## Overview

Create a multi-widget showcase test application for the wxWidgets WASM port that thoroughly exercises wxUniversal controls and event handling. This validates the WASM port before integrating KiCad components.

## Goal

1. Display various wxUniversal controls in a tabbed interface
2. Support full interaction: mouse clicks, keyboard input, mouse drag/draw, hover effects
3. Show an on-screen event log panel for visual verification
4. Have corresponding Playwright tests to verify all interactions work

---

## Application Architecture

```
+-------------------------------------------------------+
|  Menu: File | Edit | Help                             |
+-------------------------------------------------------+
|  [Controls Tab] [Text Tab] [Drawing Tab] [Lists Tab]  |
+-------------------------------------------------------+
|                                                       |
|                  Tab Content Area                     |
|                  (varies by tab)                      |
|                                                       |
+-------------------------------------------------------+
|  Event Log Panel (wxListBox)                          |
|  - "Button 'Test' clicked"                            |
|  - "Checkbox toggled: checked"                        |
|  - "Mouse moved to (123, 456)"                        |
+-------------------------------------------------------+
|  Status Bar: Ready                                    |
+-------------------------------------------------------+
```

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `tests/wasm-app/minimal_test.cpp` | Replace | Comprehensive widget showcase |
| `tests/e2e/wxwidgets.spec.ts` | Update | Add interaction tests |

---

## Test Application Structure

### Control IDs

```cpp
enum {
    ID_BTN_TEST = wxID_HIGHEST + 1,
    ID_BTN_TOGGLE,
    ID_CHK_FEATURE,
    ID_RADIO_OPTIONS,
    ID_SLIDER,
    ID_GAUGE,
    ID_TEXT_SINGLE,
    ID_TEXT_MULTI,
    ID_TEXT_PASSWORD,
    ID_COMBO,
    ID_LISTBOX,
    ID_CHOICE,
    ID_BTN_CLEAR,
    ID_EVENT_LOG,
    ID_DRAWING_PANEL
};
```

### Main Classes

```cpp
class TestApp : public wxApp;           // Application entry point
class TestFrame : public wxFrame;        // Main frame with notebook and event log
class ControlsPage : public wxPanel;     // Tab 1: Buttons, checkboxes, sliders
class TextPage : public wxPanel;         // Tab 2: Text controls
class DrawingPage : public wxPanel;      // Tab 3: Mouse drawing canvas
class ListsPage : public wxPanel;        // Tab 4: Lists and dropdowns
class DrawingPanel : public wxPanel;     // Custom drawing canvas
```

---

## Tab Contents

### Tab 1: Controls

| Control | ID | Purpose |
|---------|-----|---------|
| wxButton ("Click Me") | `ID_BTN_TEST` | Basic click event |
| wxToggleButton ("Toggle") | `ID_BTN_TOGGLE` | Two-state button |
| wxCheckBox ("Enable feature") | `ID_CHK_FEATURE` | Boolean toggle |
| wxRadioBox ("Options": A/B/C) | `ID_RADIO_OPTIONS` | Exclusive selection |
| wxSlider (0-100) | `ID_SLIDER` | Range selection |
| wxGauge | `ID_GAUGE` | Shows slider value |

### Tab 2: Text Input

| Control | ID | Purpose |
|---------|-----|---------|
| wxTextCtrl (single-line) | `ID_TEXT_SINGLE` | Basic text input |
| wxTextCtrl (multi-line) | `ID_TEXT_MULTI` | Multi-line text |
| wxTextCtrl (password) | `ID_TEXT_PASSWORD` | Masked input |
| wxComboBox | `ID_COMBO` | Dropdown with text |

### Tab 3: Drawing Canvas

| Control | ID | Purpose |
|---------|-----|---------|
| DrawingPanel | `ID_DRAWING_PANEL` | Custom painting |
| wxButton ("Clear") | `ID_BTN_CLEAR` | Reset canvas |

Mouse interactions:
- `wxEVT_LEFT_DOWN` - Start drawing
- `wxEVT_MOTION` - Draw line segments
- `wxEVT_LEFT_UP` - End drawing

### Tab 4: Lists

| Control | ID | Purpose |
|---------|-----|---------|
| wxListBox | `ID_LISTBOX` | Multi-item selection |
| wxChoice | `ID_CHOICE` | Dropdown selection |
| Add/Remove buttons | - | Modify list contents |

---

## Event Log Panel

- `wxListBox` at bottom of frame
- ID: `ID_EVENT_LOG`
- Max 100 entries (older entries removed)
- Auto-scrolls to bottom
- Format: `"[HH:MM:SS] Event description"`

Events also logged to browser console for Playwright verification.

---

## Event Types to Test

| Event | Control | Test Method |
|-------|---------|-------------|
| `wxEVT_BUTTON` | Button | Click canvas coordinates |
| `wxEVT_TOGGLEBUTTON` | ToggleButton | Click and verify state |
| `wxEVT_CHECKBOX` | CheckBox | Click and verify checked |
| `wxEVT_RADIOBOX` | RadioBox | Click option and verify |
| `wxEVT_SLIDER` | Slider | Drag and verify value |
| `wxEVT_TEXT` | TextCtrl | Type and verify content |
| `wxEVT_TEXT_ENTER` | TextCtrl | Press Enter |
| `wxEVT_LISTBOX` | ListBox | Click item and verify |
| `wxEVT_CHOICE` | Choice | Click and select |
| `wxEVT_LEFT_DOWN` | Panel | Mouse down |
| `wxEVT_MOTION` | Panel | Mouse move |
| `wxEVT_LEFT_UP` | Panel | Mouse up |
| `wxEVT_PAINT` | Panel | Automatic on invalidate |

---

## Playwright Test Structure

```typescript
test.describe('wxWidgets WASM Comprehensive', () => {
  // Existing loading tests...

  test.describe('Controls Tab', () => {
    test('button click logs event');
    test('checkbox toggle works');
    test('slider interaction');
    test('radio button selection');
  });

  test.describe('Text Input Tab', () => {
    test('text input accepts keyboard');
    test('multiline text input');
    test('password field masks input');
  });

  test.describe('Drawing Tab', () => {
    test('mouse drag draws on canvas');
    test('clear button resets canvas');
  });

  test.describe('Lists Tab', () => {
    test('listbox selection');
    test('choice dropdown');
  });

  test.describe('Event Log', () => {
    test('events are logged visually');
  });
});
```

### Test Helpers

```typescript
// Wait for app to be ready
async function waitForApp(page: Page) {
  await page.waitForSelector('canvas', { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(500); // Let UI settle
}

// Simulate click at canvas coordinates
async function clickAt(page: Page, x: number, y: number) {
  const canvas = page.locator('canvas');
  await canvas.click({ position: { x, y } });
}

// Check console for event log entries
async function getConsoleEvents(page: Page): Promise<string[]> {
  // Capture console.log messages with [EVENT] prefix
}
```

---

## Testing Challenges & Solutions

### Challenge 1: Canvas Coordinate Mapping

wxUniversal renders all widgets to a single HTML5 canvas. Tests need to know widget positions.

**Solution**: Use consistent layout with predictable positions. Log control bounds to console on startup.

### Challenge 2: Verifying Event Log Content

The event log is inside the WASM app, not directly accessible from JavaScript.

**Solution**: Log events to browser console with `[EVENT]` prefix. Playwright captures via `page.on('console')`.

### Challenge 3: Keyboard Input

Need to route keyboard events to the correct wxWidgets control.

**Solution**: Focus canvas first, then use `page.keyboard.type()`. wxWidgets handles focus internally.

---

## wxUniversal Controls Reference

Available controls in wxUniversal (verified in `wxwidgets/include/wx/univ/`):

**Buttons:**
- wxButton, wxBitmapButton, wxToggleButton

**Input Controls:**
- wxCheckBox, wxRadioButton, wxRadioBox
- wxTextCtrl (single/multi-line)
- wxComboBox, wxChoice

**Lists:**
- wxListBox, wxCheckListBox

**Range Controls:**
- wxSlider, wxGauge, wxSpinButton

**Containers:**
- wxNotebook (tabbed container)
- wxPanel, wxScrolledWindow

**Static Controls:**
- wxStaticText, wxStaticBox, wxStaticLine

**Frame Elements:**
- wxMenu, wxMenuBar, wxStatusBar

---

## Implementation Steps

### Step 1: Update minimal_test.cpp

Replace current minimal test with comprehensive widget showcase.

Key components:
1. `TestFrame` constructor creates notebook, tabs, and event log
2. Each tab page creates its controls with appropriate sizers
3. Event handlers call `LogEvent()` to record actions
4. `LogEvent()` adds to wxListBox AND prints to console

### Step 2: Update Playwright Tests

Extend `tests/e2e/wxwidgets.spec.ts`:
1. Keep existing loading tests
2. Add test groups for each tab
3. Add console event capture
4. Add canvas interaction helpers

### Step 3: Build and Test

```bash
# Rebuild test app
./scripts/build-wasm-test.sh

# Run tests
cd tests && npm test

# Visual debugging
npm run test:ui
# or
cd wasm-app && npx serve .
```

---

## Success Criteria

### Visual Verification
- [ ] App displays with menu bar
- [ ] Four tabs visible and switchable
- [ ] Controls visible on each tab
- [ ] Event log panel at bottom

### Interaction Tests
- [ ] Button click logs "Button clicked"
- [ ] Checkbox toggle logs state change
- [ ] Slider drag updates gauge and logs value
- [ ] Text input shows typed text and logs changes
- [ ] Drawing canvas responds to mouse drag
- [ ] ListBox/Choice selection works

### Playwright Tests
- [ ] All existing loading tests pass
- [ ] Button interaction test passes
- [ ] Checkbox interaction test passes
- [ ] Text input test passes
- [ ] Drawing interaction test passes

---

## Dependencies

Before implementation:
- wxWidgets WASM build complete (`./scripts/build-wxuniversal-wasm.sh`)
- Existing Playwright tests passing (`cd tests && npm test`)

---

## References

- wxWidgets Samples: `wxwidgets/samples/widgets/` - Multi-widget showcase pattern
- wxWidgets Samples: `wxwidgets/samples/drawing/` - Custom painting pattern
- wxUniversal Headers: `wxwidgets/include/wx/univ/` - Available controls