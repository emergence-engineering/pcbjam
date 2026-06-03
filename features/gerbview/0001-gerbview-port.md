# Gerber Viewer (gerbview) WASM port — design notes

## Goal

Bring up KiCad's Gerber Viewer (`gerbview`, `FRAME_GERBER`) in the browser to the
"boots, canvas visible, click around" level the other ported apps reached. Scope is
launch-only — loading actual Gerber/drill files is out of scope for now.

## Approach

gerbview is its own standalone program + kiface (unlike symbol_editor, which lived
inside the eeschema kiface), so it follows the **pl_editor/pcbnew pattern** almost
verbatim: gate the native dynamic-kiface logic behind `if( EMSCRIPTEN )` and link the
kiface objects statically into the `gerbview` executable. `gerbview.cpp` (the
`KIFACE_GETTER`) is already part of `gerbview_kiface_objects`, so no source hoisting
was needed (unlike eeschema). There was no `#ifdef __EMSCRIPTEN__` frame stub to
remove (gerbview was never gated out, unlike the symbol editor).

## Changes (kicad submodule)

- **`kicad/gerbview/CMakeLists.txt`** — mirror pl_editor's WASM static-link block:
  - On EMSCRIPTEN, compile `common/single_top.cpp` with `TOP_FRAME=FRAME_GERBER`
    (no `BUILD_KIWAY_DLL`); wrap the native minimal exe link in `if( NOT EMSCRIPTEN )`.
  - Hoist the kiface deps into `GERBVIEW_KIFACE_LIBRARIES`; on EMSCRIPTEN link them
    directly into the `gerbview` exe with `LINKER:--allow-multiple-definition`.
  - Gate `gerbview.cpp` defs: EMSCRIPTEN → `COMPILING_DLL` (no `BUILD_KIWAY_DLL`, so
    `KIFACE_GETTER` links statically); else `BUILD_KIWAY_DLL;COMPILING_DLL`.
- **`kicad/gerbview/navlib/CMakeLists.txt`** — add an `if( EMSCRIPTEN )` branch that
  builds `gerbview_navlib` from the WASM stub instead of the real 3Dconnexion plugin
  (no SpaceMouse driver in the browser). The frame's navlib member uses
  `NL_GERBVIEW_PLUGIN` under WASM (`#ifndef __linux__`; emscripten doesn't define it).
- **`#include <wx/choice.h>`** added to three files that use `wxChoice` (the
  Cmp/Net/Attr/DCode aux-toolbar combo boxes) but only had the forward declaration:
  `gerbview/events_called_functions.cpp`, `gerbview/toolbars_gerber.cpp`,
  `gerbview/tools/gerbview_control.cpp`. Native builds pull `wx/choice.h` transitively;
  the WASM wxWidgets header config does not, so these failed with "member access into
  incomplete type 'wxChoice'". Include-what-you-use fix — behavior-neutral, upstream-safe.
  (`gerbview_frame.cpp` already gets it transitively; the generated `_base.cpp` carries
  its own includes — both left untouched to keep the fork minimal.)

## Changes (root repo)

- **`wasm/stubs/nl_gerbview_plugin_stub.cpp`** (NEW) — no-op `NL_GERBVIEW_PLUGIN`
  ctor/dtor + `SetCanvas`/`SetFocus`, mirroring `nl_pl_editor_plugin_stub.cpp`.
- **`scripts/kicad/build-gerbview.sh`** (NEW) — thin wrapper → `build-kicad-target.sh gerbview`.
- **`scripts/kicad/build-kicad-target.sh`** — add `gerbview` to the `pcbnew|eeschema)`
  case arm (target = subdir = `gerbview`); update usage strings.
- **`docker/build.sh`** — add `gerbview` to valid apps, dispatch case, and the `all`
  loop (now 6 apps).
- **`tests/scripts/setup-kicad-wasm.sh`** — `copy_app gerbview`.
- **`tests/apps/kicad/gerbview.html`** (NEW) — browser shell (copy of pl_editor.html;
  title, `thisProgram=/usr/bin/gerbview`, `gerbview.js`).
- **`tests/kicad/gerbview.spec.ts`** (NEW) + **`tests/package.json`** — launch-only
  smoke test (wizard, canvas visible, registry populated, ≥1 toolbar, no abort).

## Build & verify

```
./docker/build.sh gerbview          # seed fresh-branch cache from main first (see build-quirks memory)
cd tests && npm run setup:kicad && npm run test:gerbview
```

Expect: the viewer opens — menu bar, top + aux toolbars (with the Cmp/Net/Attr/DCode
combos), left tool toolbar, dark gerber canvas with grid + origin crosshair, and the
Layers/Items manager pane. `gerbview.spec.ts` passes (2/2, no abort).

## Known limitations

- No Gerber/drill files are loaded; the canvas is empty until a file is opened
  (file loading untested / out of scope).
- Symbol-editor-style drawing tools that require an open document behave per native
  KiCad (some are inactive with no layers loaded).
- No persistent storage (MEMFS only).
</content>
