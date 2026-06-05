# pl_editor (drawing-sheet editor) WASM port — design notes

## Goal

Bring up KiCad's `pagelayout_editor` sub-app (also known as `pl_editor`, the drawing-sheet editor) in the browser, to the same "boots, canvas visible, partially usable in-session" level as `pcbnew`. Persistence across sessions not required.

## Approach

Mirrors the in-tree pattern that pcbnew/calculator/eeschema use: gate WASM differences behind `if( EMSCRIPTEN )` blocks inside the upstream `pagelayout_editor/CMakeLists.txt`, keeping a single source of truth for the build alongside KiCad's existing platform conditionals (`if( WIN32 )`, `if( APPLE )`).

(An earlier iteration tried an out-of-tree CMake wrapper to keep the kicad submodule bit-for-bit upstream. It worked, but diverged from the team norm — every other WASM-ported app modifies kicad. We converged to the team pattern; the only kicad-side cost is a ~80-line patch in this app's CMakeLists.txt, all WASM-conditional.)

## Changes (see kicad.patch + root.patch + wxwidgets.patch)

### kicad submodule

- **`kicad/pagelayout_editor/CMakeLists.txt`** — mirrors pcbnew's WASM static-linking pattern:
  - Drop `BUILD_KIWAY_DLL` from `single_top.cpp` and `pl_editor.cpp` compile defs on EMSCRIPTEN (browser can't `dlopen` a `.kiface` shared library).
  - Split `pl_editor_kiface` into an OBJECT library (`pl_editor_kiface_objects`) + an empty MODULE; lets the same compiled objects be linked statically into the exe on WASM and dynamically into the `.kiface` module on native.
  - On EMSCRIPTEN, link `pl_editor` directly against `PL_EDITOR_KIFACE_LIBRARIES` with `LINKER:--allow-multiple-definition` (handles wxWidgets/nanosvg duplicate symbols, same as pcbnew).
- **`kicad/pagelayout_editor/navlib/CMakeLists.txt`** — for EMSCRIPTEN, replace the real 3Dconnexion SpaceMouse plugin sources with `wasm/stubs/nl_pl_editor_plugin_stub.cpp` (no USB hardware in the browser).

### Root repo

- **`wasm/stubs/nl_pl_editor_plugin_stub.cpp`** — no-op `NL_PL_EDITOR_PLUGIN` ctor/dtor + `SetCanvas`/`SetFocus`, mirroring `nl_pcbnew_plugin_stub.cpp`.
- **`scripts/kicad/build-pl_editor.sh`** — thin wrapper around `build-kicad-target.sh pl_editor`.
- **`scripts/kicad/build-kicad-target.sh`** — adds `pl_editor` to the `case` (uses upstream target name `pl_editor`, source subdir `pagelayout_editor`).
- **`docker/build.sh`** — adds `pl_editor` to the unified app dispatch (valid apps + `all` loop + `kicad_subdir_for`).
- **`tests/apps/kicad/pl_editor.html`** — browser shell; `preRun` creates `/home/kicad` and `FS.chdir` there so file dialogs land somewhere friendly instead of MEMFS root.
- **`tests/scripts/setup-kicad-wasm.sh`** — `copy_app pl_editor` added to the existing list.
- **`tests/e2e/filedialog-folder-nav.spec.ts`** — regression test for the wxFileDialog folder-navigation fix.

### wxwidgets submodule (file dialog usability fixes)

These were discovered while bringing up pl_editor's file dialog but apply to any wxWidgets-WASM app:

- **`wxwidgets/src/generic/filedlgg.cpp`** — `wxGenericFileDialog::OnOk` now navigates into the selected entry when it's a directory instead of closing the dialog and surfacing the folder path to the caller as if it were a file. Without this, KiCad's "Open Drawing Sheet" produced "Unable to load /dev file" when the user selected `/dev` (a directory in MEMFS).
- **`wxwidgets/src/wasm/mouse.cpp`** — stateful double-click detection. `EmscriptenMouseEvent` has no click-count field, so `wxEVT_LEFT_DCLICK` literally never fired in the WASM build — breaking `EVT_LIST_ITEM_ACTIVATED` on every listctrl. Now two MOUSEDOWNs of the same button within 500ms emit DCLICK.

## Build & verify

```
./docker/build.sh pl_editor
./tests/scripts/setup-kicad-wasm.sh
# serve tests/apps/kicad and open pl_editor.html
```

Expect: window opens, canvas renders, File > Open / Save As dialogs work (folder navigation via single-click + Enter, single-click + OK, or double-click). Dialog lands at `/home/kicad` by default.

## Known limitations

- No persistent storage (MEMFS only); files vanish on tab close.
- No keyboard accelerator for "navigate to parent directory" beyond the up-arrow button + ".." entry.
- Drawing-sheet-specific tooling beyond basic edit/save is untested (out of MVP scope).
