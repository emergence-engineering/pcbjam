# 10 — Re-enable the 3D viewer

> **Verdict: port — and there's a cheap first step.** KiCad ships *two* 3D renderers: an
> OpenGL one (pure fixed-function GL 1.x — far from WebGL2) and a **pure-CPU raytracer that
> needs zero OpenGL**. The fork currently nulls the raytracer out. Turning 3D on via the
> raytracer (**Route C**) is low-risk and brings the render-to-PNG job and VRML export back
> nearly free; a WebGL2 port of the interactive renderer (**Route B**) is the follow-up.

## Why it's off (timeline, with primary sources)

| Date | Commit (kicad) | What |
|---|---|---|
| 2025-12-21 | `46bb16e86b` | "Enable 3D viewer build for WASM with OpenGL stubs" — compiled *only* so headers resolve. Message: "OpenGL rendering won't work at runtime … avoids complex stubbing." |
| 2026-01-03 | `a61d2ea406` | OpenGL GAL on `-sLEGACY_GL_EMULATION`; added the +190-line `kiglew.h` `__EMSCRIPTEN__` branch (display lists + lighting as **no-ops**). 3D "built" but couldn't draw. |
| 2026-01-10 | `d8a9ac4304` | "Disable 3D viewer functionality for WASM builds" — same day `WEBGL_GAL` landed and the build swapped emulation → `-sFULL_ES3`. Message: 3D "require[s] native OpenGL rendering (not WebGL)". Built with `KICAD_BUILD_3D_VIEWER_WASM=OFF`. |
| 2026-03-20 | `4ddb9b47f5` | "Migrate to pure WebGL 2.0 without FULL_ES3 emulation" — 2D GAL goes pure WebGL2; the only GL link flag today is `-sMAX_WEBGL_VERSION=2`. |

Recorded rationale: `features/gl-article/README.md:274-276,421-422` — the 3D viewer is "a
separate legacy-GL renderer, not GAL" needing "GLU + fixed-function", declared out of scope
when the strategy became "progressively remove the Emscripten crutch." So it was a deliberate
scoping decision when the emulation layer it depended on was removed — not a crash.

## What the OpenGL renderer actually uses

`3d-viewer/3d_rendering/opengl/` = 6 files, **4,555 lines**. It's pure GL 1.x fixed-function:

- **Immediate mode** — 153 tokens (`glBegin`/`glEnd` ×28, `glVertex*`/`glNormal3*`/`glTexCoord2*`).
- **Display lists** — 36 refs in 2 files, and they're the **primary board-geometry path**:
  `layer_triangles.cpp:582-714` bakes every layer's triangles into `glGenLists`/`glNewList`
  wrapping a `glDrawArrays`; `render_3d_opengl.cpp:1303-1315` for the grid.
- **Fixed-function matrix/lighting** — ~117 tokens (`glMaterialfv`, `glLightfv`,
  `glMatrixMode`/`glPush/PopMatrix`, `GL_LIGHTING`, …).
- **Client-state arrays** — 49 tokens. **GLU** — 36 (`gluNewQuadric`/`gluCylinder`/`gluSphere`
  for vias/pads).
- **Modern** — zero shaders, zero VAOs; only `3d_model.cpp` uses VBOs (GL 1.5 style).

Structurally friendlier than the raw counts suggest: geometry already lives in CPU triangle
containers, display lists are thin `glDrawArrays` wrappers, `3d_model.cpp` is already VBO,
camera/transforms are already glm.

## Route A — LEGACY_GL_EMULATION for the 3D viewer: REJECTED

- The flag is **module-global at link**: `GLEmulation.init()` replaces the module-wide JS
  bindings (`glDrawArrays`, `glEnable`, `glBindBuffer`, `glGetString`, …) for *all* contexts,
  including the flagship 2D `WEBGL_GAL`'s. Concretely it corrupts the GAL's ES3 shaders —
  emscripten prepends `#extension GL_OES_standard_derivatives` to any fragment shader using
  `dFdx` (`kicad_frag.glsl:138` does), and prepending anything before `#version 300 es` is a
  guaranteed ES3 compile error. Separate canvases/contexts do **not** isolate this (hooks are
  per-module).
- Even ignoring that: emscripten never implemented display lists (issue #688 — the main board
  path draws nothing), GLU quadrics are absent, lighting emulation has `throw 'TODO'` holes.
  You'd rewrite the display-list and quadric paths anyway (the hard half of Route B) while
  regressing 2D and re-adding ~200 KB of the fragility the project already escaped. **Reject.**

## Route C — CPU raytracer + blit (do this first, low risk)

`RENDER_3D_RAYTRACE_RAM` (`render_3d_raytrace_ram.cpp`, 159 lines) is **100% GL-free**: it
renders into a plain `uint8_t` RGBA buffer (`initPbo()` is just `new uint8_t[w*h*4]`) and
exposes `GetBuffer()`. It's **progressive by design** — each `Redraw()` traces blocks up to a
400/750 ms budget then yields, so a serial browser loop still animates. Both existing
consumers already convert buffer → `wxImage` with no GL (`eda_3d_viewer_frame.cpp:846-866`
screenshot; `pcbnew_jobs_handler.cpp:817-885` render job).

Recipe:

1. `KICAD_BUILD_3D_VIEWER_WASM=ON`, and **genex-out the GL renderer TUs**
   (`render_3d_opengl.cpp`, `layer_triangles.cpp`, …) the same way `render_3d_raytrace_gl.cpp`
   is already excluded (`3d-viewer/CMakeLists.txt:49`) — this sidesteps the legacy-GL link
   errors entirely. The raytracing subtree (12,232 lines) has no GL.
2. Have `EDA_3D_CANVAS` instantiate `RENDER_3D_RAYTRACE_RAM` under `__EMSCRIPTEN__` (it's
   renderer-agnostic via `RENDER_3D_BASE`), and **blit** the buffer — either a plain wxWindow
   painting the `wxImage` through the wx-wasm 2D canvas DC (zero GL), or a ~100-line WebGL2
   textured quad (infra exists in `common/gal/webgl/fullscreen_quad.cpp`).
3. **Delete the fork gates** — they're keyed on `__EMSCRIPTEN__`, *not* the CMake option, so
   flipping the flag alone isn't enough: `eda_3d_canvas.cpp` (raytracer nulled, raytracing
   request early-returned), `pcbnew/pcbnew.cpp` (3D settings panels — see the
   `PANEL_TOOLBAR_CUSTOMIZATION` bug in [07](07-native-build-bugs-and-tooling.md)),
   `pcbnew_jobs_handler.cpp`/`.h` (render job), and `exporter_vrml.cpp` (in-file stub). Delete
   the three big stub TUs too (`wasm/stubs/3d_viewer_stub.cpp`, `3d_canvas_stub.cpp`,
   `3d_scenegraph_stub.cpp`, ~1,200 lines).

Caveats: main tracing runs **serial** under the `bs_thread_pool` inline patch (still usable,
because progressive); the preview / SSAO / DLAA passes use raw `std::thread` + a `sleep_for`
spin-wait — pthreads *are* enabled in the build (`-pthread -sUSE_PTHREADS=1
-sPTHREAD_POOL_SIZE=…`), so they run, but the spin-wait blocks the browser main thread per
pass and is worth reviewing for jank.

## Route B — WebGL2 port of the interactive renderer (follow-up)

Scope is ~4,555 lines / 6 files — roughly **1/5 of the 2D GAL port** and far less novel (no
compositor, no multi-FBO juggling). The work: display-list → VBO (mechanical, the lists wrap
`glDrawArrays` of CPU triangle containers), client-state arrays → generic vertex attribs,
fixed-function transforms → a small matrix-stack helper (already glm), ~2 shader pairs
(Phong-lit per-material + flat), GLU quadrics → a triangle helper (small; vias/pads/gizmo).
Reuse `common/gal/webgl/`'s shader infra + `convert_glsl_es3.py`.

Divergence: mirror the 2D precedent — new files (`3d_rendering/webgl/`), swapped via a CMake
genex like the existing `render_3d_raytrace_gl.cpp` exclusion. Near-zero upstream-file diff
beyond the swap + un-gating. Gives the **interactive** GPU-speed orbit/pan view. Risk: medium
(GPU correctness; the e2e screenshot harness pattern exists). Prereq: model loading (below).

## Model loading (needed for both B and C to show components)

Upstream loads `plugins/3d/{vrml,oce,idf}` as **runtime DSOs** —
`S3D_PLUGIN_MANAGER::loadPlugins()` scans a directory and `wxDynamicLibrary`-loads each. There
is **no static-registration path upstream**, and `wasm/stubs/3d_scenegraph_stub.cpp` (440
lines) currently stubs the whole `S3D_CACHE` + scenegraph + `S3D::WriteVRML`.

Static linking entails: compiling the plugin sources into the binary with **per-plugin symbol
prefixes** (they export identical C ABI names — `Load`, `GetFileFilter`, … — so they collide;
wrap each TU with `-Dname=vrml_name` or a wrapper), plus a small `__EMSCRIPTEN__` path (or a
subclassed `KICAD_PLUGIN_LDR_3D`) with a 3-entry static registry — cleanest as one new
wasm-layer file. Sizes: **vrml** (VRML1/2 + X3D, fully in-tree, **no external deps**) = 17,835
lines; **oce** (STEP/IGES — needs OCC, which **is already built for wasm**: OCC 7.8 via
`--with-occ`, verified `libTK*.a` in the sysroot) = 1,407; **idf** = 931. `kicad_3dsg` must
become STATIC for wasm (it's `add_library(SHARED)` today). Plus: ship 3D model assets to the
FS (models are *referenced*, not embedded — see
[`../libraries/0001-library-management.md`](../libraries/0001-library-management.md)).

Start with the VRML plugin (no deps) for `.wrl` models; add OCE for STEP once VRML works.

## Render job & VRML export — free with either route

Both only need the 3D model cache / scenegraph / raytracer, **not** the GL renderer:

- `JobExportRender` (`pcbnew_jobs_handler.cpp:641-898`) is `RENDER_3D_RAYTRACE_RAM` +
  `BOARD_ADAPTER` + 3d_cache → board-render-to-PNG/JPEG works as soon as 3d-viewer links.
- `exporter_vrml.cpp`'s real implementation needs `S3D_CACHE` + the SGNODE/IFSG API — un-stub
  by **deleting** the fork's `#else` block (a divergence *reduction*). Board-only export works
  immediately; embedding component models additionally needs the static VRML plugin above.

## Sequencing

**C first** (working 3D view + render job + VRML export, low risk, mostly deletes gates) →
**B second** (interactive upgrade) → **A never**.
