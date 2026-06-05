# WASM Compatibility Layer

This directory contains WASM-specific implementations that allow KiCad to run in a
web browser while keeping our KiCad fork **as close to upstream as possible**.

## Principle

Instead of patching KiCad source files, we:
1. Provide alternative implementations for platform-specific code (kiplatform)
2. Stub out libraries/features that can't work in the browser (libgit2, curl, nng, scripting, 3D viewer, ...)
3. Expose KiCad to JavaScript via Embind bindings
4. Override host package detection during cross-compilation (cmake find-modules)

The KiCad-side hooks for this are small `if(EMSCRIPTEN)` branches in KiCad's own
CMakeLists that pull sources from this directory — see "How it's wired" below.

## Directory Structure

```
wasm/
├── README.md               # This file
├── kiplatform/             # Platform abstraction implementations (compiled into KiCad)
│   ├── app.cpp             # App lifecycle (paths, startup)
│   ├── drivers.cpp         # GPU detection (returns "WebGL")
│   ├── environment.cpp     # Environment variables
│   ├── io.cpp              # File I/O (WASM virtual filesystem)
│   ├── policy.cpp          # Security policy (always permissive)
│   ├── secrets.cpp         # Credential storage
│   ├── sysinfo.cpp         # System information
│   ├── printing.cpp        # Print support (browser print())
│   └── ui.cpp              # UI helpers
├── bindings/               # Embind bindings exposing each app to JavaScript
│   ├── pcbnew_embind.cpp
│   ├── eeschema_embind.cpp
│   ├── pl_editor_embind.cpp
│   └── calculator_embind.cpp
├── stubs/                  # Stub implementations + header shims for unavailable deps
│   ├── *.c / *.cpp         # libgit2, curl, nng, scripting, 3D viewer, frame stubs, ...
│   ├── char_traits_uint16_workaround.h
│   └── GL/ nng/ ngspice/   # Header stubs found via include paths
└── cmake/                  # CMake find-module overrides for cross-compilation
    └── Find*.cmake / Use*.cmake
```

## How it's wired

### kiplatform — compiled into KiCad

The `kiplatform/*.cpp` files are added directly to KiCad's kiplatform library by an
`if(EMSCRIPTEN)` branch in `kicad/libs/kiplatform/CMakeLists.txt`, which references
them as `${PROJECT_SOURCE_DIR}/../wasm/kiplatform/*.cpp`. There is no separate
`libkiplatform_wasm.a`.

### stubs — compiled by the build script and KiCad CMakeLists

`scripts/kicad/build-kicad-target.sh` compiles the C stubs (`libgit2_stub.c`,
`curl_stub.c`, `nng_stub.c`) and force-includes `char_traits_uint16_workaround.h`.
App-specific `*_frame_stub.cpp` / `*_scripting_stub.cpp` are picked up per app, and
the remaining `*_stub.cpp` files are pulled in by `if(EMSCRIPTEN)` branches in the
KiCad fork's own CMakeLists. Header stubs under `GL/`, `nng/`, `ngspice/` are resolved
via include paths.

### bindings — per app

`build-kicad-target.sh` compiles `wasm/bindings/<app>_embind.cpp` for the app being
built (apps without an embind file get an empty placeholder object).

### cmake — module path

`build-kicad-target.sh` passes `-DCMAKE_MODULE_PATH="${PROJECT_ROOT}/wasm/cmake"` so
the WASM find-module stubs override host package detection.

> Coroutine/fiber support is **not** in this directory — it comes from the KiCad fork's
> `kicad/thirdparty/libcontext/libcontext.cpp` (`LIBCONTEXT_PLATFORM_wasm32`). The GLU
> tesselator comes from `kicad/libs/kimath/glu_tess/glu_tess_impl.cpp`.

## Adding New Implementations

1. Create the implementation file in the appropriate directory (`kiplatform/`, `stubs/`, `bindings/`).
2. Wire it in: a stub C file goes in `build-kicad-target.sh`; a kiplatform/app source
   goes in the relevant `if(EMSCRIPTEN)` branch of the KiCad-side CMakeLists.
3. Ensure the header interface matches KiCad's expected interface.
4. Test with a minimal build before full integration.
