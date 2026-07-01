# 05 — Part 1: implementation record & current state

> **Status: Part 1 IMPLEMENTED and validated end-to-end (2026-07-02).** This is the
> as-built companion to the [`03`](03-part1-library-editor-unification.md) plan: what
> actually changed, how the runtime mechanism works, what the research got slightly
> wrong, how it was verified, and the current git/build state. Part 2
> ([`04`](04-part2-single-app-merge.md)) remains deferred by design.

## One-paragraph summary

`footprint_editor` and `symbol_editor` are no longer separate WASM builds. The
`pcbnew` / `eeschema` bundle now opens the footprint / symbol editor at **runtime**,
selected by a `--frame=<token>` argument threaded through Emscripten's
`Module.arguments` and parsed in `kicad/common/single_top.cpp` (mirroring the upstream
`--frame` parser in `kicad/kicad.cpp`). The two duplicate build+deploy targets, their
launcher scripts, and a vestigial embind file are gone; the frontend re-points the two
library tools onto their parent bundle. Net effect: **~228 MB of duplicated deployed
WASM removed (plus their ~3 GB of debug DWARF sidecars) with zero download penalty**,
since the footprint/symbol bundle was already a full copy of its twin.

## What changed

### C++ — `kicad` submodule (kept close to upstream; all new logic `#ifdef __EMSCRIPTEN__`)

| File | Change |
|---|---|
| `common/single_top.cpp` | On the WASM path, parse `--frame=<token>` into a `FRAME_T` (tokens: `pcb`, `fpedit`, `sch`, `symedit`, `gerb`, `ds`, `calc`), defaulting to the build-time `TOP_FRAME`; open it with `Kiway.Player(topFrame, true)`. `--frame` is also added to the existing positional-file `wxCmdLineParser` desc so it's ignored there. The default data-file extension is derived from the resolved frame at runtime (`kicad_pcb`/`kicad_mod`/`kicad_sch`/`kicad_sym`) instead of the compile-time `PGM_DATA_FILE_EXT` (native still uses `PGM_DATA_FILE_EXT`). |
| `pcbnew/CMakeLists.txt` | Removed the WASM-only `footprint_editor` executable block (the pcbnew kiface already compiles `footprint_edit_frame.cpp`). |
| `eeschema/CMakeLists.txt` | Removed the WASM-only `symbol_editor` executable block. |

Native builds are byte-identical (`topFrame == TOP_FRAME` when no flag is passed; the
whole block is WASM-guarded).

### Build & deploy — root repo

- `docker/build.sh` — `all` now expands to **5** apps (`pcbnew eeschema calculator pl_editor gerbview`); `symbol_editor`/`footprint_editor` dropped from the valid-apps list, the `all` array, the arg-validation case, and `kicad_subdir_for`.
- `scripts/kicad/build-kicad-target.sh` — removed the two apps' target/subdir, `EMBIND_APP`, and `STUB_APP` case arms + usage strings.
- Deleted `scripts/kicad/build-symbol_editor.sh`, `scripts/kicad/build-footprint_editor.sh`, and the vestigial `wasm/bindings/symbol_editor_embind.cpp`.
- `scripts/deploy/publish-wasm.mjs` — publish list trimmed to the 5 real bundles.

### Frontend — `web/standalone` (the two tools stay visible in the UI; only *how they boot* changed)

- `src/wasm/constants.ts` — new `TOOL_BUNDLE` (`footprint_editor→pcbnew`, `symbol_editor→eeschema`, others→self) and `TOOL_FRAME` (`footprint_editor→"fpedit"`, `symbol_editor→"symedit"`, others→`undefined`).
- `src/wasm/wasm-assets.ts` — `resolveWasmBase` resolves the **bundle**'s CDN folder/version (the manifest only lists the 5 published bundles now).
- `src/wasm/boot.ts` — `BootOptions.frame`; computes `bundle = TOOL_BUNDLE[tool]`; fetches `<base>/<bundle>.{wasm,js}` and the pthread worker from the bundle; sets `Module.arguments = ["--frame=<token>"]`.
- `src/components/WasmTool.tsx` — passes `frame: TOOL_FRAME[tool]` into `bootKicadTool`.

### Tests

- `tests/apps/kicad/symbol_editor.html` — now loads `eeschema.js` with `Module.arguments=['--frame=symedit']` (and the stale `9.99` config-seed dir corrected to `10.0`).
- `tests/apps/kicad/footprint_editor.html` — new; loads `pcbnew.js` with `--frame=fpedit`.
- `tests/kicad/frame-runtime.spec.ts` — new; parametrized, asserts each harness lands on the **library editor** title (not its parent editor).
- `tests/playwright-kicad.config.ts` — `frame-runtime.spec.ts` added to `PCBNEW_FAMILY_SPECS`: its footprint case boots the pcbnew module, which OOMs SpiderMonkey on x86 CI, so on CI the whole file runs on the `chromium-ci` (V8) project like every other pcbnew-booting spec. Local runs unaffected.
- `tests/scripts/setup-kicad-wasm.sh` — stops copying the two removed bundles.

## How the runtime frame selection works

```
JS  boot.ts:  Module.arguments = ["--frame=fpedit"]   (in the Module literal, before the glue runs)
      │
Emscripten glue (built with -sINVOKE_RUN=0, callMain exported):
      Module["arguments"] → arguments_ → run() → callMain(args) → main(argc, argv)
      │
C++ single_top.cpp:  wxCmdLineParser(App().argc, App().argv) → "--frame=fpedit"
      → FRAME_FOOTPRINT_EDITOR → Kiway.Player(FRAME_FOOTPRINT_EDITOR)
```

The pcbnew kiface's `CreateKiWindow` already has both `FRAME_PCB_EDITOR` and
`FRAME_FOOTPRINT_EDITOR` arms (eeschema likewise for `FRAME_SCH` /
`FRAME_SCH_SYMBOL_EDITOR`), and both frames of a pair map to the **same** `FACE_T`, so
one registered kiface serves both — see [`02`](02-kiface-architecture.md). No frame,
kiface, or dispatch code changed.

## Findings that corrected the research

- **`Module.arguments` *is* delivered to `App().argv` in our wx WASM port.** This was the one real unknown (files normally open via an embind call, not argv). A temporary diagnostic confirmed `argc=2, argv[1]="--frame=symedit"` in-browser — so the argv approach works and **no `EM_ASM`/embind fallback was needed**.
- **`PGM_DATA_FILE_EXT` is set on *all four* launchers** (`kicad_pcb`/`kicad_mod`/`kicad_sch`/`kicad_sym`), not just symbol — [`03`](03-part1-library-editor-unification.md) said footprint had no extra define. The runtime extension map covers all four.
- **The `kiway.cpp` "exactly one kiface" warning is not a Part-1 blocker.** It concerns cross-*face* requests; both frames of a pair share one face, so registering one kiface serves both (exactly what `footprint_editor.wasm` did before).
- There is no `routes.ts` in `@pcbjam/shared` at the time of writing on this branch's base — extension→tool routing lives in `schemas.ts` + `WasmTool.tsx`'s `fileTool`. (A later `pcbjam-shared` bump adds `routes.ts`; see git state below.)

## Validation (all green)

Three tiers, screenshots checked at each:

1. **Runtime-frame harness** (`frame-runtime.spec.ts`, Firefox): `symbol_editor.html` → title *"… — Symbol Editor"*; `footprint_editor.html` → *"… — Footprint Editor"* — each opening the library editor, not its parent (the parent bundle's default frame would title itself "Schematic/PCB Editor").
2. **Regression** through the merged bundles: `pcbnew.spec` (drew lines on the board), `eeschema.spec` (drew wires on the schematic), `symbol_editor.spec` (canvas + toolbars + registry) — all pass, wizard-free (the corrected `10.0` config seed skips the first-run wizard).
3. **Real web app + demo project** (`tools-open.spec.ts` via `playwright-web`, frontend :3048 + reference backend :3060 serving `tests/fixtures/demo`): `pcbnew` opens `demo.kicad_pcb`, `eeschema` opens `demo.kicad_sch`, and `footprint_editor` / `symbol_editor` boot from the pcbnew / eeschema bundle via the actual React routing (`resolveWasmBase`→`TOOL_BUNDLE`, `boot`→`--frame`). **4 passed**; screenshots show the footprint layer stack and the symbol library tree + Pins filter, with the real app chrome.

## Build & git state

- **Bundles built** for validation via `main`'s warm docker cache at `-O1`: `output/pcbnew.wasm` (147 MB) and `output/eeschema.wasm` (82 MB). `gerbview`/`pl_editor`/`calculator` were **not** rebuilt — they're untouched by this change; `docker/build.sh all` produces the full 5-bundle deploy set.
- **kicad submodule** — branch `editor-unification`, HEAD `e7a27b31` (rebased onto the `wasm-port` tip `e8db3d35`): *"feat(wasm): runtime --frame launcher; drop duplicate footprint/symbol editor targets"*.
- **root** — branch `editor-unification`, one feature commit ahead of `main` (`05127af`): *"feat(wasm): unify editor builds — footprint/symbol editors via runtime --frame"* — includes this dossier and the CI spec routing; pins `kicad e7a27b31` + `pcbjam-shared 9a1a269`. Clean tree.
- **Not pushed.** Ship with `/git-feature-finish` (or a manual push of `editor-unification` in both repos).

## What's next

- **Nothing required** for Part 1 — it's complete and validated.
- **Part 2** ([`04`](04-part2-single-app-merge.md)) — fuse the pcbnew + eeschema engines into one image — remains a deferred product call (real +download cost). Part 1 built the runtime-frame plumbing Part 2 would reuse.
