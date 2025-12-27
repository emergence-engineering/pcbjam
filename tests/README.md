# KiCad WASM Tests

Playwright tests for verifying the wxWidgets WASM port.

## Prerequisites

- Node.js 18+
- Emscripten SDK (for building)

## Building the Test App

```bash
../scripts/build-wasm-test.sh
```

This builds `apps/minimal_test.{html,js,wasm}` and standalone test apps.

## Running Tests

```bash
npm install
npm test
```

To run specific tests:
```bash
npx playwright test menu.spec.ts        # Run menu tests only
npx playwright test --grep "wxTimer"    # Run tests matching pattern
```

## Test Structure

```
tests/
├── e2e/                    # Playwright test specs
│   ├── utils/              # Shared test utilities
│   │   ├── fixtures.ts     # Playwright fixtures with auto-logging
│   │   └── test-utils.ts   # Logging and helper functions
│   ├── menu.spec.ts        # wxMenuBar tests
│   ├── timer.spec.ts       # wxTimer tests
│   ├── dialog.spec.ts      # wxDialog/wxMessageBox tests
│   ├── tree.spec.ts        # wxTreeCtrl tests
│   ├── grid.spec.ts        # wxGrid/wxSpinCtrl/wxSearchCtrl tests
│   ├── opengl.spec.ts      # OpenGL tab tests
│   ├── wxwidgets.spec.ts   # Comprehensive UI interaction tests
│   └── ...
├── logs/                   # Test logs (auto-generated)
├── test-results/           # Screenshots (auto-generated)
├── baseline-screenshots/   # Reference screenshots for comparison
├── apps/              # Built WASM test applications
│   ├── minimal_test.html  # Main test app
│   └── standalone/        # Individual component test apps
└── playwright.config.ts   # Playwright configuration
```

## Logging

Each test automatically captures:
- Console logs with timestamps and log levels
- Page errors with full stack traces

Log files are written to `logs/` after each test:
- `<test-name>.log` - All console output
- `<test-name>.errors.log` - Errors only (created if errors occurred)

Example log format:
```
[2025-11-29T19:39:42.165Z] [LOG] [EVENT] Application started
[2025-11-29T19:39:42.733Z] [WARNING] GPU stall due to ReadPixels
[2025-11-29T19:39:42.801Z] [ERROR] Some error message
```

## Screenshots

Tests capture screenshots to `test-results/`. Compare against baselines:
```bash
../scripts/compare-screenshots.sh
```

## Viewing the App Directly

Start a local server in the apps directory:

```bash
cd apps
npx serve .
```

Then open http://localhost:3000/minimal_test.html in your browser.

Alternative using Python:

```bash
cd apps
python3 -m http.server 8000
```

Then open http://localhost:8000/minimal_test.html

## Test Categories

| Spec File | Tests | Description |
|-----------|-------|-------------|
| `wxwidgets.spec.ts` | Comprehensive | Full UI interaction, stability, OpenGL |
| `menu.spec.ts` | wxMenuBar | Menu bar visibility and interactions |
| `timer.spec.ts` | wxTimer | Timer start/stop/reset functionality |
| `dialog.spec.ts` | wxDialog | Message boxes and custom dialogs |
| `tree.spec.ts` | wxTreeCtrl | Tree control with expand/collapse |
| `grid.spec.ts` | wxGrid | Grid, SpinCtrl, SearchCtrl |
| `opengl.spec.ts` | OpenGL | GL tests (immediate mode, vertex arrays) |
| `aui.spec.ts` | wxAuiManager | Dockable panels |
| `clipboard.spec.ts` | wxClipboard | Copy/paste operations |
| `dataview.spec.ts` | wxDataViewCtrl | List and tree data views (Zone Manager-like) |
| `filedialog.spec.ts` | wxFileDialog | File open/save dialogs |
| `htmlwin.spec.ts` | wxHtmlWindow | HTML rendering (About dialogs, error formatting) |
| `layout.spec.ts` | wxSplitter | Splitter and scrolled windows |
| `toolbar.spec.ts` | wxToolBar | Toolbar buttons and status bar |

## Debugging WASM Crashes

When a test fails with a WASM crash (e.g., "memory access out of bounds"), you can build with debug symbols to get meaningful stack traces:

### Debug Build

```bash
# Build test apps with DWARF symbols and source maps
../scripts/build-wasm-test.sh --debug
```

This enables:
- `-g` for DWARF debug info
- `-gsource-map` for browser source maps
- `-O0` for no optimization (preserves debugging context)

### Reading Stack Traces

With a debug build, WASM stack traces show actual function names:

**Before (release build):**
```
RuntimeError: memory access out of bounds
    at wasm-function[102]:0xfdf8
    at wasm-function[99]:0xe6e0
```

**After (debug build):**
```
RuntimeError: memory access out of bounds
    at grid_test.wasm.GridTestFrame::LogEvent(wxString const&)
    at grid_test.wasm.GridTestFrame::OnGridCellSelect(wxGridEvent&)
    at grid_test.wasm.wxEventFunctorMethod<...>::operator()
```

### Using LLVM Tools

For deeper analysis, use Emscripten's LLVM tools:

```bash
LLVM_DIR="/opt/homebrew/Cellar/emscripten/4.0.20/libexec/llvm/bin"

# Check if WASM has DWARF info
$LLVM_DIR/llvm-dwarfdump --debug-info apps/standalone/grid/grid_test.wasm

# Disassemble with function names
$LLVM_DIR/llvm-objdump -d grid_test.wasm | head -200
```

## Button Finder Utility

The wxWidgets WASM apps render to a canvas, so UI tests need to click at specific pixel coordinates. The button-finder utility scans a test app to find clickable button positions.

**Note:** This utility is excluded from regular test runs (`npm test`). Use the dedicated config to run it.

### Usage

```bash
cd tests

# Use the dedicated button-finder config (recommended)
APP_URL=/standalone/clipboard/clipboard_test.html npx playwright test --config=playwright-button-finder.config.ts

# Scan with custom region (faster - focus on likely button area)
APP_URL=/standalone/dialog/dialog_test.html START_Y=150 END_Y=300 STEP=8 npx playwright test --config=playwright-button-finder.config.ts

# Scan dataview test app for button positions
APP_URL=/standalone/dataview/dataview_test.html STEP=8 START_Y=80 END_Y=180 npx playwright test --config=playwright-button-finder.config.ts

# Scan htmlwin test app
APP_URL=/standalone/htmlwin/htmlwin_test.html STEP=8 START_Y=80 END_Y=160 npx playwright test --config=playwright-button-finder.config.ts
```

### Available Test Apps

| App URL | Description |
|---------|-------------|
| `/standalone/clipboard/clipboard_test.html` | Copy, Paste, Check, Clear buttons |
| `/standalone/dataview/dataview_test.html` | wxDataViewListCtrl and wxDataViewTreeCtrl (Zone Manager-like data) |
| `/standalone/dialog/dialog_test.html` | Info, Yes/No, Error, Custom dialog buttons |
| `/standalone/htmlwin/htmlwin_test.html` | wxHtmlWindow with various HTML content |
| `/standalone/tree/tree_test.html` | Expand All, Collapse All, etc. |
| `/standalone/menu/menu_test.html` | Menu bar testing |
| `/standalone/grid/grid_test.html` | Grid controls |
| `/standalone/aui/aui_test.html` | AUI panel controls |
| `/standalone/toolbar/toolbar_test.html` | Toolbar buttons |
| `/standalone/timer/timer_test.html` | Timer controls |
| `/standalone/filedialog/filedialog_test.html` | File dialog buttons |
| `/standalone/layout/layout_test.html` | Layout controls |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_URL` | (required) | URL path to scan |
| `STEP` | `10` | Pixel step size for scanning (smaller = more accurate but slower) |
| `START_X` | `0` | X coordinate to start scanning |
| `END_X` | canvas width | X coordinate to end scanning |
| `START_Y` | `0` | Y coordinate to start scanning |
| `END_Y` | canvas height | Y coordinate to end scanning |

### Output

The utility outputs:
- Button positions with labels (from console log keywords)
- Generated test code snippets
- Results JSON file at `test-results/button-finder-results.json`

Example output:
```
RESULTS: Found 4 buttons

Button positions (relative to canvas):

  Copy         at (352, 196)
    Log: [CLIPBOARD_EVENT] Attempting to copy text to clipboard...

  Paste        at (600, 196)
    Log: [CLIPBOARD_EVENT] Attempting to paste from clipboard...
```

## Known Issues

- **Timer tests**: May fail due to timing sensitivity
- **Tree tests**: Button click positions may vary
