# 04 — Relocate in-file stubs to new translation units

> Some patches put a wasm `#else` implementation *inside* an upstream `.cpp`, doubling the
> file's divergence (the stub **plus** churn in the native half). The fix is the same in
> each case: select a separate translation unit by CMake (`list(REMOVE_ITEM)` + append, see
> [02](02-cmake-dechurn.md)), and the upstream file reverts to pristine. `wasm/stubs/` is
> already a mature home for exactly this.

## 1. fontconfig — +154/−39, the biggest live source patch

`common/font/fontconfig.cpp` is split `#if KICAD_USE_FONTCONFIG` (native) `#else` (wasm).
The wasm half is a self-contained stub: `Version()` returns `"WASM (no fontconfig)"`,
`FindFont`/`ListFonts` match against `aEmbeddedFiles` filenames + the built-in stroke font.
Fontconfig genuinely isn't built for wasm, so the stub is live — but it doesn't belong
inline. The patch also **deletes ~39 lines of comments from the native half** (gratuitous
churn).

**Do:** move the `#else` body to a new TU (`common/font/fontconfig_wasm.cpp`, or
`wasm/stubs/`), select it by CMake, and restore the deleted comments. `include/font/fontconfig.h`
(+13/−22) only guards the `<fontconfig/fontconfig.h>` include for the `.cpp`'s benefit —
moving that include into the `.cpp` is an upstreamable cleanup; private helper decls don't
need guarding (unused private non-virtuals need no definition). Header reverts to near-zero.

> This is also the seam where **system-font support** could later be added: the non-fontconfig
> `FindFont`/`ListFonts` path is where the browser Local Font Access API would map in (wx
> fontenum already works per `tests/WHATWORKS.md`). Moderate effort, optional.

## 2. libcontext — +333/−1 `.cpp`, +8/−1 header

`thirdparty/libcontext/libcontext.cpp` gains a complete Emscripten-fiber backend
(`make_fcontext`/`jump_fcontext`/`release_fcontext` over `emscripten_fiber_*`) for a new
`LIBCONTEXT_PLATFORM_wasm32`. It's one self-contained `#if defined(LIBCONTEXT_PLATFORM_wasm32)`
region; the only edit to *pre-existing* code is wrapping the upstream no-op `release_fcontext`
in `#if !defined(...)` to avoid a duplicate definition.

**Do:** move the wasm region to `thirdparty/libcontext/libcontext_emscripten.cpp` and have
`thirdparty/libcontext/CMakeLists.txt` *replace* (not append) the source under `if(EMSCRIPTEN)`.
Replacing makes `libcontext.cpp` byte-identical to upstream (everything else in it is
platform-guarded asm that compiles to nothing on wasm) and removes the `#if !defined` guard
need. The header's +8 platform branch becomes
`target_compile_definitions(libcontext PUBLIC LIBCONTEXT_PLATFORM_wasm32 LIBCONTEXT_COMPILER_gcc LIBCONTEXT_CALL_CONVENTION=)` — verified to propagate to the only includer
(`include/tool/coroutine.h`) via `common`'s PUBLIC link. (Keeping the 9-line additive header
hunk is also fine if you prefer; it's tiny.)

## 3. SpaceMouse / navlib `#ifdef`s → throwing-ctor stubs

The 3D-viewer SpaceMouse integration is gated with `#ifdef __EMSCRIPTEN__` in four files
(`3d-viewer/3d_viewer/eda_3d_viewer_frame.cpp`/`.h`,
`3d-viewer/dialogs/panel_preview_3d_model.cpp`/`.h`). Upstream already wraps the plugin
construction in `try/catch` and null-checks every use, so a stub whose constructor *throws*
(mirroring the existing `wasm/stubs/nl_pcbnew_plugin_stub.cpp`) reverts all four files.
Emscripten doesn't define `__linux__`, so upstream's `#else` branch already selects the
`NL_*` class — only the stub body is needed.

> These four files only matter once the 3D viewer is built (see [10](10-3d-viewer.md)). Do
> this relocation as part of turning 3D on, not before. The CMake-level navlib stub forks
> (`nl_pcbnew/gerbview/pl_editor_plugin_stub.cpp`) are addressed in [02](02-cmake-dechurn.md)
> §6 — they may be deletable entirely.

## What stays inline (deliberately)

- **`thirdparty/thread-pool/bs_thread_pool.hpp` (+16)** — the run-inline-under-Asyncify
  patch in `detach_task()`. The alternative (wrapping KiCad's `thread_pool` typedef) touches
  3 KiCad-owned files, and subclass-shadowing doesn't work because `detach_task` is
  non-virtual and `submit_task` binds to it internally. The 16-line vendored patch is the
  smaller, self-documenting option. Re-apply on each re-vendor.
- **`common/widgets/wx_progress_reporters.cpp` (+9)** — `updateUI()` returns `true` under
  `__EMSCRIPTEN__` to skip `wxProgressDialog`'s nested event loop (which unwinds Asyncify
  mid-load). The clean fix is making the wx wasm `wxProgressDialog::Update` non-pumping (see
  the [async dossier](../async/README.md)); until then the 9-line guard is defensible.

## Note on `exporter_vrml.cpp`

The +64-line in-file VRML-export stub is **not** relocated here — under the new policy VRML
export comes *back* (it only needs the 3D model cache, no GL). Deleting the `#else` stub and
linking the real exporter is covered in [10](10-3d-viewer.md). That's a divergence
*reduction*, not a relocation.
