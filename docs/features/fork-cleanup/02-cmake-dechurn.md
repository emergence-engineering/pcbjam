# 02 — CMake de-churn

> The build-system diff is **~1,600 changed lines across 17 `CMakeLists.txt` files**, and
> **35–40% of it (~600 lines) is reindentation and duplication** — not logic. The logic
> that *is* there (single-binary kiface linking, stub injection, the WebGL GAL) is mostly
> legitimate; it's expressed in the most invasive way possible. This refactor keeps the
> behavior and cuts the touched-line count to roughly **120–180** inside upstream files.

## The anti-patterns and their fixes

### 1. Wrap-and-reindent → early-return guard

`pcbnew/CMakeLists.txt`: the ~110-line Python-module install section was wrapped in
`if(KICAD_SCRIPTING) … endif()` **and reindented**, turning ~110 lines into ~215 diff
lines. The section runs to EOF, so a 3-line guard does the same job with ~5 diff lines:

```cmake
if( NOT KICAD_SCRIPTING )
    return()
endif()
# ... upstream python-install body, unindented, byte-identical ...
```

`scripting/CMakeLists.txt` already does the minimal version of this (top-level `if(...)` /
bottom `endif()`, **no reindent**) — copy that discipline. Same treatment for the root
`CMakeLists.txt` Python/SWIG discovery section (~100 lines of pure reindent today).

### 2. if/else source duplication → `list(REMOVE_ITEM)`

The additive pattern is already proven in-tree for the ngspice BSIM data files
(`eeschema/CMakeLists.txt`): keep the upstream list byte-identical, then remove/replace
under `if(EMSCRIPTEN)`:

```cmake
# upstream SRCS list stays exactly as-is, then:
if( EMSCRIPTEN )
    list( REMOVE_ITEM FOO_SRCS path/to/native_only.cpp )
    list( APPEND FOO_SRCS ${KICAD_WASM_LAYER}/stubs/foo_stub.cpp )
endif()
```

Apply to: the OpenGL-GAL sources in `common/gal/CMakeLists.txt` (currently moved into an
`if(NOT EMSCRIPTEN)` block + reindented), the eeschema importer block, the
`common/CMakeLists.txt` exclusions (`python_scripting.cpp`, `api_utils.cpp`, altium,
database, webview), and the `PCBNEW_IO_LIBRARIES` altium dual-list in `pcbnew/CMakeLists.txt`.

### 3. pcb_calculator: whole file forked → block + `return()`

`pcb_calculator/CMakeLists.txt` (+130/−89) forks the *entire* file `if(EMSCRIPTEN) … else()`
with the upstream body reindented in the `else`. Instead, insert the wasm single-binary
block (duplicating only `make_lexer`) followed by `return()` *before* the upstream
`add_executable`, leaving the upstream body untouched. ~160 diff lines → ~55 additive.

### 4. Shader calls: 85-line duplicate → redefine-the-function hook

`common/gal/CMakeLists.txt` duplicates all 10 upstream `add_shader(...)` calls in an
`else()` branch for the ES3 variant. Instead, after upstream's `add_shader` definition,
`include()` a wasm `.cmake` that *redefines* `add_shader` to the ES3 path (later definition
wins) — upstream's 10 calls are then reused verbatim.

### 5. `BUILD_KIWAY_DLL` source-property forks (5 apps)

eeschema/pcbnew/gerbview/pl_editor/pcb_calculator each fork the `set_source_files_properties`
defs `if/else`. Replace with a single additive `if(EMSCRIPTEN)` block *after* the upstream
lines that re-sets the properties (last set wins). ~120 diff lines → ~35 additive.

### 6. navlib ×3: probably deletable entirely

`pcbnew/navlib`, `gerbview/navlib`, `pagelayout_editor/navlib` each fork their CMakeLists to
build a stub from `wasm/stubs/nl_*_plugin_stub.cpp` with the upstream body reindented in the
`else`. **But `eeschema/navlib` is unchanged** and builds its *real* sources under wasm
against the bundled `thirdparty/3dxware_sdk` stub. Strong evidence the other three stub
forks are unnecessary — try reverting all three CMakeLists and deleting the 3 stub `.cpp`
files. (This also fixes a native bug — see [07](07-native-build-bugs-and-tooling.md) on the
duplicate `add_subdirectory(navlib)`.) Fallback if a link fails: a 4-line early-return stub
`include()` at the top of each, with zero reindent.

### 7. `kiapi` SHARED-vs-STATIC: variable, not duplicate list

`api/CMakeLists.txt` (+14/−5) duplicates the source list across an
`add_library(kiapi SHARED)` / `STATIC` if/else. Collapse to `set(_KIAPI_TYPE ...)` + one
`add_library(kiapi ${_KIAPI_TYPE} ...)`.

## Relocate the surviving `if(EMSCRIPTEN)` logic

The legitimate blocks (static-kiface linking, stub `target_sources`, the `symbol_editor`
target, WebGL GAL sources) don't shrink in *content*, but they can move out of upstream
files into a new merge-conflict-free directory:

- Create `kicad/cmake/wasm/*.cmake` and reduce each upstream `CMakeLists.txt` touch to a
  1–3 line `if(EMSCRIPTEN) include(wasm/foo.cmake) endif()` hook.
- Replace the hardcoded `${CMAKE_SOURCE_DIR}/../wasm` paths (which reach outside the
  submodule and currently prevent it from configuring standalone) with a `KICAD_WASM_LAYER`
  cache variable, defaulted to `../wasm` and passed by `build-kicad-target.sh`.

## Mechanisms that were evaluated and rejected

- **`CMAKE_PROJECT_INCLUDE` / `CMAKE_PROJECT_KICAD_INCLUDE`**: runs at `project()` time —
  *before* upstream's `set(CMAKE_MODULE_PATH ...)` overwrite — so it can't even replace the
  1-line module-path fix, and can't reach subdirectory logic. Worth ~2% of the diff; skip.
- **Super-project `add_subdirectory(kicad)` wrapper**: infeasible. KiCad uses
  `${CMAKE_SOURCE_DIR}` pervasively (incl. the `../wasm` reach-outs and install logic); it
  would re-root to the super-project and break.

## Net

Moves 1–7 alone cut the build-system diff from ~1,600 to roughly **500–600** lines; adding
the `cmake/wasm/` relocation drops the lines touched *inside upstream files* to roughly
**120–180**. Irreducible in-place edits that remain: the `CMAKE_MODULE_PATH` preserve
(1 line), the wx-port regex `(msw|qt|gtk|osx)` → `(…|wasm)` (1 line), the `KICAD_SCRIPTING`
option, root `add_subdirectory` gates, `kiapi` genex gates in `common`, and the
`thirdparty/lemon` cross-compile block.
