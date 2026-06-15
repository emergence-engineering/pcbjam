# 01 — Revert dead code

> ~480 lines of fork diff across ~22 upstream files compile **only in configurations the
> shipping build never uses**. Reverting them is pure subtraction: zero behavior change to
> the WASM product, and it removes the single largest tranche of divergence.

## A. `#ifdef KICAD_IPC_API` gating — 18 files, ~115 lines

**The gates are dead.** `scripts/kicad/build-kicad-target.sh:354` passes
`-DKICAD_IPC_API=ON` and links a wasm-built `libprotobuf.a`
(`-DProtobuf_LIBRARY=${SYSROOT}/lib/libprotobuf.a`). So every `#ifdef KICAD_IPC_API`
guard is always taken — the protobuf path always compiles. The OFF configuration these
gates nominally enable **cannot even link**: the class headers (`pad.h`, `zone.h`,
`footprint.h`, `pcb_track.h:292,401,751`, …) still declare
`void Serialize(google::protobuf::Any&) const override;` *unconditionally*, so compiling
out the definitions would leave undefined vtable symbols. Upstream confirms this is
deliberate — protobuf is "required even when the IPC API is not enabled" (dev-docs build
page), so the gating is not upstreamable either.

Files to revert to pristine upstream (all from commit `e6a59ab94a`):

```
common/eda_shape.cpp          common/eda_text.cpp           common/netclass.cpp
include/api/api_utils.h        pcbnew/api/api_pcb_utils.h    pcbnew/board_connected_item.cpp
pcbnew/board_stackup_manager/board_stackup.cpp              pcbnew/footprint.cpp
pcbnew/pad.cpp                 pcbnew/padstack.cpp           pcbnew/pcb_dimension.cpp
pcbnew/pcb_field.cpp           pcbnew/pcb_group.cpp          pcbnew/pcb_shape.cpp
pcbnew/pcb_text.cpp            pcbnew/pcb_textbox.cpp        pcbnew/pcb_track.cpp
pcbnew/zone.cpp
```

Note an internal inconsistency that confirms the gates were never exercised: `netclass.cpp`
adds `#else` stub bodies for the vtable, but `eda_shape.cpp`/`eda_text.cpp` do not — an
actual `KICAD_IPC_API=OFF` build would fail to link regardless. **Just revert all 18.**

## B. `include/gal/opengl/kiglew.h` — +189/−1, dead

The +189-line `#if defined(__EMSCRIPTEN__)` block (GLEW stubs, `glewInit` no-op,
`glVertex2d`→`glVertex2f` wrappers, display-list / lighting no-ops) was added for the old
LEGACY_GL_EMULATION 3D-viewer path. But:

- The OpenGL GAL is compiled only `if(NOT EMSCRIPTEN)` (since the WebGL GAL split).
- The live WebGL GAL uses its **own** new header, `include/gal/webgl/kiglew.h`.
- The 3D viewer is not built (`KICAD_BUILD_3D_VIEWER_WASM=OFF`).

No wasm-compiled translation unit includes this header. The block only perturbs native
builds. **Revert.** If the 3D viewer comes back via WebGL2 (see [10](10-3d-viewer.md)) it
brings its own headers; if it ever needs a `GL/` shim, use an include-path-shadowed header
in a new dir — the pattern is already proven by `include/gal/webgl/kiglew.h` and the
existing `wasm/stubs/GL/`.

## C. `common/gal/opengl/opengl_gal.cpp` — +32/−31, dead

A `Connect(...)` → `Bind(...)` event-hookup refactor plus some `GAL::` qualifications, to
dodge a multiple-inheritance ambiguity that appeared during an early wasm compile. The file
is excluded from the Emscripten build (same OpenGL-GAL exclusion as B), so this now only
changes *native* behavior. **Revert** (or, if you like the modernization, upstream it — but
reverting is cleaner).

## D. Diagnostic call sites — ~30 lines, debugging a solved problem

The `KI_DIAG_GAL` / `KI_DIAG_COROUTINE` / `KI_DIAG_CTOR` macros (from
`include/kicad_wasm_diag.h`, a fork-only header gated behind `--diag` build flags) were
added to trace the Chrome Asyncify-rewind stall family — **which is solved** (see the
`chrome-asyncify-rewind-crash` memory; fixed systemically by `wasm-opt -O2` after
`--asyncify`). The call sites are marked "TEMPORARY … Remove once the crash is fixed":

- `common/tool/tool_manager.cpp` +11 (`dispatchInternal` coroutine call)
- `common/draw_panel_gal.cpp` ~7 lines
- `pcbnew/pcb_edit_frame.cpp` 15 `KI_DIAG_CTOR` lines tracing ctor phases
- `common/confirm.cpp` +4 (unconditional `wxFprintf(stderr, ...)` before `ShowModal` —
  also affects native; move to the wx wasm modal shim if logging is still wanted)

**Delete the call sites now.** Keep the `include/kicad_wasm_diag.h` header itself (a new
file, costs nothing) for ad-hoc reinsertion — its only *in-upstream-file* users disappear
once the call sites go.

## Net

| Item | Files | ~Lines | Risk |
|---|---|---|---|
| IPC-API gates | 18 | 115 | none (dead) |
| `kiglew.h` | 1 | 190 | none (dead in wasm; reverts a native-only change) |
| `opengl_gal.cpp` | 1 | 63 | none (dead in wasm) |
| Diagnostics | ~3 | 30 | none |
| **Total** | **~23** | **~400** | reverts also undo 4 accidental native-build changes |

This is the recommended first action — see the [sequencing](README.md#suggested-sequencing).
