# 09 — Re-enable the symbol chooser & viewer

> **The chooser and viewer aren't broken — the browser FS just ships no libraries.** The
> `#ifdef __EMSCRIPTEN__ return nullptr` gates in `eeschema.cpp` are *asset-availability*
> gates, not code gates. Un-gating is ~10 lines deleted; the real work is a small library-
> provisioning pipeline in the `web/` layer (no upstream footprint).

## What's actually gated

`eeschema/eeschema.cpp` returns `nullptr` for `FRAME_SCH_VIEWER` ("symbol viewer is not
supported") and `FRAME_SYMBOL_CHOOSER` (comment: "no bundled libs"). Both frames' sources
**are compiled** (`eeschema/CMakeLists.txt`). Callers currently hitting the nullptr:
`dialog_change_symbols.cpp`, `grid_text_button_helpers.cpp` (symbol-browse buttons silently
no-op), `sch_edit_frame.cpp`.

## Evidence the frames work

- `features/yjs-bridge/0007-eeschema-essential-ops-findings.md` records the in-process symbol
  **chooser dialog already opening and working** in wasm ("symbol chooser now center with OK
  reachable") — it just shows "0 items loaded" because `/usr/share/kicad/symbols` is absent.
- Every UI dependency is proven working in wxUniv-wasm (`tests/WHATWORKS.md`): the
  `wxDataViewCtrl` LIB_TREE, the `wxHtmlWindow` details pane, the GAL preview canvas. The
  **symbol editor** — same LIB_TREE + preview machinery — is already a shipped, ported target.
- pcbnew's footprint browse/choose paths are **already un-gated**; they start working the
  moment `fp-lib-table` has content.

## Why the FS is empty today

The boot path (`web/standalone/src/wasm/boot.ts`, mirrored by the test harness) ships only
`images.tar.gz` (UI bitmaps) and seeds **empty** `sym-lib-table` / `fp-lib-table` /
`design-block-lib-table`, plus `kicad_common.json` flags that suppress the first-run
StartWizard (its modal loop crashes Asyncify — see the [async dossier](../async/README.md)).
No symbol libraries, footprint libraries, 3D models, or templates are packaged. So un-gating
*alone* yields an empty tree — correct behavior, just not useful.

> Background: designs embed the parts they use, so *opening an existing file* never needed the
> libraries (see [`../libraries/0001-library-management.md`](../libraries/0001-library-management.md)).
> The chooser/viewer are about *placing new* parts — that's what needs shipped libraries.

## Recipe

1. **Un-gate** (≈ −10 lines fork diff): delete the two `#ifdef __EMSCRIPTEN__` blocks in
   `eeschema/eeschema.cpp`.
2. **Provision a starter library set** (web/wasm layer only, no upstream files):
   - Package a curated subset of `kicad-symbols` (e.g. Device, power, Connector, Switch, …)
     as an assets tarball, fetched and written into `/usr/share/kicad/symbols` in `preRun`
     (same mechanism as `images.tar.gz`). Optionally a `.pretty` footprint subset into
     `/usr/share/kicad/footprints`.
   - Write **real** `sym-lib-table` / `fp-lib-table` rows in `boot.ts` instead of the empty
     seeds.
   - For the full official set (~200 MB-class), prefer **lazy per-library fetch** into MEMFS
     on first reference rather than a giant preload — no engine obstacle, just engineering.

The repo doesn't currently vendor `kicad-symbols` (only `kicad/demos/*` and
`qa/data/libraries/power.kicad_sym`), so step 2 introduces a new asset source — decide
whether to vendor a curated subset or fetch from a CDN.

## Net

| Action | Layer | Diff impact |
|---|---|---|
| Delete viewer/chooser gates | `eeschema.cpp` | −10 lines |
| Library asset tarball + lib-table seeding | `web/standalone/` | new web assets only |
| Lazy per-lib MEMFS fetch (optional, for full set) | `web/`/`wasm/` | new code, no upstream |

Effort: gates are minutes; a usable curated-library bundle is ~1–2 days; full lazy-fetch is
incremental on top.
