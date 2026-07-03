# OCC split — move OpenCASCADE out of `pcbnew.wasm` into a lazy worker service

> Feature doc for branch **`occ-lazy-load`** (worktree `../kicad-wasm-occ-lazy-load`), 2026-07-02.
> Hard constraints: **native wasm-EH, pthreads, Asyncify, NO JSPI, NO dynamic linking**
> (dlopen/SIDE_MODULE/wasm-split are RED — §2). Codebase claims carry `file:line`
> (kicad @ `9d77139`, root @ `9787efc`).

---

## TL;DR

OpenCASCADE (OCC) is **~30% of `pcbnew.wasm`** (~19.5 MiB base code → ~35–40 MB after
Asyncify) and serves **two features**: parsing STEP/IGES **component models** for the 3D
viewer (working — and the primary model path, §1a), and STEP/3D **export** (broken —
its UI spawns a `kicad-cli` subprocess, impossible in a browser, §1b).

**The plan:** move OCC and both features into a standalone **`occ_service`** module —
own emscripten instance and memory, running in a **Web Worker**, fetched **on demand** —
leaving `pcbnew.wasm` OCC-free.

- `pcbnew.wasm`: **~146 → ~109 MB raw** (the 2D-editing download, ~25–30% less transfer).
- `occ_service.wasm`: **~25–45 MB raw** estimate (our OCC compiles `-O1`; the worker also
  carries the board parser — measure), fetched only when a STEP model must be parsed or
  the user exports.
- **3D viewer behavior is unchanged** (same parser code, executed in the worker; §3);
  **export starts working for the first time**.

The pcbnew↔service API is **two functions**:

```
pcbnew.wasm (no OCC)                          occ_service.wasm (worker, lazy)
Export dialog OK ─► occExport(boardSexpr, paramsJson) ──► parse + EXPORTER_STEP ─► bytes ─► downloadBytes()
oce3d_Load shadow ─► occLoadModel(fileBytes, ext) ──────► OCC parse + tessellate ─► scenegraph-cache bytes ─► S3D::ReadCache
```

---

## 1. The two OCC consumers today

OCC is reached by exactly two subsystems (grep-proven across `kicad/` for
`TopoDS`/`BRep`/`Standard_`/`STEPControl`/…). Everything else — 2D editor, GAL, DRC,
router, kimath, the 3D scene build and raytracer (board geometry is native earcut
tessellation), eeschema, gerbview — is OCC-clean.

### 1a. Component-model import — WORKING, and OCC is its primary parser

The 3D viewer's format loaders are static libraries in the wasm build (upstream loads
them as dlopen plugins; wasm has no dlopen, so they're linked in with per-TU symbol
renames and a registry):

- `plugins/3d/vrml` (`vrml3d_*`) — VRML/WRL/X3D, no OCC.
- `plugins/3d/oce` (`oce3d_*`) — **STEP/IGES via OCC** (`loadmodel.cpp`: STEP/IGES
  readers → `BRepMesh_IncrementalMesh` → `SCENEGRAPH` triangles).
- Registry: `3d-viewer/3d_cache/pcbjam_static_3d_plugins.cpp` (EMSCRIPTEN-only TU) feeds
  both into the plugin manager; `3d-viewer/CMakeLists.txt` links
  `s3d_plugin_vrml s3d_plugin_oce` for EMSCRIPTEN.

Model **files** arrive lazily: when the filename resolver can't find a model,
`S3D_CACHE::load` (`3d_cache.cpp:156-161`) calls `PCBJAM_3D::EnsureModelFile`
(`3d-viewer/3d_cache/pcbjam_model_fetch.cpp`) — an **`EM_ASYNC_JS` asyncify suspend**
that asks the JS provider (`kicadLibs.request`, kind `model3d`;
`web/standalone/src/wasm/libs/models-{source,bridge}.ts`), which fetches
**R2 CDN → IndexedDB cache → MEMFS** and returns the absolute path. Once per unique
model, memoized, e2e-covered (`tests/kicad/3d-viewer-models.spec.ts`).

**Key consequence for this feature:** the published model library (kicad-packages3D
10.x) is **STEP-only** — `.wrl` asks are served `.step` bodies by the bridge's fallback
map (`models-bridge.ts:106-117`), and the served extension picks the plugin. So for
library models, **`oce`/OCC is the parser that runs**; VRML handles only project-local
legacy files. Any OCC removal must therefore carry this path along, gated by the
3d-viewer-models spec + screenshots staying green.

### 1b. STEP/3D export — BROKEN (its UI spawns a subprocess)

`DIALOG_EXPORT_STEP` (File → Export → STEP/GLB…) does not run the exporter in-process,
even on desktop. On Export (`pcbnew/dialogs/dialog_export_step.cpp:548-708`) it locates
the **`kicad-cli`** binary, builds a command string from the dialog controls
(`… pcb export step --no-dnp --subst-models --output …`), and spawns it via `wxExecute`;
the child process maps the flags to `JOB_EXPORT_PCB_3D` and runs
`PCBNEW_JOBS_HANDLER::JobExportStep` (`pcbnew_jobs_handler.cpp:532`, `EXPORTER_STEP`
ctor at `:648`) — OCC executes in the child. In the browser this fails twice: we ship
no kicad-cli, and wasm has no processes (`wxExecute` needs fork/exec). The exporter
cluster (`exporters/step/*` + `exporters/u3d/*`, whose only external caller is that
jobs handler) is linked but unreachable from any UI path.

**Scale note:** in time, both consumers are batch — once per unique model at scene
build, once per export click. Inside, they make thousands of fine-grained OCC calls
(`step_pcb_model.cpp`, `loadmodel.cpp`) — which is why the split boundary is files/bytes
handed to two entry points, never OCC's own API.

---

## 2. Architecture: two RPC functions, separate instance, Web Worker

Every form of Emscripten **dynamic linking is RED** here (each constraint breaks it
independently): dlopen can't rewind through asyncify (emscripten #13049), pthread
workers re-compile side modules (#17078), EH-across-boundary is fragile (#22285),
`wasm-split` needs `PROXY_TO_PTHREAD` (GUI is on our main thread). Full analysis:
`docs/features/perf/bundle-size.md §4` (bundle-size branch).

A **separate emscripten instance in a dedicated Worker** sidesteps all of it — own
`Module`, own memory, own runtime; data crosses by copying. For export this mirrors
what desktop already does (kicad-cli child process ↔ worker; flags ↔ params JSON; file
on disk ↔ bytes back). For import it relocates where the parse executes; the delivery
pipeline (CDN→IDB→MEMFS) and everything downstream of `SCENEGRAPH` are untouched.

- **Transport = postMessage + transferable `ArrayBuffer`s** (move semantics, zero-copy).
  The only real copies are into/out of each wasm heap — fundamental (a module addresses
  only its own linear memory), ms-scale on MB payloads vs seconds-scale OCC work.
  SharedArrayBuffer views were considered and rejected: both heaps are already SABs
  (`-pthread`), but direct sharing grants the worker write access to the editor heap and
  couples us to cross-heap pointer lifetime + shared-memory-growth semantics across 3
  engines, for no measurable win. Cancel = `worker.terminate()` + re-boot.
- **Export result bytes never enter pcbnew's heap**: worker → provider → Blob →
  `downloadBytes()` (`web/standalone/src/lib/download.ts:6`); C++ receives a small
  status/report JSON. Import results (scenegraph-cache bytes) do enter — `S3D::ReadCache`
  consumes them there.
- Neither OCC job suspends internally (no `emscripten_sleep`/modal/`PROGRESS_REPORTER`
  in either path), so the service builds **`-sASYNCIFY=0`** — no ~2× asyncify tax.
  External precedent: [andymai/occt-wasm](https://github.com/andymai/occt-wasm) (OCCT in
  a Worker, `-fwasm-exceptions`, no asyncify → 20.8 MB / ~4 MB brotli);
  [kovacsv/occt-import-js](https://github.com/kovacsv/occt-import-js) (STEP→mesh).

**Latency reality:** the 2D editor (the common session) never fetches the service. A 3D
view of a board with library models effectively always will (the 10.x library is
STEP-only) — one fetch (~5–9 MB brotli), then IDB-cached like the models themselves.

---

## 3. Design decisions

- **Callee-shadowing, not caller-`#ifdef`s.** Both features reduce to one shadowable
  function each, and the wasm build swaps in replacement definitions (the established
  `PCBNEW_WASM_STUBS` pattern):
  - `EXPORTER_STEP` ctor/dtor/`Export()` — shadow TU in our repo (`wasm/stubs/`);
    `pcbnew_jobs_handler.cpp` and every other caller compile untouched and keep working.
  - `oce3d_Load` (+ the `oce3d_*` metadata getters the registry needs — mirroring
    `oce.cpp`'s extension/filter answers) — shadow TU replaces linking `s3d_plugin_oce`;
    the registry, plugin manager, `S3D_CACHE`, and scene build compile untouched.
- **UI stays exactly as desktop.** Dialog, menu, actions untouched. The **single KiCad
  source `#ifdef`** in the whole feature is in `dialog_export_step.cpp` at the
  `wxExecute` spawn site: read the same controls, fill `EXPORTER_STEP_PARAMS`, call
  `EXPORTER_STEP(…).Export()` directly — the shadow does the rest. (There is no function
  to shadow there; the divergence *is* the process spawn.)
- **3D viewer parity is a hard gate.** Same parser code (`loadmodel.cpp`) compiled into
  the service; results return via KiCad's own scenegraph serialization
  (`S3D::WriteCache`/`ReadCache`, `plugins/3dapi/ifsg_api.h` — the on-disk model-cache
  format). `3d-viewer-models.spec.ts` + the screenshot gate must stay green.
- **Params JSON = the official job JSON.** `JOB_EXPORT_PCB_3D` registers every field as
  a serializable `JOB_PARAM` (`common/jobs/job_export_pcb_3d.cpp:94-149`); the bridge
  uses KiCad's own (de)serialization, no invented schema. Every dialog option is honored
  (formats STEP/GLB/XAO/BREP/PLY/STL + all flags).
- **Export component models = desktop parity in v1.** Models embedded in the board file
  travel inside the sexpr and work; disk-path references the worker can't see hit
  `EXPORTER_STEP`'s missing-file warn+skip, like desktop with a broken path. The
  CDN model pipeline (§1a) is the natural upgrade to full component embedding —
  follow-on (§7).
- **Alternative rejected — wasm kicad-cli in a worker:** same architecture, but stock
  kicad-cli links both kifaces + all job handlers (~100+ MB lazy module); trimming it is
  more fork surgery than the one dialog `#ifdef`; emulating the spawn (argv string
  parsing, `wxProcess` event plumbing) outweighs it; and the real glue (board in, bytes
  out) is needed either way.

---

## 4. Implementation

### Stage 1 — `occ_service` target (build + entry, no pcbnew changes)

Template = `sym_convert`, the proven gated headless `-sASYNCIFY=0` KiCad module
(`kicad/eeschema/CMakeLists.txt:796-830`), adapted from run-once Node CLI to persistent
worker embind:

- Target lives in the superproject: `wasm/occ-service/CMakeLists.txt`, hooked from the
  kicad fork's top-level CMakeLists via
  `add_subdirectory( ${KICAD_WASM_LAYER}/occ-service )` under
  `option( KICAD_OCC_SERVICE_WASM … OFF )` (the `wasm/editor` pattern; kicad keeps only
  the option + hook + the exporter-source `CACHE INTERNAL` export). Linked like
  `sym_convert`: full pcbnew kiface libraries + `s3d_plugin_oce` + `kicad_3dsg` +
  `${OCC_LIBRARIES}` + `LINKER:--allow-multiple-definition`, in its own configured tree.
- **Size mechanism = link-time `-Oz` whole-module DCE** (as `sym_convert` documents,
  `eeschema/CMakeLists.txt:825-827`): the only roots are the embind entry + runtime, so
  editor/GAL/tool code pulled via the kiface objects is stripped. Fallback if fat:
  `add_library( … STATIC $<TARGET_OBJECTS:pcbnew_kiface_objects> )` for
  object-granularity pruning. Measure first.
- **LINK_FLAGS** = `-Oz -g0 -sASYNCIFY=0 --pre-js …/occ_service_pre.js -sMODULARIZE=1
  -sEXPORT_NAME=OccService --bind -sENVIRONMENT=worker,node -sEXIT_RUNTIME=0`, keep
  `-pthread` + the EH triple (`env.sh:46`) + the inherited **2N+8 pre-warmed pthread
  pool** — load-bearing; see the threading note in §7 for the confirmed Chromium
  deadlock it prevents. NOT `-sINVOKE_RUN`/`-sEXIT_RUNTIME=1`/`-sNODERAWFS`
  (sym_convert's CLI model).
- **Entry `wasm/occ-service/occ_service_main.cpp`**, embind (compiled inside the CMake target so
  its defines match the linked objects — the embind vtable-skew class):
  - `occExport(boardSexpr, paramsJson) → bytes`: headless board load replicating
    `pcbnew_scripting_helpers.cpp:96-235` (standalone `SETTINGS_MANAGER`, default
    project, `PCB_IO_MGR::Load(KICAD_SEXP)`, `SetProject`) — that file itself is
    `KICAD_SCRIPTING`-gated, so the ~30-line pattern is replicated, not linked;
    paramsJson → `JOB_EXPORT_PCB_3D::FromJson` → the JOB→`EXPORTER_STEP_PARAMS` mapping
    of `pcbnew_jobs_handler.cpp:630-648` → `EXPORTER_STEP(…).Export()` to MEMFS → bytes.
  - `occLoadModel(fileBytes, ext) → bytes`: write to MEMFS with the right extension
    (extension picks STEP vs IGES inside), call the real `oce3d_Load`,
    `S3D::WriteCache` the returned `SCENEGRAPH` → return the cache bytes.
  - `wasm/occ-service/occ_service_pre.js`: in-memory wxConfig store (copy `sym_convert_pre.js`).
- **Build wiring**, mirroring `sym_convert`: `scripts/kicad/build-occ_service.sh`; the
  `case`/option/tool-gates in `scripts/kicad/build-kicad-target.sh`; `docker/build.sh`
  `VALID_APPS`/validation/subdir + **skip host post-processing and the asyncify pass**
  for this target.
- **Verify**: Node (`-sENVIRONMENT=worker,node`) unit run — `occExport` on a real
  `.kicad_pcb` (validate the STEP round-trips, e.g. `occt-import-js`), `occLoadModel` on
  a real `.step` (cache bytes non-empty, `ReadCache`-able).

### Stage 2 — bridges + JS provider (pcbnew gains the worker paths; OCC still linked)

- **Export shadow** `wasm/stubs/exporter_step_stub.cpp` (appended to
  `PCBNEW_WASM_STUBS`): `Export()` serializes the live `BOARD` to sexpr (in-memory
  `PCB_IO_KICAD_SEXPR`), builds the job JSON, calls `js_occRequest` (`EM_ASYNC_JS`,
  near-copy of the main-thread path of `pcb_io/pcbjam_fp/pcb_io_pcbjam_fp.cpp:58-95`;
  the `js_*` name is auto-covered by `scripts/common/asyncify-imports.txt`), returns the
  status/report JSON to the caller; bytes go provider → Blob → `downloadBytes()`.
- **Import shadow** `wasm/stubs/oce_plugin_stub.cpp`: the full `oce3d_*` flat-C surface
  with `oce.cpp`'s metadata answers; `oce3d_Load(path)` reads the file from MEMFS
  (already materialized by `EnsureModelFile`), ships bytes + ext via the same
  `js_occRequest` channel, writes the returned cache bytes to a temp MEMFS path,
  `S3D::ReadCache` → `SCENEGRAPH*`. Suspending here is proven legal — `EnsureModelFile`
  already asyncify-suspends inside the same `S3D_CACHE::load` call path.
- **Dialog seam**: the one `#ifdef __EMSCRIPTEN__` at `dialog_export_step.cpp:568/:708`
  (controls → params → `EXPORTER_STEP(…).Export()`).
- **JS provider/worker**: `installOccService()` sets `globalThis.occService = { request }`
  (copy `installLibsProvider`, `web/standalone/src/wasm/libs/source.ts:245-386`). First
  request lazily fetches + boots the module in a dedicated Worker (manifest-resolved,
  `MODULARIZE` factory; boot pattern `site/public/gerber-demo/boot.js`; reuse the
  cross-origin blob-`importScripts` shim `web/standalone/src/wasm/boot.ts:113-137` for
  the worker + its nested pthread workers); transferables both ways; export results →
  `downloadBytes()`, import results → back to the caller. Manifest entry in
  `web/standalone/src/wasm/wasm-assets.ts`.
  Inside the blob wrapper every asset path must be absolutized against the glue's
  URL — `locateFile: (f) => new URL(f, GLUE).href` — because a `blob:` worker has
  no http base: a string-concat base works for absolute CDN URLs but a
  root-relative base like `/wasm/` fails URL parsing in the worker, aborting the
  module before the `.wasm` request even hits the network. Export download names
  guard against the dialog's empty-stem default (`.step` → `export.step`).
  The worker-side wrapper is ONE shared plain-JS file,
  `web/standalone/src/wasm/occ-worker.js` (app imports it via vite `?raw`; the
  e2e harness stub reads it off disk) — the host prepends a one-line
  `self.OCC_GLUE_URL = …` prelude to the blob. In tests the provider is
  installed ambiently by `tests/kicad/fixtures.ts` as an init script.
- In this stage the shadows can ship dark (service used only under a flag or test) —
  pcbnew still links OCC, so behavior is unchanged until Stage 3 flips.

### Stage 3 — unlink OCC from `pcbnew` (the payoff, gated by green e2e)

All in `kicad/pcbnew/CMakeLists.txt` + `kicad/3d-viewer/CMakeLists.txt`, house
importer-gate style:

1. Exporter sources (`exporters/step/*` + `exporters/u3d/*`) → `PCBNEW_OCC_EXPORTERS`,
   appended to `PCBNEW_EXPORTERS` only `if( NOT EMSCRIPTEN )` (the service target
   compiles the variable).
2. `${OCC_LIBRARIES}` on `pcbnew_kiface_objects` under `if( NOT EMSCRIPTEN )`.
   `find_package(OCC)` + top-level OCC include dirs stay (headers still compile).
3. 3d-viewer: for EMSCRIPTEN link `s3d_plugin_vrml` + the import shadow instead of
   `s3d_plugin_oce`.
4. Export + import shadows go live (they are the only definitions now).

Gate: full kicad e2e in all 3 engines + `3d-viewer-models.spec.ts` + screenshot diff —
STEP component models must render identically through the worker. Then measure.

---

## 5. Verification & benchmarks

- **Stage-by-stage**: Node unit (Stage 1); e2e with the service behind a flag (Stage 2);
  the full gate on Stage 3 (above).
- **New e2e specs** (all 3 engines, wired like `3d-viewer-models.spec.ts`):
  `tests/kicad/occ-export.spec.ts` — dialog-driven export; asserts `occ_service` is
  fetched lazily (not on first load, once on export), the download's bytes validate
  (STEP `ISO-10303-21` + deep-parse via an `occt-import-js` devDependency; magic-byte
  smoke for GLB/BREP/XAO/PLY/STL), and the UI stays responsive mid-export.
  `tests/kicad/occ-import.spec.ts` — cold-cache 3D view of a board with library
  models; asserts the model fetch + `occ_service` fetch both happen and components
  render (screenshot). Fixtures come from the existing 3d-viewer-models board; extra
  `.step` fixtures may be fetched from the models CDN and committed under `tests/`.
- **Benchmarks** (main vs post-Stage-3; same machine, committed `BINARYEN_OPT_LEVEL`;
  fill §6):
  - **Raw sizes only** (no gzip/brotli measuring): `pcbnew.wasm` (+ `.js` glue),
    `occ_service.wasm`, `footprint_editor.wasm` (byte-dup of pcbnew).
  - **Build time**: wall-clock `./docker/build.sh pcbnew`, plus the `occ_service` build.
  - **Build RAM**: peak RSS of the post-link `wasm-opt`/`apply-asyncify.sh` steps (GNU
    time) — asyncify peaks ~8.3 GB today; release-config `wasm-opt` OOMs >64 GB; check
    whether the lean module fits release builds back under 64 GB.

## 6. Results

| Metric | main | after split |
|---|---|---|
| `pcbnew.wasm` raw | 146.7 MB (153,787,939 B) | **103.4 MB (103,378,614 B) — −29.6%** |
| `footprint_editor.wasm` raw | ~146.7 MB (byte-dup) | **103.4 MB (103,378,688 B)** |
| `kicad_editor.wasm` raw (merged, post-unification) | ~190 MB (CI, OCC-linked) | **130.0 MB (136,282,145 B)** |
| `occ_service.wasm` raw (lazy) | n/a | **57.0 MB (57,037,715 B)** (+ 0.28 MB glue) |

The `kicad_editor` row is the post-rebase state (editor-unification Part 2 merged
pcbnew+eeschema into ONE bundle): the split carries over structurally — the OCC
gates live on `pcbnew_kiface_objects` / `3d-viewer`, which is exactly what the
merged target links via `PCBNEW_KIFACE_LIBRARIES` — so the merged image is
OCC-free with no extra wiring (zero OCC type-registration strings in the shipped
wasm; positive control `occ_service.wasm` has 35).

**Clean-KiCad build benchmark** (2026-07-02, same machine, sequential/idle,
`--clean-kicad`, deps + ccache warm on both sides; container mem sampled at 5 s):

| Stage | old `pcbnew` (main) | new `pcbnew` | `occ_service` |
|---|---|---|---|
| kicad-configure | 131 s | 28 s | 32 s |
| kicad-compile + link | 160 s | 37 s | 110 s (incl. in-container `-Oz` DCE + finalize) |
| finalize (host) | 5 s | 3 s | — |
| post-link stage (hoist + `--asyncify` + `wasm-opt -O1`, host) | **106 s** | **55 s (−48%)** | — (`ASYNCIFY=0`) |
| **total wall** | **449.7 s** | **185.7 s** | **159.2 s** |
| host peak RSS (post-processing) | **10.28 GiB** | **6.74 GiB (−35%)** | 0.05 GiB |
| container mem peak (compile/link) | 8.87 GiB | 6.01 GiB | 6.81 GiB |

**The race: old `pcbnew` 449.7 s vs new `pcbnew` + `occ_service` 344.9 s (−23%)** —
and the two new-side builds are independent (parallelizable in CI). Caveats: the
worktree container's ccache was hotter (it had compiled these sources several times
that day), which flatters the new side's configure/compile numbers; the post-link
stage and RSS numbers are input-size-driven and ccache-independent — those are the
structural wins. Per-pass wasm-opt splits only appear on Linux (GNU `time -v`); on
macOS the post-link stage is timed as one unit.

OCC symbol check: zero `libTK*`/`StepAP214`/`BRepBuilderAPI` strings in the
shipped `pcbnew.wasm`; the asyncify removelist's OCC patterns now warn
"non-matching" (nothing left to match).

Node unit (2026-07-02): `occExport` → valid `ISO-10303-21` STEP (60,628 B) in
274 ms incl. per-model desktop-parity warn+skip reporting; `occLoadModel`
round-trips that STEP into a 199,971 B scenegraph cache in 124 ms; boot 146 ms.

E2e (2026-07-02, final binaries, ALL apps built): **full suite 138 passed / 6
skipped / 0 failed / 0 flaky** — every kicad spec × Firefox+Chromium, including
`occ-export` (lazy-fetch boundary + dialog-driven STEP download), `occ-probe`,
`3d-viewer-models` (hard `oce Load ok` worker-parse assertion + render), and
`3d-viewer-deadlock`. Chromium probe exports the demo board in 1.3 s.

Standalone + demo app (2026-07-02, live dev servers, headless Chromium): the
real web provider passes end to end in both modes. Plain dev — full dialog
click-through (File → Export → STEP dialog → Export) fetches
`occ_service.{js,wasm}` only on the Export click and lands a browser download
`export.step` (60,628 B, `ISO-10303-21`), byte-identical to the Node unit;
`loadModel` parses a 700,618 B STEP into a 569,097 B scenegraph cache in 2.1 s
including worker boot. Demo mode (`dev-demo.mjs`, CDN libs + models): the demo
board's `.wrl` models resolve through the still-static VRML plugin and
`occ_service` is correctly never fetched — the lazy boundary holds for
VRML-only boards. (The cold-cache "Failed to retrieve file times" modal that
demo mode pops while models download is the 3D-models pipeline's
stat-before-ensure behavior — reproduced identically on a main checkout with
OCC-linked pcbnew, i.e. independent of this split.)

**Validated against desktop kicad-cli 10.0.4 (2026-07-03, user's install; neutral
referee = occt-import-js tessellating both files):** geometric **exact equality**
— identical mesh/triangle counts, bbox Δ = 0.00 µm, volume Δ = 0.0000% — across
3 boards (demo / pic_programmer / openair body-only) and option sweeps (copper
stack, silk+mask, components-on skip-parity), for STEP, GLB, STL, BREP and
STPZ; PLY/XAO structurally identical (sizes within dozens of bytes); U3D
same-size/same-structure with only quantizer float-LSB byte differences
(deterministic on both sides; its input tessellation is proven identical by the
STL result); 3D-PDF structurally equal (0.02% size delta = embedded
timestamps). Desktop runs OCC 7.9 vs our wasm OCC 7.8 — equality across
*different* OCC versions. Our worker was also faster per export than the CLI.
The comparison surfaced exactly one gap — the GLB writer flag, §7 — now fixed
and guarded by occ-probe's 9-format matrix (step/stpz/brep/xao/ply/stl/glb/u3d/
pdf, magic + size asserted through the real worker).

Post-unification rerun (2026-07-02, after rebasing onto editor-unification
Part 2 — the four editors now ship as the ONE merged `kicad_editor` bundle):
full kicad suite **74 passed / 3 skipped / 0 failed / 0 flaky on Firefox
(2.3 m) AND Chromium (12.2 m)** — including `occ-export`/`occ-probe`,
`3d-viewer-models` (STEP parse through the worker) and `xface-probe` (the
cross-face path that motivated installing the occ provider whenever the
`kicad_editor` bundle boots, not just for the PCB tools). Standalone reruns on
the live dev server: dialog click-through → lazy `occ_service` fetch → browser
download `export.step` (60,628 B, `ISO-10303-21`, byte-identical to the Node
unit); `loadModel` 700,618 B STEP → 569,097 B cache in 1.6 s incl. worker boot.

---

## 7. Risks / notes

- **OCC writer toolkits (RESOLVED 2026-07-03)**: the toolkits were all built, but
  OCC's glTF/GLB writer compiles itself out without RapidJSON
  (`-DUSE_RAPIDJSON=OFF` → runtime "glTF writer is unavailable
  [HAVE_RAPIDJSON undefined]") — found by the kicad-cli comparison, invisible to
  the then-STEP-only e2e. Fixed by building OCC against the same RapidJSON
  official KiCad uses (kicad's `vcpkg.json` pulls opencascade's `rapidjson`
  feature): the vcpkg-pinned **master snapshot 2025-02-26**
  (`24b5e7a8b27f42fa16b96fc70aade9106cf7102f`). RapidJSON's latest release tag
  (v1.1.0, 2016) is ill-formed under modern clang (`GenericStringRef::operator=`
  assigns const members — upstream issue #2347) and is not what any current
  KiCad build consumes. Regression net: occ-probe's 9-format matrix.
- **DCE efficacy**: if link-time `-Oz` leaves the service fat, use the
  `$<TARGET_OBJECTS>`→STATIC-archive fallback (§4 Stage 1). Measure first.
- **Import parity**: `SCENEGRAPH` must survive `WriteCache`→`ReadCache` byte-exactly
  enough for identical renders — it's KiCad's own on-disk cache format, used for exactly
  this purpose; screenshot gate confirms.
- **Malformed STEP**: OCCT throws `Standard_Failure` inside the worker; `occLoadModel`
  catches and returns empty → the existing per-model skip behavior (the registry's
  exception barrier stays as a second net).
- **Threading (RESOLVED — two load-bearing pieces)**: the service needs the **2N+8
  pre-warmed pthread pool** (inherited from `build-kicad-target.sh`'s
  `PTHREAD_POOL_EXPR`, the raytrace-deadlock fix `7630c7e`) AND the
  `GetKiCadThreadPool()` warm-up in its `main()`. Confirmed by a `PTHREADS_DEBUG` trace:
  during export the KiCad pool consumes N workers, then OCC spawns its own wave (a
  launcher + N/2 workers) from a blocked context — a browser cannot create Workers on
  demand for a blocked thread, so with only N pre-warmed workers Chromium hangs forever
  inside `EXPORTER_STEP` (Firefox and Node happened to tolerate it; Chromium e2e caught
  it). Don't shrink the pool.
- **Headless bootstrap** in the worker (SETTINGS_MANAGER/locale/ADVANCED_CFG) mirrors
  `sym_convert` + the scripting-helpers pattern; budget for pcbnew-specific singletons.
- **Asyncify-EH caveat**: don't rely on RAII/try-catch cleanup on the pcbnew side
  *across* the suspend (`asyncify-eh-unwind-landing-pads-unreliable`); the happy path is
  proven by clipboard/fonts/`pcbjam_fp`/`EnsureModelFile`.
- **Shadow ↔ header fidelity**: the shadows must track `exporter_step.h` and the
  `oce3d_*` surface across KiCad rebases; drift surfaces as link errors (the good
  failure mode).
- **Coordination**: the import path relocates where `oce3d_Load` executes — same code,
  worker address space; owner of the 3D-models feature should know.
- **Deploy**: the live R2 wasm manifest carries no `occ_service` entry, so
  manifest-mode runs (`dev-demo --wasm r2`, the deployed demo) fail occ requests
  with `no WASM version for "occ_service"` until the next publish
  (`publish-wasm.mjs` already lists the tool and its no-shared-files layout);
  the split editor build must ship together with its `occ_service` folder.
- IGES **export** is behind `#ifdef SUPPORTS_IGES` (`step_pcb_model.h:250`), not in the
  dialog — out of scope. (IGES **import** works through `oce3d_Load` like STEP.)

---

## 8. Follow-ons (out of scope for v1)

- **Full component embedding in exports**: stage referenced model files into the worker
  (they're fetchable now via the models CDN pipeline) instead of warn+skip.
- **VRML in numbers**: if legacy `.wrl` project files turn out rare, `s3d_plugin_vrml`
  could also move to the service; if common, it stays (it's small and OCC-free).
- **`AddPadShape` command-stream refactor** (`step_pcb_model.h:105`): would shrink the
  service by dropping the board-model/parser duplication; touches KiCad core → deferred.
- **Other pull-out candidates** (bundle-size research, ranked): GAL bitmap font atlas
  ~3.0 MiB + newstroke font ~2.2 MiB (externalize as fetched assets — best
  value-per-effort after OCC); resident foreign importers (extend the existing
  `NOT EMSCRIPTEN` gate); protobuf looks dead but is load-bearing via
  `EDA_ITEM : SERIALIZABLE` — trap, skip.

---

## Sources

- External: [andymai/occt-wasm](https://github.com/andymai/occt-wasm) ·
  [kovacsv/occt-import-js](https://github.com/kovacsv/occt-import-js) ·
  [donalffons/opencascade.js](https://github.com/donalffons/opencascade.js).
- Dynamic-linking RED analysis + bundle composition: `docs/features/perf/bundle-size.md`
  (bundle-size branch; emscripten #13049, #17078, #19034, #19848, #22285).
- Import path: `3d-viewer/3d_cache/{pcbjam_static_3d_plugins,pcbjam_model_fetch,3d_cache}.cpp`,
  `plugins/3d/{oce,vrml}/CMakeLists.txt`, `plugins/3d/oce/loadmodel.cpp`,
  `web/standalone/src/wasm/libs/models-{source,bridge}.ts`,
  `tests/kicad/3d-viewer-models.spec.ts`, `plugins/3dapi/ifsg_api.h` (Write/ReadCache).
- Export path: `pcbnew/dialogs/dialog_export_step.cpp:548-708`,
  `pcbnew_jobs_handler.cpp:532-656`, `common/jobs/job_export_pcb_3d.cpp:94-149`,
  `pcbnew/exporters/step/*`.
- Build template: `eeschema/CMakeLists.txt:796-830`, `wasm/cli/sym_convert_main.cpp`,
  `scripts/kicad/build-kicad-target.sh`, `docker/build.sh`. Headless load:
  `pcbnew/python/scripting/pcbnew_scripting_helpers.cpp:96-235`.
- Web plumbing: `web/standalone/src/wasm/{boot.ts,wasm-assets.ts,libs/source.ts}`,
  `web/standalone/src/lib/download.ts:6`, `site/public/gerber-demo/boot.js`.
