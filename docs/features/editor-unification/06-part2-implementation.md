# 06 — Part 2: implementation record & current state

> **Status: Part 2 IMPLEMENTED (2026-07-02).** As-built companion to the
> [`04`](04-part2-single-app-merge.md) plan: the pcbnew and eeschema kifaces are now
> statically linked into **one** WASM executable, `kicad_editor`, and all four editors
> (PCB / Footprint / Schematic / Symbol) are runtime `--frame` choices of that single
> bundle. One editor per page load (unchanged UX); multi-frame/cross-probing remains a
> follow-up this merge lays the groundwork for.

## One-paragraph summary

`kicad_editor.wasm` (178 MB at `-O1` debug vs 147 + 82 for the two engines separately —
shared wx/common/boost linked once) serves every editor tool. The frontend maps all four
editor tools onto the one bundle (`TOOL_BUNDLE`) and passes `--frame=pcb|fpedit|sch|
symedit`. The merge's real work was symbol-collision surgery: each engine's `Kiface()`
accessor and `KIFACE_1` getter got per-engine names via CMake compile definitions (zero
call-site edits), **21 additional ODR collisions found by a symbol audit** (upstream
reuses class names like `DIALOG_TEXT_PROPERTIES` for *different* classes per module) were
renamed on the PCB side the same way, six shared `common/` call sites now resolve their
owning frame's kiface exactly, and the duplicated embind layer became per-editor entries
behind a single dispatching registration.

## What changed

### C++ — `kicad` submodule (commit `a542e264`; ALL gated on `KICAD_WASM_MERGED_EDITOR`, OFF by default — option-OFF trees and native builds are byte-identical)

| File | Change |
|---|---|
| `include/kiway.h` | `KIFACE_GETTER` macro `#ifndef`-guarded so each kiface can carry a distinct getter symbol. |
| `CMakeLists.txt` | `KICAD_WASM_MERGED_EDITOR` option; `KICAD_WASM_PCB_SIDE_RENAMES` (the `Kiface=PcbKiface` static binding + the 21 audited ODR renames, see below); gated `add_subdirectory(${KICAD_WASM_LAYER}/editor)` after both engines. |
| `pcbnew/CMakeLists.txt`, `eeschema/CMakeLists.txt`, `common/CMakeLists.txt` | Apply the renames to `pcbnew_kiface_objects` + `pcbcommon` / `Kiface=SchKiface` to `eeschema_kiface_objects`; per-source `KIFACE_GETTER=<engine>_kiface_getter` on the hoisted `pcbnew.cpp`/`eeschema.cpp`; both `*_KIFACE_LIBRARIES` lists exported `CACHE INTERNAL` for the out-of-fork merged target. |
| `common/single_top.cpp` | `KICAD_MERGED_KIFACES` branch registers **both** faces (`set_kiface(FACE_PCB/FACE_SCH, …)`, `OnKifaceStart` stays lazy — the native project manager's model); **latent Part 1 bug fixed**: `PreloadLibraries` now uses the runtime-resolved frame, not compile-time `TOP_FRAME` (a `--frame=sch` boot on the PCB-default image preloaded the wrong face). |
| `common/eda_base_frame.cpp`, `common/dialogs/dialog_color_picker.cpp`, `common/design_block_tree_model_adapter.cpp` | The six real `Kiface()` call sites in shared code (`config()`/`sys_search()`/`help_name()` + color picker ×2 + design-block tree) resolve their owning frame's kiface exactly (`m_ident` → `KifaceType` → `KiFACE`), falling back to the global accessor. `__EMSCRIPTEN__`-only; standalone-tree behavior identical. |

### Why static per-engine binding (not one "active kiface" pointer)

PCB code runs while a **schematic** frame is active — e.g. the symbol chooser's footprint
preview reaches `KiFACE(FACE_PCB)` via `common/project.cpp`, after which `pcbcommon`
painter/IO code (`pcb_painter.cpp`, `pad.cpp`, …) calls `Kiface()` with no frame context
and must get the **PCB** kiface. A focus-based global would hand it the schematic one.
Hence: module code binds statically (`Kiface=PcbKiface`/`SchKiface`); only the merged
image's fallback `Kiface()` (in `wasm/editor/merged_kiface_dispatch.cpp`) does a
focus/top-window walk, and the six common/ sites resolve per-frame.

### The ODR audit (Stage 0 gate — the research doc's list was incomplete)

`llvm-nm` strong-symbol intersection of the two kiface object sets + weak-symbol
intersection minus shared-lib symbols found, beyond `Kiface()`/`KIFACE_1`:

- Same-name-**different-class** pairs (vtables/typeinfo/inline members would silently
  cross-bind under `--allow-multiple-definition` → memory corruption, not link errors):
  `DIALOG_TEXT_PROPERTIES`, `DIALOG_SHAPE_PROPERTIES`, `DIALOG_TABLE_PROPERTIES`,
  `DIALOG_TABLECELL_PROPERTIES`, `DIALOG_GLOBAL_EDIT_TEXT_AND_GRAPHICS`,
  `PANEL_SETUP_FORMATTING` (each + `_BASE`), `TEXT_SEARCH_HANDLER`,
  `GROUP_SEARCH_HANDLER`, and (weak-only, invisible to a strong-symbol scan)
  `TEXTBOX_POINT_EDIT_BEHAVIOR`, `RECTANGLE_POINT_EDIT_BEHAVIOR`,
  `FILEDLG_HOOK_SAVE_PROJECT`, `FOOTPRINT_INFO_GENERATOR`.
- Colliding free fn/data: `checkOverwriteDb()`, `allowedActions[]`, `g_excludedLayers`.
- Benign (no symbol intersection): PADS importer structs, `CONNECTION_GRAPH`
  (namespaced), all same-name classes defined once in `include/`/`common/`.

All renamed one-side (PCB_ prefix) via the CMake define list. **Re-run
`scripts/kicad/audit-merged-symbols.sh` (in the build container) on every kicad
submodule bump** — a new upstream same-name class ships as silent corruption otherwise.

### WASM layer & build — root repo (commit `6bf0b76`)

- `wasm/editor/CMakeLists.txt` — the merged executable: `single_top.cpp`
  (`TOP_FRAME=FRAME_PCB_EDITOR;KICAD_MERGED_KIFACES`, no `PGM_DATA_FILE_EXT` — Part 1's
  runtime extension map covers all four frames) + `merged_kiface_dispatch.cpp`; links
  both exported library lists (deduped) with `--allow-multiple-definition` +
  `--whole-archive pcbcommon`; binary dir `kicad_editor/` makes docker/build.sh's
  `${subdir}/${app}.js` copy work unmodified.
- `wasm/bindings/` — both per-editor TUs' six shared collab entries renamed
  `pcbCollab*` / `schCollab*` (JS-facing names unchanged); their duplicate
  `kicadOpenFile` / `extern "C" kicadCollabOnSave` definitions and shared-name
  `EMSCRIPTEN_BINDINGS` registrations compiled out under `KICAD_MERGED_EMBIND`; new
  `kicad_editor_embind.cpp` registers each shared JS name once and dispatches on
  `pcbEditorActive()`/`schEditorActive()` (the same top-window `dynamic_cast` probe the
  impls always started with). Standalone pcbnew/eeschema builds compile without the
  define and register the same JS names as before. *(War story: `pcbCollab*/schCollab*`
  in a block comment — the `*/` terminates the comment. Cost one build cycle.)*
- `scripts/kicad/build-kicad-target.sh` — `kicad_editor` case arms; `STUB_APP=pcbnew`
  (eeschema's frame stub arrives via CMake `target_sources`); `-DKICAD_WASM_MERGED_
  EDITOR=ON` for this app only; Step 7.1 refactored into `compile_embind_tu` and
  compiles **three** embind objects for the merged app (both per-editor TUs with
  `-DKICAD_MERGED_EMBIND` + the dispatcher), all with the ABI-critical
  `KICAD_TU_ABI_FLAGS`; multi-object force-relink guard.
- `docker/build.sh` — `all` = `kicad_editor calculator pl_editor gerbview`
  (kicad_editor first: largest bundle = the wasm-opt critical path). `pcbnew`/`eeschema`
  remain valid **explicit** apps (standalone debug aids in their own option-OFF trees;
  not deployed). `scripts/kicad/build-kicad_editor.sh` wrapper added.
- `scripts/kicad/audit-merged-symbols.sh` — the repeatable ODR audit.
- `.github/workflows/wasm-opt-bench.yml` — left building `eeschema` deliberately
  (still a valid explicit app; cheaper fixture, representative for pass sweeps).

### Frontend & deploy

- `web/standalone/src/wasm/constants.ts` — new `Bundle` union type (a bundle is a
  delivery artifact, NOT a `Tool`; `kicad_editor` is deliberately not in the `TOOLS`
  enum). `TOOL_BUNDLE: Record<Tool, Bundle>` maps all four editors → `kicad_editor`;
  `TOOL_FRAME` gains explicit `pcb`/`sch` for pcbnew/eeschema (the merged bundle can
  only default to one frame — PCB). `TOOL_ARGV0`/config-seed/lib-kind stay per-tool.
- `boot.ts` (`pthreadWorkerScript` param → `Bundle`; dead `?? tool` fallbacks dropped)
  and `wasm-assets.ts` — already bundle-aware from Part 1; typecheck green.
- `scripts/deploy/publish-wasm.mjs` — `TOOLS = [kicad_editor, pl_editor, gerbview,
  calculator]`. NOTE: run one full publish before any `--from-registry` snapshot (the
  registry needs a kicad_editor entry); old CDN folders are immutable so deployed
  frontends keep working.

### Tests & CI

- All five editor harness HTMLs load `kicad_editor.js`; pcbnew/pcbnew-collab/eeschema
  gained explicit `--frame=pcb`/`--frame=sch` in `Module.arguments`.
- `tests/scripts/setup-kicad-wasm.sh` copies `kicad_editor` instead of pcbnew+eeschema.
- `tests/playwright-kicad.config.ts` — `PCBNEW_FAMILY_SPECS` → `BIG_MODULE_SPECS`
  + the 8 eeschema-family globs (eeschema.spec, -collab, -crosshair, -load, -subschema,
  -ui, -url-regex, symbol_editor.spec): every spec booting the ~190 MB merged module
  routes to `chromium-ci` on CI (SpiderMonkey x86 code-budget OOM). Firefox keeps the
  small bundles. Verified via `--list`: CI-firefox 0 merged-module tests, chromium-ci 43.
- `tests/kicad/frame-runtime.spec.ts` — extended to all four frames; also asserts no
  duplicate embind registration ("Cannot register public name").

## Validation (2026-07-02, local ARM Mac, Firefox, `-O1` debug bundle)

1. **frame-runtime 4/4** — each harness lands on its own title from the one bundle
   (`PCB Editor`, `[no footprint loaded] — Footprint Editor`, `untitled [Unsaved] —
   Schematic Editor`, `[no symbol loaded] — Symbol Editor`), no aborts, no duplicate
   embind registration. 17 s total.
2. **Merged-module regression subset (16 spec files): 24 passed**, 1 flaky-passed
   (3d-viewer open/render under 4-worker load), 1 failed — see known-failure below.
   3D raytracer renders the pic_programmer board correctly (screenshot checked).
   No tracked-baseline screenshot diffs.
3. **Collab bridge: 10 passed, 2 pre-existing skips** — eeschema + pcbnew collab
   (snapshot/apply/two-tab BroadcastChannel propagation/native-EH double apply) all
   through the merged embind dispatcher, in both frame types.
4. **Symbol/link audit of the built tree** — `PcbKiface`/`pcbnew_kiface_getter` and
   `SchKiface`/`eeschema_kiface_getter` in their own objects; plain `Kiface()` only in
   the dispatch TU; embind JS names present exactly once in the wasm.
5. **Full suite (all bundles): 67 passed, 3 pre-existing skips, 1 failed** — the
   single failure is the known pre-existing 3d-viewer drag deadlock below (its
   follow-on resize test "did not run"). calculator/pl_editor/gerbview rebuilt and
   green alongside the merged bundle.
6. **Cross-face probe (`xface-probe.spec.ts`, kept as a permanent guard): PASSED** —
   in a `--frame=sch` session, opening Preferences lazy-starts the PCB kiface and its
   pages appear in the tree (**"Footprint Editor", "PCB Editor", "3D Viewer"** —
   absent on the old single-kiface bundle, where `KiFACE(FACE_PCB)` returned nullptr).
   This is the same path the symbol chooser's footprint preview uses, and a
   user-visible improvement: the other engine's preference pages now populate.

### Known pre-existing failure (NOT a merge regression)

`3d-viewer.spec.ts` "draggable, X-closable DOM title bar": dragging the 3D viewer
re-renders via the raytracer, which needs fresh pthread workers from a drained pool —
the on-demand worker boot deadlocks the main thread. Fixed on `origin/main` by
`7630c7e` ("raytrace deadlock — pre-warm 2N+8 pthread Workers", a `PTHREAD_POOL_SIZE`
link-flag change this branch predates; branch base is 14 commits behind). Goes green
when the branch is synced with main (`/git-feature-sync`) and `kicad_editor` is
relinked. Everything else in the 3d-viewer spec (open over a loaded board, raytrace
render) passes.

## Build & size facts

- `output/kicad_editor.wasm` **178 MB** (`-O1` debug; sidecar `.wasm.debug.wasm`
  2.3 GB) vs 147 + 82 MB for the separate engines — the dedup of wx/common/boost is
  real. Deployed set is now 4 bundles instead of 5.
- Host postprocess (dyncall shims → finalize → asyncify → `wasm-opt -O1`) completed on
  a local Mac without drama — the `-O2` cost/RSS concerns in `04` apply only to
  release-level wasm-opt.
- Build: `./docker/build.sh kicad_editor` (own tree `kicad-kicad_editor`, configured
  with `-DKICAD_WASM_MERGED_EDITOR=ON`; standalone pcbnew/eeschema trees untouched).

## What's next

- Sync the branch with main (picks up `7630c7e` → 3d-viewer drag test green;
  relink kicad_editor after).
- Run `tests/web/tools-open.spec.ts` against the real web app once ports 3048/3060
  are free (at validation time another worktree's dev stack held them; the
  frontend path itself — `resolveWasmBase`→`TOOL_BUNDLE`→boot→`--frame` — is
  unchanged from Part 1's validated flow, only the map values differ, typecheck
  green). First deploy needs one full `publish-wasm.mjs` run (registry entry)
  before any snapshot deploy.
- Follow-ups (out of scope): multi-frame/cross-probing in one instance (both faces are
  now registered under one KIWAY — the groundwork exists); folding
  gerbview/pl_editor/calculator into the image; size levers (wasm-EH, JSPI).
