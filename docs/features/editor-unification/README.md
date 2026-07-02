# Editor build unification — one WASM build per kiface + a runtime frame flag

> **Status: Part 1 AND Part 2 IMPLEMENTED (2026-07-02) — see
> [`05-part1-implementation.md`](05-part1-implementation.md) and
> [`06-part2-implementation.md`](06-part2-implementation.md). All four editors are now
> runtime `--frame` choices of the ONE merged `kicad_editor` bundle.** Originally
> authored 2026-06-30 as a research / decision record from a 5-agent read of the KiCad
> source (`kicad/` submodule) and our WASM build. The question:
> several of our 7 WASM "apps" are the *same compiled code* differing only by a build-time
> constant — can we collapse them to one build that picks the editor at runtime?
> Companion to [`../symbol-editor/`](../symbol-editor/) (which established the
> second-launcher pattern this doc proposes to retire) and
> [`../perf/README.md`](../perf/README.md) (the size context).

## Why this exists

We ship **7 separate WASM apps** (`pcbnew`, `footprint_editor`, `eeschema`, `symbol_editor`,
`gerbview`, `pl_editor`, `calculator`). Two pairs of them are byte-for-byte near-duplicates:

| artifact | size | what it is | differs from its twin by |
|---|---|---|---|
| `pcbnew.wasm` | **146 MB** | board editor | — |
| `footprint_editor.wasm` | **146 MB** | footprint editor | **one** compile macro (`TOP_FRAME`) |
| `eeschema.wasm` | **82 MB** | schematic editor | — |
| `symbol_editor.wasm` | **82 MB** | symbol editor | **one** compile macro (`TOP_FRAME`) |
| `gerbview` / `pl_editor` / `calculator` | 42 / 44 / 30 MB | separate engines | (genuinely different code) |

The Footprint Editor is not a separate program — it is a *frame* compiled **inside** the
pcbnew module; the Symbol Editor is a frame inside eeschema. KiCad already selects which
editor a module opens **at runtime**, by passing a `FRAME_T` enum value to a single factory
(`KIFACE::CreateKiWindow`). The *only* thing we pin at build time is which frame the launcher
opens (`TOP_FRAME` in `common/single_top.cpp:420`). So `footprint_editor.wasm` is a complete
copy of the pcbnew engine with one integer changed.

This dossier evaluates two changes the user proposed:

1. **Part 1 — pair each editor with its own library editor** (PCB Editor + Footprint Editor →
   one build; Schematic Editor + Symbol Editor → one build), selecting the frame at runtime.
2. **Part 2 — fuse all four editors** (really the *two* engines, pcbnew + eeschema) into one
   app with a runtime flag to switch views.

## TL;DR / decision

- **Part 1 — DONE ✅** (implemented + validated end-to-end, incl. the real web app; see
  [`05-part1-implementation.md`](05-part1-implementation.md)). A small, free win, as predicted.
  The pair is *already one kiface*; the kiface's
  `CreateKiWindow` already has both frame arms, and `KifaceType()` maps both frames to the
  same face — so the single registered kiface already serves both. The only blocker is the
  baked-in `TOP_FRAME` at `common/single_top.cpp:420`. Make that a runtime input (mirror the
  upstream `--frame` parser in `kicad/kicad.cpp:130-164`) and the duplicate build disappears.
  **Zero download penalty** (the dup bundle is already a full copy of its twin). Removes
  **228 MB** of duplicated WASM, their ~1.6 GB-each debug DWARF sidecars, and 2
  build/deploy/test targets. See [`03-part1-library-editor-unification.md`](03-part1-library-editor-unification.md).
- **Part 2 is feasible and well-bounded, but moderate — and a product call, not a dedup
  win.** Two engines in one image is *new ground* (no template — the upstream project manager
  that does this natively isn't built for WASM, and the WASM `KIWAY` asserts exactly one
  kiface). The collision surface is small and concentrated: the load-bearing item is the
  global `Kiface()` accessor (two definitions, ~97 call sites incl. shared `common/` code),
  which must become a runtime dispatch on the active editor. The `KIFACE_GETTER` symbol clash
  everyone fears first is trivial. The real cost is **size**: a merged binary is ~180–190 MB
  that *every* user downloads, which fights our per-tool lazy loading. See
  [`04-part2-single-app-merge.md`](04-part2-single-app-merge.md).
- **They are not either/or.** Part 1 builds the runtime-frame mechanism that Part 2 reuses,
  so Part 1 is the natural first step regardless. Ship Part 1 now; gate Part 2 on whether the
  product wants a unified, project-based "KiCad in the browser" (cross-probing schematic↔PCB).
- **Do _not_ build the user's literally-crossed pairing** (PCB + Symbol, or Schematic +
  Footprint). Those don't share code, so each bundle would link *both* engines — all of
  Part 2's cost with none of Part 1's sharing benefit.

## Document index

| File | Contents |
|---|---|
| [`01-current-build-structure.md`](01-current-build-structure.md) | What we build today: the 7 apps, the two duplicate pairs (with sizes), the build-time `TOP_FRAME` selection, and how JS picks an editor by loading a different bundle. The as-built baseline, with evidence. |
| [`02-kiface-architecture.md`](02-kiface-architecture.md) | Primer on KiCad's kiway / kiface / `FRAME_T` / `single_top` system — the upstream mechanism that already selects editors at runtime. The "one module, many frames, chosen by a runtime parameter" contract. |
| [`03-part1-library-editor-unification.md`](03-part1-library-editor-unification.md) | **Part 1.** Pair each editor with its own library editor. Why it's trivial, the exact minimal change, why it costs nothing to download, the cost/benefit, and the caveats. |
| [`04-part2-single-app-merge.md`](04-part2-single-app-merge.md) | **Part 2.** Fuse the engines into one app. The full symbol-collision surface (`Kiface()` is the real work; the getter is trivial), the size tradeoff, when it's worth it, and extending to all 7 tools. |
| [`05-part1-implementation.md`](05-part1-implementation.md) | **Part 1 — as-built (implemented).** The implementation record: exactly what changed (C++ / build / frontend / tests), how the runtime `--frame` mechanism works, corrections to the research (argv *is* delivered; `PGM_DATA_FILE_EXT` on all four), validation (harness + regression + real web app + demo), and the current git/build state. |
| [`06-part2-implementation.md`](06-part2-implementation.md) | **Part 2 — as-built (implemented).** The merged `kicad_editor` image: the per-engine `Kiface`/getter binding, the 21-symbol ODR audit the research missed (+ the repeatable audit script), the embind split/dispatcher, build/frontend/test wiring, validation results, and the one known pre-existing 3d-viewer failure (fixed on main). |

## Relationship to other feature docs

- [`../symbol-editor/0001-symbol-editor-port.md`](../symbol-editor/0001-symbol-editor-port.md)
  — established the "second `single_top` launcher, same kiface, different `TOP_FRAME`" pattern
  for `symbol_editor`. Part 1 generalizes that to a *runtime* `TOP_FRAME` and retires the
  separate launcher entirely.
- [`../perf/README.md`](../perf/README.md) — the size context. Part 1's dedup is orthogonal to
  the size levers there (it removes *duplicate artifacts*, not per-binary bloat); Part 2's
  size *cost* must be weighed against them (`wasm-split`/dlopen are already a dead end there,
  which is why a merged binary can't be lazily sub-loaded).
- Build entry points: `docker/build.sh`, `scripts/kicad/build-kicad-target.sh`.
- Launcher / dispatch: `kicad/common/single_top.cpp`, `kicad/common/kiway.cpp`,
  `kicad/pcbnew/pcbnew.cpp`, `kicad/eeschema/eeschema.cpp`, `kicad/include/frame_type.h`.
