# 07 — Native-build regressions & tooling

> While shrinking the diff, the research surfaced **six places where the fork silently
> changed *native* (non-wasm) build behavior** — these are bugs regardless of the cleanup,
> worth fixing on their own. Plus: three dead build-script flags and a diff-stat tool that
> lies about how far the fork has diverged.

## Native-build regressions

### 1. `COMMON_WIDGETS_SRCS` typo — drops a source from *all* builds

`common/CMakeLists.txt` appends the webview gating to a variable named `COMMON_WIDGETS_SRCS`,
but the real list is `COMMON_WIDGET_SRCS` (singular). Result: `widgets/webview_panel.cpp` is
silently dropped from **every** build, including native. Fix the name (and keep the wasm
exclusion conditional).

### 2. Duplicate `add_subdirectory(navlib)` — breaks native macOS/Windows configure

`pcbnew/CMakeLists.txt` adds an **unconditional** `add_subdirectory(navlib)` near the top and
puts `pcbnew_navlib` in `PCBNEW_KIFACE_LIBRARIES`. But upstream `common/CMakeLists.txt`
(unchanged, ~line 1074) already does `add_subdirectory(../pcbnew/navlib ./navlib)` under
`if(APPLE OR NOT UNIX)` → duplicate `pcbnew_navlib` target → configure failure on native
macOS/Windows. Make the fork's addition `if(EMSCRIPTEN)`-only (and revisit the stub forks per
[02](02-cmake-dechurn.md) §6).

### 3. HiDPI scale factor changed for native — `hidpi_gl_canvas.cpp`

`GetScaleFactor()` switched from `GetContentScaleFactor()` to `GetDPIScaleFactor()`
*unconditionally*; these differ on MSW, so native Windows rendering is altered. Fix in the wx
wasm port and revert ([05](05-wx-layer-fixes.md) §1).

### 4. Toolbar customization accidentally disabled on wasm — `pcbnew/pcbnew.cpp`

The `#ifndef __EMSCRIPTEN__` block that gates the 3D settings panels also swallows
`PANEL_TOOLBAR_CUSTOMIZATION`, which is *not* a 3D panel — so toolbar customization settings
are silently off on wasm. Re-scope the gate to the 3D panels only. (Goes away anyway when 3D
is re-enabled — see [10](10-3d-viewer.md).)

### 5. `KICAD_IPC_API` default flipped — affects native

Root `CMakeLists.txt` flips the `KICAD_IPC_API` option default ON→OFF. The wasm build passes
`=ON` explicitly, so this only changes *native* behavior. Revert the default.

### 6. `pl_editor` OBJECT-library restructure — all platforms

`pagelayout_editor/CMakeLists.txt` introduces a `pl_editor_kiface_objects` OBJECT library and
leaves `add_library(pl_editor_kiface MODULE)` empty, for **all** platforms (it works via
object-lib propagation, but it's an unconditional restructure of upstream build shape). Make
it `EMSCRIPTEN`-only or upstream-shaped.

## Dead build-script flags

`scripts/kicad/build-kicad-target.sh` passes flags that **are not options in this KiCad
version** — they configure nothing and mislead:

- `KICAD_SPICE=OFF` — no such option (only `KICAD_SPICE_QA` exists). The simulator is always
  built; the real disable is the `Findngspice.cmake` stub ([11](11-ngspice-simulator.md)).
- `KICAD_PCM=OFF` — no such option. PCM is an unconditional library linked only into the
  `kicad` / `kicad-cli` targets, which aren't built for wasm.
- `BUILD_GITHUB_PLUGIN=OFF` — no such option.

Remove all three so the script reflects reality.

## `kicad-diff-stats.sh` mis-detects the fork point

`scripts/kicad-diff-stats.sh` reports **0 fork commits** because it finds the fork point by
walking `git log` and taking the first commit whose author email isn't in an allowlist
(`OUR_AUTHORS` = only `viktor.vaczi@…` + `noreply@anthropic.com`). The submodule HEAD is
authored by `balint.ipkovich@…`, so the loop terminates on iteration 1 and calls HEAD itself
"upstream." The real fork history `4bfed3f174..HEAD` has **24 commits by 4 authors** (viktor
×14, torcsvari.gergo ×5, balint ×4, matejcsok-ee ×1) — three of four are missing from the
allowlist.

**Fix (any one):**

- Pin the fork-base SHA (`4bfed3f174`) in a script variable / file; or
- Use the `upstream` remote that already exists: `git merge-base HEAD upstream/master`; or
- Match the *upstream* side (KiCad maintainer commit domains) instead of enumerating "our"
  people.

The author-allowlist heuristic is inherently rot-prone; the merge-base approach is robust.
(Secondary: the `AUTHOR_PATTERN` grep-building block is dead code — the loop does exact
string matching.)
