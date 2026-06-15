# Fork cleanup: minimize divergence & re-enable web-feasible features

> **Status:** research / planning only. No code has been changed. Authored June 2026.
> All `file:line` references are against the `kicad` submodule at its current HEAD
> (`ac7d733787`), upstream merge-base `4bfed3f174`, and the root repo at the same time.
> Verify line numbers before editing — they drift.

## Why this exists

Getting KiCad to build for the browser meant disabling, stubbing, and `#ifdef`-ing a
lot of things "because we had to." Two goals now pull in the same direction:

1. **Keep the `kicad` and `wxwidgets` forks as close to mainline as possible.** Where we
   add things, they should live in *new files/folders* (or build flags, runtime config,
   the `wasm/` layer) — not as edits to upstream source.
2. **Everything that *can* work in a browser should actually work.** The 3D viewer,
   importers, the symbol chooser — turn them back on. Only Python scripting and things
   that are genuinely impossible on the web stay off.

The key reframe that ties them together: **re-enabling features mostly *deletes* fork
code.** Almost everything disabled is disabled by a fork-added gate, stub, or exclusion.
Turning it back on removes that divergence. The two goals are one project.

## TL;DR — the baseline and the target

Fork state vs. merge-base `4bfed3f174` (24 commits):

| | Count |
|---|---|
| New files (policy-compliant) | 44 (~28k lines, mostly the WebGL GAL copy) |
| Modified upstream files | **104** |
| Changed lines in modified files | **~2,400** (~1,600 of it CMake) |

Estimated reachable end-state after the refactors below: **~15–20 modified files /
~150–250 lines**, with the WASM product *gaining* the 3D viewer, render-to-PNG jobs,
VRML export, five importers, the symbol browser, and optionally simulation, tooltips,
HTTP libraries, and working local history.

Three facts do most of the work:

- **Big chunks of the diff are dead code.** All `#ifdef KICAD_IPC_API` gating, the
  +189-line `kiglew.h` shim, and the `opengl_gal.cpp` refactor compile in configurations
  the shipping build never uses. See [01](01-revert-dead-code.md).
- **Several "disabled" features are disabled by stale mechanisms.** The Altium importer's
  blocker was fixed months ago (the fix is force-included into every TU); three
  build-script `-D` flags don't even exist as options in this KiCad version. See
  [08](08-importers.md) and [07](07-native-build-bugs-and-tooling.md).
- **The 3D viewer has a cheap path.** KiCad ships a pure-CPU raytracer that needs zero
  OpenGL, and the fork currently *nulls it out*. See [10](10-3d-viewer.md).

## Master inventory

Every disabled/divergent item, with verdict. Detail + recipes in the linked docs.

### Reduce divergence (shrink the submodule diff — no behavior change)

| Item | Mechanism | Action | Doc |
|---|---|---|---|
| `#ifdef KICAD_IPC_API` gates (18 files) | dead code (build sets `=ON`) | revert | [01](01-revert-dead-code.md) |
| `kiglew.h` +189, `opengl_gal.cpp` +32/−31 | dead (opengl GAL not built for wasm) | revert | [01](01-revert-dead-code.md) |
| `KI_DIAG_*` call sites (~30 lines) | debugging a solved crash | delete | [01](01-revert-dead-code.md) |
| ~600 lines of CMake reindent/duplication | wrap-and-reindent instead of additive | de-churn | [02](02-cmake-dechurn.md) |
| zoom warp, Backspace, timer, kiface init | `#ifdef` behavior changes | runtime config | [03](03-config-not-code.md) |
| fontconfig/libcontext/SpaceMouse stubs | in-file `#ifdef` | move to new TUs | [04](04-stub-tu-relocation.md) |
| scale factor, selection, header hygiene | wx-port quirks patched in KiCad | fix in wx fork | [05](05-wx-layer-fixes.md) |
| RTree fix, hotkey bug, `wxUSE_*` guards | upstreamable | send upstream | [06](06-upstreamable-patches.md) |
| 6 native-build regressions + diff tooling | fork bugs | fix | [07](07-native-build-bugs-and-tooling.md) |

### Re-enable (web-feasible — mostly deletes gates)

| Item | Blocker today | Verdict | Doc |
|---|---|---|---|
| Altium importer (sch+pcb) | stale exclusion (fix already active) | **re-enable now** | [08](08-importers.md) |
| Eagle/CADSTAR/LTspice/EasyEDA(Pro) sch | MVP-scoping exclusion | **re-enable now** | [08](08-importers.md) |
| Symbol chooser + viewer | empty lib tables (asset gap) | un-gate + asset pipeline | [09](09-symbol-libraries.md) |
| 3D viewer + render job + VRML export | `KICAD_BUILD_3D_VIEWER_WASM=OFF` + gates | port (raytracer first) | [10](10-3d-viewer.md) |
| SPICE simulator | ngspice dep stubbed | port (~1–2 wk) | [11](11-ngspice-simulator.md) |
| HTTP libraries / local history | curl & libgit2 stubbed | port | [12](12-network-stack.md) |
| Tooltips | wxUniversal never implemented them | port in wx fork | [05](05-wx-layer-fixes.md) |

### Keep off

- **Impossible:** SpaceMouse/navlib, ODBC database, nng/IPC transport, fswatcher, webview,
  dynamic KIFACE `dlopen`, OS keychain, pointer warping. (See [12](12-network-stack.md) for
  the full catalog and *why* each is impossible.)
- **Policy-off:** Python scripting (see [`../../../features/python/research.md`](../../../features/python/research.md)),
  PCM, update check, the `kicad` project-manager / `cvpcb` apps (never wasm targets).

## Suggested sequencing

1. **Quick wins + dead-code reverts** ([01](01-revert-dead-code.md), [07](07-native-build-bugs-and-tooling.md),
   [08](08-importers.md)) — one build, one e2e run; large diff reduction *and* new
   importers. Importers are configure-confident but runtime-untested → smoke-test with a
   sample Eagle + Altium file.
2. **3D viewer Route C** ([10](10-3d-viewer.md)) — raytracer + blit; brings render job and
   VRML export back nearly free.
3. **Symbol-library asset pipeline** ([09](09-symbol-libraries.md)).
4. **CMake de-churn + config-not-code + stub relocation + wx fixes** ([02](02-cmake-dechurn.md)–[05](05-wx-layer-fixes.md))
   — the bulk of the remaining line-count reduction.
5. **Upstream PRs** ([06](06-upstreamable-patches.md)) — divergence that vanishes on merge.
6. **3D Route B (WebGL2) and Tier-3 ports** ([10](10-3d-viewer.md)–[12](12-network-stack.md)) per product priority.

## Document index

| File | Contents |
|---|---|
| [01-revert-dead-code.md](01-revert-dead-code.md) | Diff that compiles only in unused configs: IPC-API gates, `kiglew.h`, `opengl_gal.cpp`, diagnostics. ~480 lines, zero behavior change. |
| [02-cmake-dechurn.md](02-cmake-dechurn.md) | ~600 lines of CMake reindent/duplication → early-return guards, `list(REMOVE_ITEM)`, shader-hook, relocate `if(EMSCRIPTEN)` to `cmake/wasm/`. |
| [03-config-not-code.md](03-config-not-code.md) | Patches that re-implement existing settings: zoom pref, hotkeys file, `HAVE_CLOCK_GETTIME`, kiface init from the shell. |
| [04-stub-tu-relocation.md](04-stub-tu-relocation.md) | Move in-file `#else` stubs to new translation units: fontconfig, libcontext, SpaceMouse. |
| [05-wx-layer-fixes.md](05-wx-layer-fixes.md) | KiCad patches that belong in the wxWidgets wasm port: scale factor, selection, header self-sufficiency, **tooltips**. |
| [06-upstreamable-patches.md](06-upstreamable-patches.md) | Bug fixes & portability guards to send to KiCad/wxWidgets upstream so the diff disappears on merge. |
| [07-native-build-bugs-and-tooling.md](07-native-build-bugs-and-tooling.md) | 6 regressions the fork introduced into *native* builds + dead build-script flags + the broken `kicad-diff-stats.sh`. |
| [08-importers.md](08-importers.md) | Re-enable Altium + Eagle/CADSTAR/LTspice/EasyEDA(Pro). Net-negative diff. |
| [09-symbol-libraries.md](09-symbol-libraries.md) | Un-gate the symbol chooser/viewer + ship a starter library set to the browser FS. |
| [10-3d-viewer.md](10-3d-viewer.md) | Why it's off; Route C (CPU raytracer), Route B (WebGL2 port), Route A (rejected); model loading; render job; VRML export. |
| [11-ngspice-simulator.md](11-ngspice-simulator.md) | Static-link a wasm ngspice + the one `init_dll` branch; retest the model-data stubs. |
| [12-network-stack.md](12-network-stack.md) | curl→fetch shim, libgit2/local-history, and the catalog of genuinely-impossible features. |

## Related docs

- [`../async/README.md`](../async/README.md) — the Asyncify model these gates dance around.
- [`../wasm-exceptions/README.md`](../wasm-exceptions/README.md) — the EH-model work that shrinks the binary.
- [`../libraries/0001-library-management.md`](../libraries/0001-library-management.md) — why designs open without libraries (background for [09](09-symbol-libraries.md)).
- [`../../../features/python/research.md`](../../../features/python/research.md) — Python re-enable research (stays off; IPC API is the mainline path).
- [`../../../features/gl-article/README.md`](../../../features/gl-article/README.md) — the OpenGL→WebGL GAL migration history (context for [10](10-3d-viewer.md)).
