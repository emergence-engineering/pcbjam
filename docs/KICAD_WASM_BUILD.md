# KiCad WASM Build State

## Build Output

| File | Size | Description |
|------|------|-------------|
| `pcbnew.wasm` | 15MB | WebAssembly binary |
| `pcbnew.js` | 146KB | JS loader/glue |

Location: `build-wasm/kicad-pcbnew/pcbnew/`

## Build Command

```bash
# Full build (clean)
./scripts/kicad/build-pcbnew.sh

# Incremental build
./scripts/kicad/build-pcbnew.sh --no-clean --skip-deps

# Inside Docker
docker compose -f docker/docker-compose.yml exec kicad-wasm-builder \
    /workspace/scripts/kicad/build-pcbnew.sh
```

## Build Configuration

```
Memory: 256MB initial, 4GB max (ALLOW_MEMORY_GROWTH)
Threads: pthreads with pool of 4
Async: ASYNCIFY enabled (64KB stack)
Graphics: wxUniversal + Cairo GAL
```

---

## KiCad Fork Modifications (`/kicad`)

68 files modified. Grouped by category:

### CMake Find Modules (`cmake/Find*.cmake`)

Cross-compilation support - `find_library()` fails in WASM, need direct paths.

| File | Change |
|------|--------|
| `FindCairo.cmake` | Direct path lookup for WASM |
| `FindFontconfig.cmake` | Mark unavailable (no system fonts in browser) |
| `FindGLEW.cmake` | Mark not needed (WebGL handles extensions) |
| `FindGLM.cmake` | Direct path lookup |
| `FindOCC.cmake` | OpenCASCADE direct path |
| `FindPixman.cmake` | Direct path lookup |
| `FindSPNAV.cmake` | 3D mouse not available in browser |
| `FindZSTD.cmake` | Direct path for cross-compilation |
| `Findlibgit2.cmake` | Headers only (functions stubbed) |
| `Findngspice.cmake` | SPICE not available |
| `Findnng.cmake` | IPC not supported in browser |
| `FindwxWidgets.cmake` | Skip library existence checks for WASM |

### Main CMakeLists.txt

- WASM port detection (`if(EMSCRIPTEN)`)
- `KICAD_SCRIPTING` OFF by default for EMSCRIPTEN
- `KICAD_IPC_API` OFF by default for EMSCRIPTEN
- Fontconfig disabled, sets `KICAD_USE_FONTCONFIG=0`
- Python/SWIG only when `KICAD_SCRIPTING` enabled
- 3D viewer subdirectory excluded for WASM

### IPC API Guards (`#ifdef KICAD_IPC_API`)

Protobuf serialization code disabled when IPC API off.

**Headers:**
- `include/api/api_utils.h`
- `pcbnew/api/api_pcb_utils.h`

**Common:**
- `common/eda_shape.cpp` - Serialize/Deserialize methods
- `common/eda_text.cpp` - Serialize/Deserialize methods
- `common/netclass.cpp` - Protobuf includes

**PCBnew objects:**
- `pcbnew/board_connected_item.cpp`
- `pcbnew/board_item.cpp`
- `pcbnew/board_stackup_manager/board_stackup.cpp`
- `pcbnew/footprint.cpp`
- `pcbnew/pad.cpp`
- `pcbnew/padstack.cpp`
- `pcbnew/pcb_dimension.cpp`
- `pcbnew/pcb_field.cpp`
- `pcbnew/pcb_group.cpp`
- `pcbnew/pcb_shape.cpp`
- `pcbnew/pcb_text.cpp`
- `pcbnew/pcb_textbox.cpp`
- `pcbnew/pcb_track.cpp`
- `pcbnew/zone.cpp`

### Python Scripting Guards (`#ifdef KICAD_SCRIPTING`)

Python.h and pybind11 not available in WASM.

- `pcbnew/pcbnew.cpp` - PyInit, KIFACE_SCRIPTING_LEGACY
- `pcbnew/pcbnew_settings.cpp` - pybind11 include
- `pcbnew/pcb_edit_frame.cpp` - Python sync functions, scripting includes
- `pcbnew/menubar_pcb_editor.cpp` - Scripting menu items
- `pcbnew/toolbars_pcb_editor.cpp` - Scripting toolbar

### Altium Plugin Disabled (`#ifndef __EMSCRIPTEN__`)

`char_traits<unsigned char>` specialization issue in Emscripten.

- `pcbnew/CMakeLists.txt` - `add_subdirectory(pcb_io/altium)` conditional
- `pcbnew/pcb_io/pcb_io_mgr.cpp` - Altium includes and plugin registration

### 3D Viewer Disabled

Requires GLU and OpenGL fixed-function pipeline (not in WebGL).

- `CMakeLists.txt` - `add_subdirectory(3d-viewer)` conditional
- `pcbnew/CMakeLists.txt` - `3d-viewer` library link conditional

### Fontconfig

No system font access in browser.

- `common/font/fontconfig.cpp` - Wrapped with `#if KICAD_USE_FONTCONFIG`
- `include/font/fontconfig.h` - Conditional compilation

### Third-party Libraries

- `thirdparty/libcontext/libcontext.cpp` - WASM stub for coroutines (returns nullptr)
- `thirdparty/libcontext/libcontext.h` - `LIBCONTEXT_PLATFORM_wasm32` detection
- `thirdparty/lemon/CMakeLists.txt` - Build fixes

### Other Fixes

- `pcbnew/dialogs/panel_setup_layers.cpp` - `GetCurrentSelection()` → `GetSelection()` (wxUniversal)
- `include/gal/opengl/kiglew.h` - GLEW version stub for WASM
- `common/gal/CMakeLists.txt` - GAL library adjustments
- `common/CMakeLists.txt` - Common library adjustments
- `libs/kiplatform/CMakeLists.txt` - WASM platform support
- `scripting/CMakeLists.txt` - Conditional on KICAD_SCRIPTING

---

## wxWidgets Fork Modifications (`/wxwidgets`)

| File | Change | Reason |
|------|--------|--------|
| `include/wx/wasm/glcanvas.h` | Moved `Show()` from protected to public | KiCad calls `Show()` on wxGLCanvas |
| `src/wasm/utils.cpp` | Added `wxFindWindowAtPointer()` | Missing function used by cshelp |

---

## Stub Libraries (`/wasm/stubs/`)

| File | Symbols | Reason |
|------|---------|--------|
| `libgit2_stub.c` | `git_libgit2_init`, `git_repository_*`, `git_reference_*`, `git_oid_*`, `git_error_last` | Git not available in browser |
| `curl_stub.c` | `curl_global_init`, `curl_global_cleanup` | Network via JS fetch instead |

wxWidgets stubs (created by build script):
- `libwx_wasmunivu_richtext-3.2.a` - Empty, not used by KiCad
- `libwx_wasmunivu_webview-3.2.a` - Empty, not used by KiCad

---

## Disabled Features Summary

| Feature | Reason |
|---------|--------|
| Python Scripting | pybind11/Python.h not available in WASM |
| 3D Viewer | GLU and OpenGL fixed-function pipeline not in WebGL |
| Altium Plugin | `char_traits<unsigned char>` Emscripten issue |
| SPICE | ngspice not ported |
| IPC API | IPC not supported in browser |
| GitHub Plugin | Network needs JS bridge |
| Fontconfig | No system font access |
| 3D Mouse (SPNAV) | Hardware not accessible |

---

## Dependencies

Built via `scripts/deps/build-all-deps.sh`:
- zstd, glm, freetype, harfbuzz, pixman, cairo
- OpenCASCADE (geometry kernel)
- Protobuf (headers only)
- Boost (headers only)

---

## Next Steps

1. Create HTML wrapper to load pcbnew.js
2. Implement file system access (MEMFS or IDBFS)
3. Test basic UI rendering
4. Bridge network operations to JS fetch
