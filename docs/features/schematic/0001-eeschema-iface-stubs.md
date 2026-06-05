# 0001 — eeschema IFACE sub-frame stubs (WASM)

## Why

Eeschema's `IFACE::CreateKiWindow` in [kicad/eeschema/eeschema.cpp](../../kicad/eeschema/eeschema.cpp) dispatches `FRAME_T` ids to four frame constructors:

- `FRAME_SCH` → `SCH_EDIT_FRAME` (the schematic editor — what we want)
- `FRAME_SCH_SYMBOL_EDITOR` → `SYMBOL_EDIT_FRAME` (symbol library editor)
- `FRAME_SCH_VIEWER` → `SYMBOL_VIEWER_FRAME` (symbol library viewer)
- `FRAME_SYMBOL_CHOOSER` → `SYMBOL_CHOOSER_FRAME` (symbol chooser dialog)
- `FRAME_SIMULATOR` → `SIMULATOR_FRAME` (already wrapped in try/catch — no patch needed)

The MVP scope for the WASM port is "empty schematic editor + draw a wire", so the three sub-frames (symbol editor / viewer / chooser) are out of scope. They are non-trivial to support in the browser — they need bundled symbol libraries, FS access for `.kicad_sym` lookup, and full dialog plumbing.

Compiling them out at the source level (removing `EESCHEMA_LIBEDIT_SRCS` from the build) cascades into many CMakeLists.txt and symbol-chooser sources; cleaner to keep the sources compiled and just refuse to instantiate the frames at the IFACE switch.

## What changed

`kicad/eeschema/eeschema.cpp`, the three sub-frame cases inside `IFACE::CreateKiWindow` are now guarded:

```cpp
case FRAME_SCH_SYMBOL_EDITOR:
#ifdef __EMSCRIPTEN__
    return nullptr;
#else
    return new SYMBOL_EDIT_FRAME( aKiway, aParent );
#endif

case FRAME_SCH_VIEWER:
#ifdef __EMSCRIPTEN__
    return nullptr;
#else
    return new SYMBOL_VIEWER_FRAME( aKiway, aParent );
#endif

case FRAME_SYMBOL_CHOOSER:
{
#ifdef __EMSCRIPTEN__
    return nullptr;
#else
    // … existing body …
#endif
}
```

`FRAME_SIMULATOR` is untouched — its existing `try/catch (SIMULATOR_INIT_ERR&)` block catches the ngspice init failure that our header stub eventually triggers, and returns nullptr the same way.

## How to apply

Captured under `features/schematic/kicad.patch` via `./scripts/create-feature-patches.sh schematic` once the build is green.

## Tested by

`tests/kicad/eeschema.spec.ts` — wizard completion + `Draw Wires` tool test. Neither test path exercises the stubbed-out frames.
