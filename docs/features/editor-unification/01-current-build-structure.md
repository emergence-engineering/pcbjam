# 01 — Current build structure (the as-built baseline)

> What we compile today and why two pairs of apps are duplicates. Evidence from
> `docker/build.sh`, `scripts/kicad/build-kicad-target.sh`, the per-app `CMakeLists.txt`,
> and the on-disk artifact sizes. Read [`02-kiface-architecture.md`](02-kiface-architecture.md)
> for *why* this duplication is avoidable.

## The 7 apps

`docker/build.sh` is the orchestrator. Valid apps (`docker/build.sh:69`):

```
pcbnew | eeschema | calculator | pl_editor | symbol_editor | footprint_editor | gerbview | sym_convert | all
```

`all` (`docker/build.sh:95`) expands to the 7 GUI tools (everything above except `sym_convert`,
which is a headless node CLI `.lib → .kicad_sym` converter, not an editor). Each app dispatches
to `scripts/kicad/build-<app>.sh`, a thin wrapper around
`scripts/kicad/build-kicad-target.sh <app>`, whose `case` (`build-kicad-target.sh:46-79`) maps
each app to a CMake target, a source subdir, and — crucially — a `FRAME_T`:

| app | CMake target | subdir | `TOP_FRAME` (the baked-in frame) |
|---|---|---|---|
| `pcbnew` | `pcbnew` | `pcbnew` | `FRAME_PCB_EDITOR` (board editor) |
| `footprint_editor` | `footprint_editor` | `pcbnew` | `FRAME_FOOTPRINT_EDITOR` |
| `eeschema` | `eeschema` | `eeschema` | `FRAME_SCH` (schematic editor) |
| `symbol_editor` | `symbol_editor` | `eeschema` | `FRAME_SCH_SYMBOL_EDITOR` |
| `gerbview` | `gerbview` | `gerbview` | `FRAME_GERBER` |
| `pl_editor` | `pl_editor` | `pagelayout_editor` | `FRAME_PL_EDITOR` |
| `calculator` | `pcb_calculator` | `pcb_calculator` | (standalone, `OUTPUT_NAME=calculator`) |

Note that `footprint_editor`'s subdir is `pcbnew` and `symbol_editor`'s is `eeschema` — because
they are *part of those modules*, not separate codebases.

## The two duplicate pairs

### PCB side: `pcbnew` and `footprint_editor` are one kiface, two launchers

The pcbnew module compiles **once** into an object library `pcbnew_kiface_objects`
(`kicad/pcbnew/CMakeLists.txt:831`) that already contains **both** frame implementations:

- `pcb_edit_frame.cpp` (the board editor, `PCB_EDIT_FRAME`)
- `footprint_edit_frame.cpp` (the footprint editor, `FOOTPRINT_EDIT_FRAME`)
- plus their shared bases `pcb_base_edit_frame.cpp` / `pcb_base_frame.cpp`, and the footprint
  viewer / chooser / wizard frames.

The `footprint_editor` executable is added in a WASM-only block
(`kicad/pcbnew/CMakeLists.txt:982-1018`) whose own comment says it plainly:

> *"The footprint editor (FRAME_FOOTPRINT_EDITOR) is served by the pcbnew kiface and its
> sources are already compiled into the pcbnew kiface objects, so we only need a second
> single_top launcher that opens that frame instead of FRAME_PCB_EDITOR. Mirrors eeschema's
> symbol_editor target."* (`kicad/pcbnew/CMakeLists.txt:983-990`)

It links the **same** `${PCBNEW_KIFACE_LIBRARIES}` as `pcbnew` and differs only in the launcher
define: `TOP_FRAME=FRAME_FOOTPRINT_EDITOR` (`:1001`) vs the board editor's
`TOP_FRAME=FRAME_PCB_EDITOR` (`:807`/`:813`). The build script reflects the sharing — the
footprint editor reuses pcbnew's embind and stubs: `EMBIND_APP="pcbnew"`, `STUB_APP="pcbnew"`
(`build-kicad-target.sh:88`, `:100`).

### Schematic side: `eeschema` and `symbol_editor`, identically

`EESCHEMA_LIBEDIT_SRCS` (`kicad/eeschema/CMakeLists.txt:367-378` — the `symbol_editor/*.cpp`)
folds into `eeschema_kiface_objects` (`:656`). The `symbol_editor` executable
(`kicad/eeschema/CMakeLists.txt:758-788`) is a second `single_top` launcher linking the same
`${EESCHEMA_KIFACE_LIBRARIES}` with `TOP_FRAME=FRAME_SCH_SYMBOL_EDITOR;PGM_DATA_FILE_EXT="kicad_sym"`
(`:778`) vs eeschema's `TOP_FRAME=FRAME_SCH` (`:636`/`:641`). (Symbol carries one *extra*
define beyond the frame — the data-file extension — which Part 1 must also make runtime;
footprint has no such extra.) See [`../symbol-editor/0001-symbol-editor-port.md`](../symbol-editor/0001-symbol-editor-port.md).

### The smoking gun: artifact sizes

A full build populates `output/` (sizes from the current tree):

| artifact | size | editor |
|---|---|---|
| `pcbnew.wasm` | **146 MB** | board editor |
| `footprint_editor.wasm` | **146 MB** | footprint editor |
| `eeschema.wasm` | **82 MB** | schematic editor |
| `symbol_editor.wasm` | **82 MB** | symbol editor |
| `gerbview.wasm` | 42 MB | gerber viewer |
| `pl_editor.wasm` | 44 MB | drawing-sheet editor |
| `calculator.wasm` | 30 MB | PCB calculator |

`146 == 146` and `82 == 82` is the whole story: we are not building four independent
codebases, we are linking **two** kifaces into **four** launchers. Debug builds additionally
emit `<tool>.wasm.debug.wasm` DWARF sidecars (~1.6 GB each for pcbnew/footprint). Shared
runtime files (`wx.js`, `wx-dom.js`, `images.tar.gz`) are copied alongside
(`docker/build.sh:236-240`).

## How the editor is selected: build time, not runtime

The frame is fixed per-binary at compile time. The universal launcher
`kicad/common/single_top.cpp` opens whatever `TOP_FRAME` names (`:418-420`):

```cpp
// "TOP_FRAME" is a macro that is passed on compiler command line from CMake,
// and is one of the types in FRAME_T.
KIWAY_PLAYER* frame = Kiway.Player( TOP_FRAME, true );
```

`TOP_FRAME` is a per-target CMake `COMPILE_DEFINITIONS` entry (`-DTOP_FRAME=FRAME_xxx`). The
same `single_top.cpp` source is compiled once per app; the footprint/symbol launchers
`configure_file`-copy it to a private TU so each can carry its own `TOP_FRAME`.

**The JS side picks an editor purely by which `.wasm`/`.js` bundle it loads — no frame type is
ever passed in.** The routing tables:

- `web/pcbjam-shared/src/schemas.ts:4-12` — the canonical `TOOLS` enum (the 7 tools).
- `web/pcbjam-shared/src/schemas.ts:28-32` — `EXTENSION_TOOL` (`.kicad_pcb`→`pcbnew`,
  `.kicad_sch`→`eeschema`, `.kicad_wks`→`pl_editor`).
- `web/pcbjam-shared/src/schemas.ts:39-42` — `LIB_EXTENSION_TOOL` (`.kicad_sym`→`symbol_editor`,
  `.kicad_mod`→`footprint_editor`); `routes.ts:60` routes a footprint/symbol lib to its tool.
- `web/standalone/src/wasm/constants.ts:27-35` — `TOOL_ARGV0` sets `Module.thisProgram =
  /usr/bin/<tool>` per tool (this is argv[0] for the WASM's DEBUG/identity check, **not** a
  frame selector).
- `web/standalone/src/wasm/wasm-assets.ts` / `components/WasmTool.tsx` — resolve the chosen
  tool to its CDN bundle (`wasm/<tool>/<ver>/`) and boot it.
- `scripts/deploy/publish-wasm.mjs:33-41` — publishes each of the 7 as a separate
  `wasm/<tool>/<ver>/<tool>.{wasm,js}`.

So: **JS chooses the editor by loading a different wasm module; the module itself can only ever
open its one baked-in frame.** That is precisely the constraint Part 1 removes.

## Loose ends found

- `wasm/bindings/symbol_editor_embind.cpp` and `wasm/bindings/footprint_editor_embind.cpp`
  exist but are **unused** — the build forces `EMBIND_APP=eeschema`/`pcbnew` for those two
  (`build-kicad-target.sh:86-93`), and nothing references the files. Vestigial; no per-app
  embind divergence to reconcile when merging.
- All 7 GUI tools are exercised by `tests/web/tools-open.spec.ts:28-34` (boots each, asserts
  title + painted canvas + no abort). The footprint editor has no dedicated `tests/kicad/*.spec.ts`
  but is covered by the web suite (`tests/web/footprint-*-remote.spec.ts`) and `tools-open`.
