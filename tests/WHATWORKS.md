# wxWidgets WASM Test Status

Last updated: 2025-11-29

## Test Summary

**83 Playwright tests pass, 8 failing (timer/tree coordinate issues)**

| Category | Status | Notes |
|----------|--------|-------|
| Main App Load | WORKS | minimal_test.html loads and renders correctly |
| Standalone Apps | WORKS | 10 standalone test apps |
| wxGrid | BROKEN | Crashes with "memory access out of bounds" |
| wxTreeCtrl | BROKEN | Crashes on startup |
| wxTimer | PARTIAL | Timer test app works, some tests have coordinate issues |
| wxDialog | WORKS | Modal dialogs render correctly with Asyncify |

---

## KiCad wxWidgets Usage Coverage

This section maps KiCad's wxWidgets usage to our test coverage.

### Critical for KiCad - WORKING

| KiCad Feature | wxWidgets Class | Test Status | Evidence |
|---------------|-----------------|-------------|----------|
| Main window frame | wxFrame | WORKS | All apps show frame with title |
| Menu bar (File, Edit, etc.) | wxMenuBar | WORKS | menu-03-file-clicked.png shows dropdown |
| Toolbars | wxToolBar | WORKS | toolbar-01-loaded.png shows icons |
| Status bar (coords, zoom) | wxStatusBar | WORKS | 3-field status bar like KiCad |
| Dockable panels | wxAuiManager | WORKS | aui-01-loaded.png shows Properties/Layers/Messages |
| Tab panels | wxNotebook | WORKS | 7 tabs switching correctly |
| Property editor panels | wxSplitterWindow | WORKS | layout-01-loaded.png shows split panes |
| Scrollable content | wxScrolledWindow | WORKS | 20 items scrollable in each pane |
| OpenGL canvas | wxGLCanvas | WORKS | gl-01-opengl-tab.png shows rendering |
| OpenGL context | wxGLContext | WORKS | Context created successfully |
| Drawing/painting | wxDC | WORKS | 08-drawing-done.png shows strokes |
| Mouse events | wxMouseEvent | WORKS | Drawing strokes captured |

### Controls - WORKING

| KiCad Use | wxWidgets Class | Test Status | Evidence |
|-----------|-----------------|-------------|----------|
| Action buttons | wxButton | WORKS | "Click Me" button functional |
| Toggle tools | wxToggleButton | WORKS | Toggle button in Controls tab |
| Options | wxCheckBox | WORKS | "Enable feature" checkbox |
| Selection groups | wxRadioButton | WORKS | Option A/B/C working |
| Value adjustment | wxSlider | WORKS | Slider draggable |
| Progress display | wxGauge | WORKS | Gauge renders |
| Numeric input | wxSpinCtrl | WORKS | spinctrl-01-visible.png shows control |
| Search fields | wxSearchCtrl | WORKS | Search field with placeholder |
| Item lists | wxListBox | WORKS | Item selection with highlight |
| Dropdowns | wxChoice | WORKS | 10a-choice-dropdown-open.png shows popup |
| Editable dropdowns | wxComboBox | WORKS | Visible in Text Input tab |

### Text Input - WORKING

| KiCad Use | wxWidgets Class | Test Status | Evidence |
|-----------|-----------------|-------------|----------|
| Single-line entry | wxTextCtrl | WORKS | Text input accepts typing |
| Multi-line entry | wxTextCtrl (multiline) | WORKS | Line 1/2/3 typed successfully |
| Password fields | wxTextCtrl (password) | WORKS | Password field visible |

### OpenGL Rendering - WORKING

| KiCad Use | GL Function | Test Status | Evidence |
|-----------|-------------|-------------|----------|
| Immediate mode | glBegin/glEnd | WORKS | Rainbow triangle renders |
| Vertex positioning | glVertex2f/3f | WORKS | Shapes positioned correctly |
| Colors | glColor3f/4f | WORKS | Rainbow colors visible |
| Triangles | GL_TRIANGLES | WORKS | Triangle visible |
| Quads | GL_QUADS | WORKS | Yellow rectangle visible |
| Lines | GL_LINES | WORKS | Cyan lines visible |
| Matrix operations | glMatrixMode, glTranslatef | WORKS | Test passes |
| Vertex arrays | glVertexPointer, glDrawElements | WORKS | Test passes |
| State management | glEnable, glDisable | WORKS | Test passes |
| Blending | glBlendFunc, GL_BLEND | WORKS | Test passes |

### File Operations - PARTIAL

| KiCad Use | wxWidgets Class | Test Status | Notes |
|-----------|-----------------|-------------|-------|
| Open file dialog | wxFileDialog (FD_OPEN) | PARTIAL | Dialog events fire, browser file picker |
| Save file dialog | wxFileDialog (FD_SAVE) | PARTIAL | Dialog events fire, browser file picker |
| Multiple file selection | wxFileDialog (FD_MULTIPLE) | PARTIAL | Events fire |

---

## BROKEN Features

### wxGrid - CRASHES
- **Status**: Standalone grid_test crashes with "memory access out of bounds"
- **KiCad Impact**: HIGH - KiCad uses wxGrid for property editors, DRC results, BOM
- **Evidence**: wxgrid-dedicated-page.png shows red error "Exception thrown"
- **Error**: `RuntimeError: memory access out of bounds` at wasm-function[101]

### wxTreeCtrl - CRASHES
- **Status**: Standalone tree_test crashes on startup
- **KiCad Impact**: HIGH - KiCad uses wxTreeCtrl for hierarchy browsers, component trees
- **Evidence**: tree-01-loaded.png shows red error "Exception thrown, see JavaScript console"
- **Note**: Similar crash pattern to wxGrid - both may have same underlying issue

### wxMessageBox/wxDialog - WORKING ✓
- **Status**: Modal dialogs render correctly with Asyncify
- **KiCad Impact**: MEDIUM - Alert messages, confirmations
- **Evidence**: dialog-02-info-clicked.png shows Info dialog with icon, title, message, OK button
- **Fix**: Enabled Asyncify in build flags (`-sASYNCIFY=1 -sASYNCIFY_IMPORTS=['startModal']`)
- **Details**: ShowModal() now properly blocks until user closes dialog

### wxClipboard - LIMITED
- **Status**: App loads but "Could not open clipboard" errors
- **KiCad Impact**: MEDIUM - Copy/paste operations
- **Evidence**: Clipboard logs show open errors
- **Cause**: Browser clipboard API restrictions

---

## Standalone Test Apps

Organized in `wasm-app/standalone/` folders:

| App | Status | Tests | KiCad Relevance |
|-----|--------|-------|-----------------|
| menu/menu_test | WORKS | 5/5 | Menu system |
| toolbar/toolbar_test | WORKS | 6/6 | Tool palettes |
| layout/layout_test | WORKS | 5/5 | Split panel layout |
| aui/aui_test | WORKS | 5/5 | Dockable panels |
| clipboard/clipboard_test | WORKS* | 6/6 | Copy/paste (*limited) |
| filedialog/filedialog_test | WORKS | 5/5 | Open/save dialogs |
| grid/grid_test | BROKEN | 0/1 | Property grids |
| dialog/dialog_test | WORKS | 5/5 | Alerts/confirmations |
| timer/timer_test | PARTIAL | 1/4 | Auto-save, animations |
| tree/tree_test | BROKEN | 0/7 | Hierarchy browsers |

---

## Main App Test Coverage

### Controls Tab
- wxButton: Click events logged
- wxToggleButton: Toggle state changes
- wxCheckBox: Check/uncheck works
- wxRadioButton: Selection switches between options
- wxSlider: Value changes on drag
- wxGauge: Renders progress bar

### Text Input Tab
- Single-line wxTextCtrl: Keyboard input works
- Multi-line wxTextCtrl: Multiple lines typed
- Password wxTextCtrl: Masked input
- wxComboBox: Editable dropdown

### Drawing Tab
- Mouse down/up events captured
- Line strokes drawn on wxPanel
- Clear Canvas button works
- wxDC drawing operations functional

### Lists Tab
- wxListBox: Item selection with blue highlight
- Add/Remove buttons functional
- wxChoice: Dropdown opens with items (Red, Green, Blue, Yellow, Purple)

### OpenGL Tab
- wxGLCanvas renders blue background
- Immediate mode: Rainbow triangle
- GL_QUADS: Yellow rectangle
- GL_LINES: Cyan lines
- Vertex arrays: Working
- Matrix operations: Working
- State management: Working
- Texture coordinates: Working

### Grid Tab
- wxSpinCtrl: Renders with up/down arrows
- wxSearchCtrl: Renders with search icon and clear button
- wxGrid: NOT WORKING (crashes in standalone, note shown in main app)

### Dialogs Tab
- wxMessageBox: Info, Yes/No, Error dialogs render with icons and buttons
- wxDialog: Custom dialogs render with title bar, content, OK/Cancel buttons
- wxTimer: Start/Stop buttons, counter display
- **Working**: Modal dialogs block and wait for user input via Asyncify

---

## KiCad Readiness Assessment

### Ready for KiCad
1. Window management (wxFrame, wxMenuBar, wxToolBar, wxStatusBar)
2. Panel docking (wxAuiManager)
3. Layout controls (wxSplitterWindow, wxScrolledWindow, wxNotebook)
4. Basic controls (buttons, checkboxes, radio buttons, sliders)
5. Text input (single/multi-line)
6. List controls (wxListBox, wxChoice, wxComboBox)
7. OpenGL rendering (immediate mode, vertex arrays, matrix ops)
8. Drawing/painting (wxDC, mouse events)
9. **wxMessageBox/wxDialog** - Modal dialogs with Asyncify

### Needs Work for KiCad
1. **wxGrid** - Critical for property editors, DRC, BOM tables
2. **wxClipboard** - Copy/paste (browser limitations)

### Untested for KiCad
1. wxTreeCtrl (hierarchy browser)
2. wxDataViewCtrl (advanced lists)
3. wxRichTextCtrl (formatted text)
4. wxStyledTextCtrl (code editor)
5. Printing support
6. Drag and drop

---

## Build Notes

### GL vs Non-GL Apps
- Main app (minimal_test) uses `LDFLAGS_GL` with OpenGL support
- Standalone test apps use `LDFLAGS_NOGL` without OpenGL
- This prevents "_glBegin is not defined" crashes in non-GL apps

### Build Command
Always use the build script:
```bash
cd tests/wasm-app && ./build-test-apps.sh
```

---

## Baseline Screenshots

The test suite captures screenshots during test runs for visual regression testing. These screenshots are compared against a baseline to detect unexpected visual changes.

### Directory Structure

```
tests/
├── baseline-screenshots/     # Known-good reference screenshots (121 files)
├── test-results/            # Screenshots from latest test run
└── wasm-app/
    └── e2e/                 # Playwright test specs
```

### Comparing Screenshots

Use the comparison script to check for visual regressions:

```bash
./scripts/compare-screenshots.sh
```

This will:
- Compare all baseline screenshots with current test results
- Report identical, different, and missing screenshots
- Show file size differences (useful for detecting changes)

Example output:
```
=== Screenshot Comparison ===
Baseline:     /path/to/tests/baseline-screenshots
Test Results: /path/to/tests/test-results

=== Comparing Baseline Screenshots ===
DIFFERENT: dialogs-msgbox-info-open.png (baseline: 47468B, current: 47478B, diff: 10B / .02%)

=== Summary ===
Total baseline screenshots: 121
Identical:                  54
Different:                  67
Missing from test results:  0
```

### Understanding Differences

Small byte differences (<2%) are typically caused by:
- **Timestamps** in event logs (e.g., `[19:45:35]` vs `[18:49:35]`)
- **PNG compression** variations between runs
- **Anti-aliasing** differences

These are **not** visual regressions. Visually inspect screenshots if you see larger differences.

### Updating Baseline Screenshots

After verifying changes are intentional, update the baseline:

```bash
# Copy current screenshots to baseline
cp tests/test-results/*.png tests/baseline-screenshots/

# Or selectively update specific screenshots
cp tests/test-results/dialog-*.png tests/baseline-screenshots/
```

### Running Tests with Screenshots

```bash
cd tests/wasm-app
npm test                    # Run all tests (saves screenshots to test-results/)
npx playwright test --ui    # Interactive mode with screenshot preview
```

---

## Screenshots Reference

| Screenshot | Shows |
|------------|-------|
| 03-after-load.png | Controls tab with all widgets |
| 06-text-input-typed.png | Text input with typed content |
| 08-drawing-done.png | Drawing strokes on canvas |
| 09-lists-tab.png | ListBox and Choice controls |
| 10a-choice-dropdown-open.png | Dropdown menu open |
| gl-01-opengl-tab.png | OpenGL rendering |
| aui-01-loaded.png | AUI dockable panels |
| menu-03-file-clicked.png | File menu dropdown |
| toolbar-01-loaded.png | Toolbar with icons |
| layout-01-loaded.png | Splitter window |
| spinctrl-01-visible.png | SpinCtrl and SearchCtrl |
| wxgrid-dedicated-page.png | Grid crash error |
| dialog-02-info-clicked.png | Info dialog with icon, message, OK button |
| dialog-03-yesno-clicked.png | Yes/No/Cancel confirmation dialog |
| dialogs-custom-open.png | Custom wxDialog modal |
