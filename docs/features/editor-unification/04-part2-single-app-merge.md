# 04 — Part 2: fuse the editors into one app

> **Verdict: feasible and well-bounded, but moderate work — and a product decision, not a dedup
> win.** Merging "the four editors" means linking the **two engines** (pcbnew kiface + eeschema
> kiface) into one WASM image and picking the view at runtime. The collision surface is small
> and concentrated; the real cost is bundle size. Prereqs:
> [`02-kiface-architecture.md`](02-kiface-architecture.md), [`03`](03-part1-library-editor-unification.md).

## What "the four" actually is

Board + Footprint + Schematic + Symbol = `FACE_PCB` (pcbnew kiface) + `FACE_SCH` (eeschema
kiface) = **two engines in one static image**. Extending to all 7 GUI tools adds `FACE_GERBVIEW`,
`FACE_PL_EDITOR`, `FACE_PCB_CALCULATOR` = 5 kifaces — same mechanism, more faces.

This is fundamentally different from Part 1. Part 1 is "one engine, many frames" — already
supported, you just expose the selector. Part 2 is "many engines, one image," which has **no
existing template**: upstream gets multi-kiface only by loading DLLs at runtime, the WASM build
has no `dlopen`, the `kicad` project manager isn't built for WASM (`kicad/CMakeLists.txt:113`),
and the WASM `KIWAY` explicitly assumes exactly one kiface (`kiway.cpp:223-258`). So Part 2 is a
real porting task, not a flag flip.

## The symbol-collision surface (when two kifaces link into one image)

From most to least trouble:

### 1. `Kiface()` — the load-bearing item (moderate)

Each kiface defines a global accessor `KIFACE_BASE& Kiface()` (declared
`include/kiface_base.h:134`; defined `pcbnew.cpp:600`, `eeschema.cpp:452`,
`gerbview.cpp:152`, `pl_editor.cpp:141`, `pcb_calculator.cpp:76`). Linking two kifaces gives two
definitions of `Kiface()` — a duplicate symbol.

Worse, it is not just a name clash; it is a **semantic** one. `Kiface()` is called ~97 times
(pcbnew 48 calls / 21 files; eeschema 49 / 20 files), **including 5 files in shared `common/`**
that are compiled **once** into libkicommon and linked into every app:

- `common/eda_base_frame.cpp` (e.g. `:1274 return Kiface().KifaceSettings();`, `:1280`, `:1286`)
- `common/gestfich.cpp`
- `common/design_block_tree_model_adapter.cpp:49`
- `common/dialogs/dialog_color_picker.cpp`
- `common/tool/common_control.cpp`

That shared code calls `Kiface()` expecting "the one active editor's kiface" — but with two
kifaces linked, it can't statically know whether the active frame is PCB or schematic. So
`Kiface()` must become a **runtime dispatch on the active editor** (a "current active kiface"
pointer keyed off the active frame's `FACE_T`). It's mostly process/editor-level config —
`KifaceSettings()`, `KifaceSearch()`, `GetHelpFileName()`, `IsSingle()` — so a single dispatching
`Kiface()` backed by an active-editor pointer is feasible, but it is a behavioral change touching
~100 call sites including shared code. **This is what lifts Part 2 from "small" to "moderate."**

> ⚠️ **`--allow-multiple-definition` is not a fix here.** The static kiface link already passes
> `LINKER:--allow-multiple-definition` (see `../symbol-editor/0001-symbol-editor-port.md`). That
> would let two `Kiface()` definitions *link* — by silently taking the first — which means shared
> `common/` code would always resolve to (say) pcbnew's kiface even while the schematic editor is
> active. That is the bug, not the fix. `Kiface()` needs real per-active-editor dispatch.

### 2. `KIFACE_GETTER` / `KIFACE_1` (trivial)

Every kiface exports the same `extern "C"` getter — `KIFACE_GETTER` is a macro expanding to the
unmangled symbol `KIFACE_1` (`include/kiway.h:110-115`), defined identically in each kiface
(`pcbnew.cpp:605`, `eeschema.cpp:457`, …), all returning `&kiface`. Two in one image = duplicate
`KIFACE_1`.

Fix is mechanical: the macro is unconditional at `kiway.h:111`, so guard it with `#ifndef
KIFACE_GETTER` and pass a per-target `-DKIFACE_GETTER=<distinct>` (the same `COMPILE_DEFINITIONS`
machinery that already sets `TOP_FRAME`). The `extern "C"` declaration at `kiway.h:541/543`
follows the macro automatically. A combined launcher then declares both distinct externs and
registers each face:

```cpp
extern "C" KIFACE* pcbnew_kiface_getter(int*,int,PGM_BASE*);
extern "C" KIFACE* eeschema_kiface_getter(int*,int,PGM_BASE*);
Kiway.set_kiface( KIWAY::FACE_PCB, pcbnew_kiface_getter(&v, KIFACE_VERSION, this) );
Kiway.set_kiface( KIWAY::FACE_SCH, eeschema_kiface_getter(&v, KIFACE_VERSION, this) );
```

### 3. Relax the WASM "exactly one kiface" convention (small)

`kiway.cpp:223-258` enforces single-kiface registration by *convention*, not storage —
`set_kiface` already writes into a per-`FACE_T` array (`include/kiway.h:476-481`) and `KiFACE()`
reads per slot. Registering several faces is just calling `set_kiface` N times. Update the comment
and the single-getter assumption to match the combined launcher above.

### Non-issues (verified)

- **`Pgm()` / `program` singleton** (`common/pgm_base.cpp:1051-1058`; `single_top.cpp:137,180`)
  — there is exactly one shared instance, which is *correct* for a multi-kiface app. No collision.
- **The `static <X>::IFACE kiface(...)` instances** (`pcbnew.cpp:592`, `eeschema.cpp:445`, in named
  namespaces `PCB`/`SCH`) — file-static, internal linkage, no external symbol. No collision.
- Beyond `KIFACE_1` and `Kiface()`, the kifaces emit no other global non-member symbols at file
  scope; the lower libs (libkicommon, libgal, …) are linked once and shared. A one-shot trial
  link is the definitive duplicate-symbol audit, but the *by-design* collisions are just those two.

## The real cost: bundle size

This is the strategic consideration, and it cuts against our current delivery model.

- **Today:** 7 separate bundles, each user lazy-loads only the tool they open. Total deployed
  ≈ 572 MB raw — but massively duplicated (wx + common + boost replicated in all 7).
- **Merged:** a combined image pays for shared code **once**. A 4-editor (pcbnew + eeschema)
  binary ≈ pcbnew's 146 MB (already carries wx/common + the PCB-only OCC) + eeschema's *unique*
  code (~30–40 MB; OCC is PCB-only, wx/common/boost are shared) ≈ **~180–190 MB**. All-7 ≈
  ~200–230 MB. *(Estimates — a trial link is the only way to know precisely.)*
- **The catch:** that ~190 MB is downloaded by **every** user — even one who only wants the
  calculator. It works *against* the per-tool lazy loading we do now, and a merged binary can't
  be lazily sub-loaded: `wasm-split` / `dlopen` are already assessed as a dead end for us (see
  [`../perf/bundle-size.md`](../perf/bundle-size.md) and the bundle-composition research). So the
  tradeoff is "one shared binary, zero duplication, cross-probing possible" vs. "larger first
  load for single-tool users."

## When Part 2 is worth it

- **Worth it** if the product goal is a unified, project-based "KiCad in the browser" where a
  user has a project open and flips between schematic and PCB — and you want desktop-style
  **cross-probing** (select a component in the schematic, highlight it on the board). A combined
  image holds the board editor *and* schematic editor live under one `KIWAY`, which is exactly how
  desktop KiCad's single process works; the inter-editor `KIWAY` express messaging would light up
  for free. This is essentially porting the upstream project-manager model to one static image.
- **Not worth it** if the goal is the fastest possible first load for a single tool. Then keep
  the tools as separate lazy-loaded bundles and just take [Part 1's](03-part1-library-editor-unification.md)
  free dedup.

## Suggested sequencing if pursued

1. Ship [Part 1](03-part1-library-editor-unification.md) first (free; builds the runtime-frame
   launcher this reuses).
2. Spike a **2-kiface trial link** (pcbnew + eeschema) with the getter renamed (§2) and
   `--allow-multiple-definition` *off*, to enumerate the true duplicate-symbol set and confirm
   it's just `Kiface()`. Measure the combined size.
3. Convert `Kiface()` to active-editor dispatch (§1) — the bulk of the work; validate the shared
   `common/` call sites resolve correctly with both editors live.
4. Combined launcher registers both faces (§2/§3); JS opens any `FRAME_T` against the one bundle
   (and optionally two frames at once for cross-probing).
5. Only then consider folding in gerbview / pl_editor / calculator (3 more faces, same recipe).

## Bottom line

The engineering is bounded and the scary part (the getter) is trivial; the genuine work is one
well-understood refactor (`Kiface()` → runtime dispatch). But Part 2 trades per-tool download size
for a unified binary, so decide it on **product** grounds — do we want a single cross-probing
KiCad-in-the-browser? — not as a duplication cleanup. The duplication cleanup is
[Part 1](03-part1-library-editor-unification.md), and it's free.
