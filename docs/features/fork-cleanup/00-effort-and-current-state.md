# Fork cleanup: current state, effort & resulting diff

> **Status:** measurement / planning. Authored 2026-06-17. **Supersedes the baseline numbers in
> [README.md](README.md)** — those were taken at KiCad HEAD `ac7d733787`; work has landed since.
> All figures here are against:
> - KiCad fork HEAD `cb82b64410`, upstream merge-base `4bfed3f174`
>   (`jeff@rokeby.ie` "Remove previous hack for dealing with ligatures").
> - Reproduce any number with, in `kicad/`: `git diff 4bfed3f174 HEAD -- <path>` (working tree is clean).
> - **Do not** trust `scripts/kicad-diff-stats.sh` for the total — it only recognises two author emails
>   and now reports `0` because HEAD is authored by a teammate (this is the doc-07 bug, still unfixed).
> Verify line numbers before editing — they drift.

## What this document answers

Per-change verdict — **revert** (not needed on web) / **re-enable** (stubbed "because web" but works) /
**relocate** (needed, but movable to a new file + thin include) / **keep** / **upstream-PR** / **config** —
plus the engineering effort and the resulting diff size. It reconciles docs [01](01-revert-dead-code.md)–[12](12-network-stack.md)
against the *current* source and against a ground-truth per-file ledger so churn is not double-counted.

## Bottom line

The KiCad fork currently diverges by **~2,795 churned lines across 88 modified upstream files**
(+2,215 / −580). The 48 *new* files (+30,334 lines, ~28k of which is the WebGL GAL copy under
`common/gal/webgl` + `include/gal/webgl`; `SmaaAreaTex.h` alone is 14,980) are **policy-compliant and
excluded** — additive new files do not hurt a rebase.

- **Pure divergence cleanup is ~16–28 engineer-days** (~95–165 h at 6 productive h/day).
- Doing it fully lands at **~50 modified files / ~480–620 churned lines — a 78–83% reduction**.
- A cheaper **~3–5 day pass removes ~1,460 lines** (steps 1–6 below) and gets you to ~1,330 residual; the
  rest is diminishing-returns CMake relocation.
- **Biggest single lever: CMake — ~1,399 of the 2,795 lines (half the diff)** is mostly mechanical
  wrap-and-reindent churn that collapses to ~175–250 lines.
- **Feature re-enables that need porting (3D viewer Route C, ngspice) are weeks of product work and remove
  almost zero diff until done — keep them out of the cleanup budget.**

## What is already done (since the README baseline)

| Item | Doc | Churn removed | Evidence |
|---|---|---|---|
| `KICAD_IPC_API` gate reverts (18 files) | 01 | ~107 | Commit `c39e8f8689`; all 18 files byte-identical to merge-base |
| `kiglew.h` +189 GLEW-stub revert | 01 | ~190 | `c39e8f8689`; pristine vs upstream |
| `opengl_gal.cpp` Connect→Bind refactor revert | 01 | ~63 | `c39e8f8689`; pristine |
| `KI_DIAG_*` / `wxFprintf` diag call-site deletion | 01 | ~41 | `c39e8f8689`; **zero** `KI_DIAG` call sites remain (diag flags now inert even though `-DKICAD_DIAG_*=1` is still passed) |
| CMake de-churn batches A–F (16 files) | 02 | ~683 (CMake churn 1,702→1,019) | Kicad `6f82742e68` (F) on `b5ac6dcbe4` (A–E); root `0b4d830`. `-O1` WASM build (pcbnew/eeschema/calculator) + 9/9 e2e, no screenshot change; **build-graph proven byte-identical pre/post for the whole tree** (compile+link+custom commands) → zero behavior change. Moves: `KICAD_WASM_LAYER` var, early-return guards, `list(REMOVE_ITEM)`, `add_shader` redefine via new `wasm/cmake/WasmShaderOverride.cmake`, additive `BUILD_KIWAY_DLL` sets, pcb_calculator restructure, gerbview/pl_editor #5, navlib #6 (behavior-preserving stub de-churn). **The in-place de-dup pass is complete; only Phase-B `cmake/wasm/` relocation remains.** |
| Tooltips implemented in wx fork | 05 | enables ~19 revert | `wxwidgets/include/wx/wasm/tooltip.h` + `src/wasm/tooltip.cpp`, `wxUSE_TOOLTIPS=1` |
| `GetCurrentSelection`/`IsEmpty` already base behavior in wx wasm | 05 | enables ~11 revert | wasm `wxChoice` inherits base `GetCurrentSelection(){return GetSelection();}` |
| Symbol-lib asset pipeline | 09 | 0 (new files) | `boot.ts` seeds `sym-lib-table`; PCBJAM_LIB/FP plugins are additive new files |
| `char_traits_uint16` Altium blocker fixed | 08 | 0 (build infra) | force-`-include`d in `scripts/kicad/build-kicad-target.sh:369` — makes importer re-enable safe |
| ngspice/SPICE source stubs do **not** exist | 11 | 0 | `eeschema/sim/` is pristine; only a 15-line CMake stub block exists |

**Doc [01](01-revert-dead-code.md) is effectively closed** (~401 lines already removed). The
`pcb_edit_frame.cpp` / `pgm_base.cpp` churn that doc 01 originally listed is now `KICAD_SCRIPTING`
gating — a different track (see Reverts).

## The diff math — by action

Current churn ties to the 2,795-line ledger; residual = churn remaining in modified upstream files after
the action.

| Action | Files | Current churn | Residual | Net reduction | Confidence |
|---|---|---|---|---|---|
| **Revert** (dead/native-only, not needed on web) | 11 | ~64 | 0 | **−64** | HIGH |
| **Re-enable feature** (works on web, deletes gate) | 11 | ~145 | ~5 | **−140** | MED–HIGH (runtime-untested) |
| **Relocate → new file + thin include** | ~26 | ~2,050 | ~330 | **−1,720** | MED |
| **Keep-inline** (irreducibly small, needed) | ~14 | ~120 | ~120 | 0 | HIGH |
| **Upstream-PR** (vanishes on next submodule bump) | ~30 | ~115 | ~115 → 0 on merge | **−115 on bump** | HIGH |
| **Config-not-code** (runtime setting) | 3 | ~32 | 0 | **−32** | HIGH |
| **Native-bug-fix** (restores native, keeps web gate) | 2 | ~9 | ~8 | −1 | HIGH |
| **TOTAL** | **88** | **~2,795** | **~480–620** | **−2,175 to −2,315** | |

Residual sums to ~578 (relocate 330 + keep 120 + upstream 115 + re-enable 5 + native 8), dropping toward
~460 once the upstream PRs merge. The 480–620 range is mostly "how far the CMake relocation is pushed."

**Double-counts resolved while reconciling:** `pcb_io_mgr.cpp`/`sch_io_mgr.cpp` counted once under doc 08
(not doc 06); nng/webview/nanodbc CMake exclusions once under doc 02 (not doc 12); `pcb_base_frame.*` /
`sch_base_frame.*` fswatcher guards once (docs 05 & 12 overlap); `hidpi_gl_canvas.cpp` once (docs 05 & 07);
the eeschema ngspice CMake block (doc 11, 15 lines) is a subset of the doc-02 eeschema total, not additive.

## Reverts — zero-risk diff deletion (restore upstream exactly)

**~64 churn → 0.**

- **`KICAD_SCRIPTING` dead guards (~64 lines, 11 files)** — Python is policy-off and never compiled, so the
  gates are dead; reverting restores upstream and the OFF build still links. Files: `pcbnew/board_item.cpp`
  (2), `pcbnew/pcbnew_settings.cpp` (2), `include/pgm_base.h` (2), `eeschema/sch_edit_frame.cpp` (2),
  `common/tool/action_toolbar.cpp` (2), `pcbnew/menubar_pcb_editor.cpp` (4), `pcbnew/toolbars_pcb_editor.cpp`
  (6), `eeschema/toolbars_sch_editor.cpp` (6), `pcbnew/pcbnew.cpp` (Python parts), `pcbnew/pcb_edit_frame.cpp`
  (~22), `scripting/CMakeLists.txt` (5). **HIGH.**
- **Redundant wx workarounds (~11 lines)** — `eda_draw_frame.cpp` + `panel_setup_layers.cpp`
  `GetCurrentSelection()→GetSelection()` (10) and `dialog_sim_command.cpp` `IsEmpty()→GetCount()>0` (1):
  the wasm `wxChoice` already inherits the exact base behavior. No-ops. **HIGH.**
- **Tooltip guards (~19 lines, 8 files)** — wx fork ships working tooltip no-ops + `wxUSE_TOOLTIPS=1`, so
  every `#ifndef __EMSCRIPTEN__` / `#if wxUSE_TOOLTIPS` guard in KiCad is dead. (Revert is the zero-risk
  win; upstreaming the `wxUSE_TOOLTIPS` spelling is the cleaner long-term route.) **HIGH.**
- **fontconfig gratuitous comment/whitespace churn (~39 lines)** — noise in the still-compiled native arm;
  copy back from upstream. **HIGH.**
- **Native-only reverts (doc 07):** `KICAD_IPC_API` default flip (3) + dead build-script flags
  `KICAD_SPICE`/`KICAD_PCM`/`BUILD_GITHUB_PLUGIN` (root scripts, 0 kicad churn). **HIGH.**

## Relocate-to-new-file — needed on web, but shrinkable

**~2,050 → ~330.** Move the inline blob to a new TU/file; leave a ≤3-line `#include`/hook.

| Item | Files | Current → residual | Mechanism |
|---|---|---|---|
| **CMake `if(EMSCRIPTEN)` blocks** | 17 CMakeLists | ~1,399 → ~175–250 | Create `kicad/cmake/wasm/*.cmake` (**does not exist yet**) + a `KICAD_WASM_LAYER` cache var; early-`return()` guards; `list(REMOVE_ITEM)` instead of move-and-reindent; additive last-wins property sets; relocate static-kiface/stub blocks behind a 1-line `include()` |
| **libcontext fiber backend** | `libcontext.cpp` | 334 → ~0 (+1 new file) | New `libcontext_emscripten.cpp` selected via CMake; revert the 2-line guard on upstream `release_fcontext` |
| **fontconfig WASM stub** | `fontconfig.cpp`/`.h` | 228 → ~4 | New `fontconfig_wasm.cpp`; native-vs-wasm compile selection; move `<fontconfig/fontconfig.h>` into the .cpp |
| **gestfich web tool-launch bridge** | `common/gestfich.cpp` | 37 → ~3 | `EM_ASM` blob → thin extern-C hook into a new wasm-layer file |
| **static-KIFACE loader** | `common/kiway.cpp` | 33 → ~3 | Move the resolver to `wasm_kiface_loader.cpp` or call `OnKifaceStart` from the bindings layer (`include/kiway.h` `LIB_ENV_VAR` 5 lines stays) |
| **WebGL GAL src list** | `common/gal/CMakeLists.txt` | 30 → ~3 | Move `list(APPEND)` to `cmake/wasm/gal_webgl.cmake` |
| **HiDPI scale-factor** | `hidpi_gl_canvas.cpp` | 6 → ~2 | Override `GetScaleFactor` in the wx wasm HIDPI canvas |

**Confidence MED** — most carry link-order / static-kiface risk and need a real WASM build
(`docker/build.sh`) to verify. The CMake relocation depends on first creating `kicad/cmake/wasm/`.

## Re-enable features — net-negative diff (delete the gate)

**KiCad-source diff deletion (cheap, do now):**
- **Importers (doc 08, ~95 lines)** — delete `if(NOT EMSCRIPTEN)` / `#ifndef __EMSCRIPTEN__` gates in
  `common/CMakeLists.txt` (Altium), `pcbnew/CMakeLists.txt`, `pcb_io_mgr.cpp`, `eeschema/CMakeLists.txt`,
  `sch_io_mgr.cpp/.h`. Altium blocker already neutralized. ⚠️ **Configure-confident but runtime-untested** —
  the Altium pcbnew loader has never been linked for WASM; smoke-test with sample Eagle + Altium files.
- **Symbol viewer/chooser (doc 09, ~9 lines)** — delete the two `#ifdef __EMSCRIPTEN__ return nullptr`
  gates in `eeschema.cpp`; assets already provisioned. ⚠️ Runtime-untested (GAL/LIB_TREE + asyncify modal).
- **3D delete-from-diff (doc 10, ~93 lines)** — `exporter_vrml.cpp` stub (64), `pcbnew_jobs_handler.{cpp,h}`
  render job (9), `pcbnew.cpp` 3D panels (6), `eda_3d_canvas.cpp` raytracer gates (18).

**NOT source diff — real porting (weeks, separate):** Route C canvas blit wiring (16–40 h, new file),
static model-loading plugins (24–60 h), the ngspice port (30–70 h). These cut **0** divergence lines until
done — feature work, not cleanup.

## Must-keep / impossible

- **Collab/Yjs persistence hooks (~53 lines)** — `kicadCollabOnSave/OnModify` extern-C call sites at the
  save/modify chokepoint: `pcbnew/files.cpp` (13), `eeschema/files-io.cpp` (12), `pagelayout_editor/files.cpp`
  (13), `pl_editor_frame.cpp` (15 → ~4 after trimming comments). No upstream listener API for drawing-sheet →
  can't relocate behind a notification. **KEEP** (trim comments).
- **WebGL-GAL switch / silent Cairo fallback / warp-cursor** in `draw_panel_gal.cpp` (~17) — genuine web code,
  irreducibly small inline. **KEEP.**
- **SpaceMouse gates (~33 lines, 3D)** — 3Dconnexion hardware, impossible in a browser. Collapse to a leading
  no-op `__EMSCRIPTEN__` branch on the existing `#ifdef __linux__` ladder + drop redundant null-guards
  (`m_spaceMouse` is already default-null) → ~6 residual. Only matters once 3D builds.
- **wx-progress-reporter early-return (9)**, **bs_thread_pool inline shim (16)** — asyncify constraints; the
  proper fix lives in the wx layer / a re-vendor, not the rebase. **KEEP.**
- **`libcontext.h` platform `#elif` (9)**, **`include/kiway.h` `LIB_ENV_VAR` (5)**, **kiplatform CMake routing
  (19)**, **nng/IPC CMake stub**, **`openGL_includes.h` kiglew redirect (5)** — irreducibly small additive
  guards. **KEEP.**
- **ngspice model-data CMake stub (15)** — too-many-locals V8 workaround; only removable if a rebuild proves
  `wasm-opt -O2` now resolves it. **KEEP for now.**

## Orphans — divergence the write-up (docs 01–12) never covers

- **Drawing-sheet UUID feature (~33 lines, unconditional — no `#ifdef`, affects ALL builds):**
  `drawing_sheet.keywords` (1), `drawing_sheet_parser.cpp` (24), `ds_data_model_io.cpp` (4),
  `ds_data_item.h` (4). Adds a stable per-item KIID for the Yjs differ and **changes the `.kicad_wks`
  on-disk format unconditionally**. Strong **upstream-PR** candidate (KiCad is adding UUIDs to other item
  types); until merged it is pure divergence no doc accounts for.
- **Collab save/modify hooks (~53 lines)** — the `kicadCollabOnSave/OnModify` files above; acknowledge as
  permanent web-needed divergence. **KEEP.**
- **`bs_thread_pool.hpp` (16)** — async-theme single-thread shim, not 01–12. **KEEP / re-vendor.**

## Per-document effort & diff-reduction

Hours → days at 6 productive h/day.

| Doc | Theme | Current churn | Residual | Reduction | Effort (h / days) | Risk | Verdict |
|---|---|---|---|---|---|---|---|
| [01](01-revert-dead-code.md) | Revert dead code | 0 | 0 | 0 | 0–0.5 / ~0d | low | **DONE** (`c39e8f8689`) |
| [02](02-cmake-dechurn.md) | CMake de-churn | ~1,702 → 1,019 | ~175–250 | **−683 so far** | 22–38 / 3.7–6.3d | med | **A–F (in-place de-dup) DONE** (`6f82742e68`); only Phase-B `cmake/wasm/` relocation remains. Build graph proven identical → zero behavior change |
| [03](03-config-not-code.md) | Config-not-code | ~60 | ~3 | ~57 | 7–15 / 1.2–2.5d | low–med | 4/5 → runtime config |
| [04](04-stub-tu-relocation.md) | Stub-TU relocation | ~571 | ~20–31 | **~540–551** | 9–17 / 1.5–2.8d | low–med | **2nd-biggest lever** |
| [05](05-wx-layer-fixes.md) | wx-layer fixes | ~37 | ~3 | ~34 | 3–7 / 0.5–1.2d | low | Mostly revertable now |
| [06](06-upstreamable-patches.md) | Upstreamable patches | ~122 | ~48 (→~15 post-merge) | ~74+ | 17–39 / 2.8–6.5d | low–med | PR; UUID+collab stay |
| [07](07-native-build-bugs-and-tooling.md) | Native-build bugs & tooling | ~8 (+root scripts) | ~2 | ~6 | 4–9 / 0.7–1.5d | low | Tiny, near-zero WASM risk |
| [08](08-importers.md) | Importers re-enable | ~97 | ~2 | **~95** | 5–14 / 0.8–2.3d | low–med | Net-negative; runtime-untested |
| [09](09-symbol-libraries.md) | Symbol libs re-enable | ~9 | 0 | ~9 | 1–3 / 0.2–0.5d | med | Un-gate; assets shipped |
| [10](10-3d-viewer.md) | 3D viewer (Route C) | ~145 | ~12 | ~133 (diff) | 40–96 / 6.7–16d | high | ~93 delete cheap; rest is NEW porting |
| [11](11-ngspice-simulator.md) | ngspice simulator | ~15 | ~15 | 0 now | 40–90 / 6.7–15d | high | Future feature; keep 15 CMake lines |
| [12](12-network-stack.md) | Network stack | ~91 | ~27 | ~64 | 11–22 / 1.8–3.7d | low–med | fswatcher→PR, kiway→relocate |

**Pure-cleanup total (docs 01–08 + revertible parts of 12, excluding the 3D/ngspice feature ports):
~95–165 h ≈ 16–28 engineer-days.**

## Recommended sequencing (by diff-reduction-per-hour)

Cumulative removed is from the live 2,795 baseline (doc 01's ~401 already gone).

| # | Action | Doc | Reduction | Effort (h) | Cumulative removed | Risk |
|---|---|---|---|---|---|---|
| 1 | Stub-TU relocation (libcontext + fontconfig) | 04 | ~540 | 5–11 | ~540 | low–med |
| 2 | CMake de-dup pass (guards + `REMOVE_ITEM`, no relocation yet) — **batches A–F DONE** (`6f82742e68`, −683; in-place de-dup complete) | 02 | ~700 | 8–14 | ~1,240 | low–med |
| 3 | Importer re-enable (delete gates) | 08 | ~95 | 5–14 | ~1,335 | low–med |
| 4 | `KICAD_SCRIPTING` reverts | 03/06 | ~64 | 2–4 | ~1,399 | low |
| 5 | wx-layer + tooltip reverts | 05 | ~30 | 2–4 | ~1,429 | low |
| 6 | Config-not-code (warp cursor/hotkey/clock) | 03 | ~32 | 3–7 | ~1,461 | low |
| 7 | CMake relocation to `cmake/wasm/` (the hard ~450→~200) | 02 | ~250 | 12–24 | ~1,711 | med |
| 8 | gestfich + kiway relocate | 12/03 | ~67 | 6–12 | ~1,778 | med |
| 9 | Symbol viewer/chooser un-gate | 09 | ~9 | 1–3 | ~1,787 | med |
| 10 | Upstream-PR batch (RTree, hotkey, choice.h, ngspice guard, UUID, fswatcher) | 06/07/12 | ~115 on bump | 17–39 | ~1,902 (post-merge) | low–med |
| 11 | Native-build bug fixes + dead-flag removal | 07 | ~6 | 4–9 | ~1,908 | low |

**End-state after steps 1–9 (pure cleanup, pre-merge): ~1,008 residual. After the upstream PRs land
(step 10): ~895. With remaining CMake relocation + the deferred 3D/ngspice gate deletions folded in:
~480–620 residual.** The collab-bridge orphans (~86) + irreducible keep-inline gates (~120) are the
permanent floor.

**Highest-ROI first move:** stub-TU relocation (step 1) — ~540 lines for one day at the lowest risk —
then the CMake de-dup pass, which is half the entire diff.

## Caveats

- **480–620 is the *full* end-state.** Steps 1–6 (~25–50 h) get you to ~1,330 residual; the rest is
  diminishing-returns CMake relocation.
- **Relocate estimates are MED confidence** — they need a real WASM build to verify link order /
  static-kiface behavior. Budget a build + e2e run per relocation batch.
- **3D and ngspice are weeks of feature work, not cleanup** — they delete ~100 diff lines but only after
  dozens of porting hours; exclude from any diff-reduction budget.
- Per the project's own policy ([fork-divergence research](../../../docs/features/fork-cleanup/06-upstreamable-patches.md)),
  reduce divergence in the wasm/build layer first; temporary diagnostics in kicad/wx are OK but must be
  reverted before commit.

## Related

- [README.md](README.md) — the master inventory (baseline numbers now superseded by this doc).
- [07-native-build-bugs-and-tooling.md](07-native-build-bugs-and-tooling.md) — includes the
  `kicad-diff-stats.sh` author-list bug that makes the script report `0`; fix it to track the real number.
