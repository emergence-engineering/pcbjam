# Symbol Editor WASM port — design notes

## Goal

Bring up KiCad's Symbol Editor (`FRAME_SCH_SYMBOL_EDITOR`, the `.kicad_sym`
library editor) in the browser, to the same "boots, canvas visible, click
around" level as the other ported apps. Scope is launch-only — library
load/save and the symbol viewer/chooser sub-frames are out of scope for now.

## Key insight

Unlike pcbnew / pl_editor, the symbol editor is **not a separate program**. It is
served by the **eeschema kiface**: its sources already compile into
`eeschema_kiface_objects` (`EESCHEMA_LIBEDIT_SRCS` + the `symbol_editor_*` tools in
`kicad/eeschema/CMakeLists.txt`). KiCad's universal launcher `common/single_top.cpp`
opens whichever frame the compile-time `TOP_FRAME` macro names.

So the port is just **a second launcher executable (`symbol_editor`) that links the
same eeschema kiface but compiles `single_top.cpp` with
`TOP_FRAME=FRAME_SCH_SYMBOL_EDITOR`** — no new sources, no new kiface, no extracting
symbol-editor code. The eeschema kiface (deps, navlib, stubs, libraries) is reused
verbatim.

## Changes

### kicad submodule (2 files)

- **`kicad/eeschema/CMakeLists.txt`** — a WASM-only (`if( EMSCRIPTEN )`) block adds the
  `symbol_editor` executable. Because `single_top.cpp`'s `COMPILE_DEFINITIONS` are
  directory-scoped (already pinned to `TOP_FRAME=FRAME_SCH` for the `eeschema` exe),
  we `configure_file`-copy it to a private TU (`symbol_editor_single_top.cpp`) and set
  that copy's `TOP_FRAME=FRAME_SCH_SYMBOL_EDITOR;PGM_DATA_FILE_EXT="kicad_sym"`. The exe
  links `EESCHEMA_KIFACE_LIBRARIES` directly with `LINKER:--allow-multiple-definition`,
  mirroring the eeschema/pcbnew static-link pattern.
- **`kicad/eeschema/eeschema.cpp`** — `IFACE::CreateKiWindow`'s `FRAME_SCH_SYMBOL_EDITOR`
  case was stubbed to `return nullptr` on `__EMSCRIPTEN__` during the eeschema MVP
  (see `../schematic/0001-eeschema-iface-stubs.md`). That stub is now removed so
  the frame is constructed in WASM like the native build. This was THE blocker: with the
  stub, `Kiway.Player(FRAME_SCH_SYMBOL_EDITOR)` returned null, `single_top`'s `OnInit`
  bailed, and the app sat idle with a blank canvas (no abort, no error).

  The symbol viewer (`FRAME_SCH_VIEWER`) and chooser (`FRAME_SYMBOL_CHOOSER`) remain
  stubbed — out of scope, and the chooser needs bundled libraries we don't ship.

### Root repo

- **`scripts/kicad/build-symbol_editor.sh`** — thin wrapper around
  `build-kicad-target.sh symbol_editor`.
- **`scripts/kicad/build-kicad-target.sh`** — adds `symbol_editor` to the `case`. CMake
  target is `symbol_editor` but its build subdir is `eeschema` (it's part of that
  kiface), so a `KICAD_SUBDIR` variable now distinguishes target name from subdir for
  the output-path log and embind include.
- **`docker/build.sh`** — adds `symbol_editor` to valid apps, the `all` loop, and
  `kicad_subdir_for` (`symbol_editor → eeschema`); artifacts land at
  `build-wasm/kicad-symbol_editor/eeschema/symbol_editor.{js,wasm}`.
- **`tests/apps/kicad/symbol_editor.html`** — browser shell (copy of eeschema.html with
  title + `thisProgram=/usr/bin/symbol_editor` + `symbol_editor.js`).
- **`tests/scripts/setup-kicad-wasm.sh`** — `copy_app symbol_editor` + subdir map entry.
- **`tests/kicad/symbol_editor.spec.ts`** + **`tests/package.json`** — launch-scope smoke
  test (canvas visible, registry populated, toolbars present, no WASM abort), mirroring
  eeschema's wizard-aware flow.

### wxwidgets submodule

No changes needed — the file-dialog and double-click fixes landed with the pl_editor port.

## Build & verify

```
./docker/build.sh symbol_editor
cd tests && npm run setup:kicad && npm run test:symbol_editor
# or serve tests/apps/kicad and open symbol_editor.html
```

Expect: the symbol editor window opens — menu bar, top + left + right toolbars
(incl. pin/rect/circle/line drawing tools), the symbol library tree pane with the
filter box, the gridded canvas with the symbol-origin crosshair, and a status bar.

## Known limitations

- No bundled symbol libraries, so the library tree is empty (`SyncLibraries` reports
  `libCount=0`). Opening/creating/saving `.kicad_sym` files is untested (out of scope).
- Symbol viewer and symbol chooser frames are still stubbed out for WASM.
- No persistent storage (MEMFS only).
</content>
