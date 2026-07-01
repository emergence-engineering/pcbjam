# 03 — Part 1: pair each editor with its own library editor

> **Verdict: small, free win. Recommended.** Collapse `pcbnew` + `footprint_editor` into one
> build, and `eeschema` + `symbol_editor` into one build, selecting the frame at runtime.
> Prereqs: [`02-kiface-architecture.md`](02-kiface-architecture.md).

## Why it's trivial

The pair is already one kiface (see [`01`](01-current-build-structure.md)). Concretely, three
facts mean the editor selection is *already* a runtime decision that we merely refuse to expose:

1. The kiface's `CreateKiWindow` already has **both** frame arms —
   `case FRAME_PCB_EDITOR:` and `case FRAME_FOOTPRINT_EDITOR:` (`kicad/pcbnew/pcbnew.cpp:259,277`);
   `case FRAME_SCH:` and `case FRAME_SCH_SYMBOL_EDITOR:` (`kicad/eeschema/eeschema.cpp:193,209`).
2. `KifaceType()` maps **both** frames in a pair to the **same** face
   (`FRAME_PCB_EDITOR` & `FRAME_FOOTPRINT_EDITOR` → `FACE_PCB`;
   `FRAME_SCH` & `FRAME_SCH_SYMBOL_EDITOR` → `FACE_SCH`; `kicad/common/kiway.cpp:399-405`). So the
   `set_kiface()` registration the launcher already does (`single_top.cpp:396`) covers both
   frames of the pair *regardless* of which `TOP_FRAME` it was built with.
3. The only build-time pin that actually differs in behavior is `Kiway.Player( TOP_FRAME, true )`
   at `common/single_top.cpp:420`.

So the entire gap between "two builds" and "one build, runtime flag" is the single integer at
`single_top.cpp:420`.

## The minimal change

### C++ (one launcher, runtime frame)

Make the WASM launcher read the desired frame at runtime instead of from `TOP_FRAME`. The
cleanest approach **reuses the upstream pattern already in the tree** —
`kicad/kicad.cpp:130-164` parses a `--frame=<name>` option into a `FRAME_T`. Mirror that in the
WASM `single_top` path:

- Keep `TOP_FRAME` as the *default* (so nothing regresses if no flag is passed).
- If a runtime frame is supplied (via `Module.arguments`/argv `--frame=fpedit`, or a small embind
  setter the JS calls before boot), use it for the `Kiway.Player(...)` call at `:420`.
- `set_kiface()` at `:396` can stay as-is — both frames in a pair share the face, so registering
  `FACE_PCB` (or `FACE_SCH`) once is correct either way.

The C++ delta is essentially: parse one optional argument, and swap one variable into one call.
No frame classes, no kiface, no dispatch logic changes.

### Build (drop the duplicate targets)

- Remove the `footprint_editor` executable block (`kicad/pcbnew/CMakeLists.txt:982-1018`) and the
  `symbol_editor` block (`kicad/eeschema/CMakeLists.txt:758-788`).
- Remove `footprint_editor` / `symbol_editor` from `docker/build.sh:69,95` and the
  `build-kicad-target.sh:46-79` `case`.
- Fold `symbol_editor`'s extra `PGM_DATA_FILE_EXT="kicad_sym"` define into runtime — derive the
  library extension from the frame type (symbol → `kicad_sym`, footprint → `kicad_mod`) rather
  than baking it. (Footprint had no extra define.)

### JS routing (load the parent bundle + pass the frame)

Today JS picks an editor by loading a different bundle; after Part 1 it loads the **parent**
bundle and passes the frame flag:

- `web/pcbjam-shared/src/schemas.ts:39-42` (`LIB_EXTENSION_TOOL`) — `.kicad_mod` → load
  `pcbnew` with `FRAME_FOOTPRINT_EDITOR`; `.kicad_sym` → load `eeschema` with
  `FRAME_SCH_SYMBOL_EDITOR`. (`.kicad_pcb`/`.kicad_sch` keep their current
  `FRAME_PCB_EDITOR`/`FRAME_SCH` defaults.)
- `web/pcbjam-shared/src/routes.ts:60`, `web/standalone/src/wasm/constants.ts:27-35`
  (`TOOL_ARGV0`), `web/standalone/src/wasm/wasm-assets.ts`,
  `web/standalone/src/components/WasmTool.tsx` — collapse the two lib tools onto their parent
  bundle and thread the frame value into boot.
- `scripts/deploy/publish-wasm.mjs:33-41` — drop `footprint_editor`/`symbol_editor` from the
  publish list.

### Tests

- `tests/web/tools-open.spec.ts:28-34` and the per-editor specs keep exercising all the *views*;
  they now boot the parent bundle with a frame argument instead of a separate `.wasm`. The
  footprint/symbol launch-scope coverage stays — it just routes through the merged build.

## Why it costs nothing to download

This is the decisive point. `footprint_editor.wasm` is **already** a complete copy of the pcbnew
kiface (it contains `PCB_EDIT_FRAME` *and* `FOOTPRINT_EDIT_FRAME` and all the shared board
machinery — that's why it's the same 146 MB as `pcbnew.wasm`). A user who opens the footprint
editor today *already downloads the whole pcbnew engine*. Merging changes nothing they download —
it deletes the redundant second artifact.

## Cost / benefit

| | |
|---|---|
| **Effort** | Small. C++ ≈ "parse one optional `--frame`, swap it into `single_top.cpp:420`"; the rest is JS routing + deleting two build/deploy/test targets. No architecture change. |
| **Download impact** | **None.** The dup bundle is already a full copy of its twin. |
| **Removes** | 228 MB of duplicated deployed WASM (146 + 82), the ~1.6 GB-each debug DWARF sidecars for the footprint twin, and 2 build + 2 deploy + duplicate test targets → faster CI and less R2 storage. |
| **Risk** | Low. The runtime path it relies on (`Kiway.Player(frameType)`) is the same one the build uses today; we're only choosing the argument later. |

## Caveats (small, known)

- **argv0 / `thisProgram`.** Today `footprint_editor`/`symbol_editor` set
  `thisProgram=/usr/bin/<tool>` (`constants.ts:27-35`); after merge both modes report the parent
  (`pcbnew`/`eeschema`). `thisProgram` feeds KiCad's DEBUG/app-identity and single-instance
  checks — verify nothing keys on the old name. Low risk (the board/footprint editors share one
  app identity natively too).
- **Per-app settings.** KiCad keys some config by app; the footprint/symbol editors already store
  their settings under their parent module natively, so this should be a non-issue — confirm no
  WASM-specific config path assumes the separate binary name.
- **The data-file extension** (`PGM_DATA_FILE_EXT`) must move from a symbol-only compile define to
  a runtime value derived from the frame. Mechanical.

## Relationship to Part 2

Part 1 builds exactly the runtime-frame plumbing (a launcher that reads `FRAME_T` at runtime
instead of from `TOP_FRAME`) that [Part 2](04-part2-single-app-merge.md) reuses. Doing Part 1
first is the natural first step whether or not Part 2 ever happens.
