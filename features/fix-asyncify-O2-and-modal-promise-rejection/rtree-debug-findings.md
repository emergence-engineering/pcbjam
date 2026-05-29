# RTree `Classify` duplicate-index crash on PCB load (wasm-only)

## TL;DR

A debug-build pcbnew in the browser used to abort on every `.kicad_pcb` open with

```
Aborted(Assertion failed: !a_parVars->m_taken[a_index],
        at: kicad/thirdparty/rtree/geometry/rtree.h:1771, Classify)
```

Native debug builds never hit it. Root cause was a **wasm-only integer overflow** triggered by a single bad template argument in upstream KiCad:

```cpp
// kicad/libs/kimath/src/geometry/shape_poly_set.cpp:1927   ← before
RTree<intptr_t, intptr_t, 2, intptr_t> rtree;
//                            ^^^^^^^^ ELEMTYPEREAL = intptr_t
```

Every other RTree instantiation in KiCad uses `double` for the 4th template parameter (the volume/area type). This one used `intptr_t`, which on wasm32 is `int32_t` — too narrow to hold `RectSphericalVolume`'s `sumOfSquares` for typical KiCad nanometer extents (`~10⁸ per axis → ~10¹⁴ area`). On native targets `intptr_t = int64_t` happens to absorb the result, so the bug stays latent.

Fix: change `intptr_t` to `double` on that one line. After the fix, both `kicad/demos/microwave/microwave.kicad_pcb` and `kicad/demos/pic_programmer/pic_programmer.kicad_pcb` load and render cleanly through pcbnew's File → Open in the wasm debug build — see `tests/kicad/load-pcb.spec.ts` and the baselines under `tests/baseline-screenshots/load-pcb-*.png`.

---

## Investigation trail

### 1. Reproducing and isolating

The crash reproduced deterministically on every non-empty board (`microwave`, `flat_hierarchy`, `pic_programmer`). The first idea — that the bug had something to do with the file-open path itself — was disproven by the spike test at `tests/kicad/load-pcb.spec.ts`: the menu and dialog drive end-to-end, the abort fires after the file is selected and parsing has begun, well inside `PCB_IO_KICAD_SEXPR::LoadBoard()`.

The static read of `rtree.h` left two plausible mechanisms:

1. `seed0 == seed1` in `PickSeeds` because `if (waste >= worst)` never fires, which only happens if `worst` (= `-coverSplitArea - 1`) goes NaN/`-inf`. That points at integer-overflow / UB inside `RectVolume` / `RectSphericalVolume`.
2. Out-of-band corruption of `m_taken[]` — re-entrant Insert during iteration, stack/heap overrun, etc.

Neither could be decided from code alone.

### 2. Targeted instrumentation

Phase A added a temporary `KICAD_RTREE_DIAG`-gated block in `kicad/thirdparty/rtree/geometry/rtree.h` (since reverted) that, on the assertion's would-fire condition, dumped:

- the call-site tag (`PickSeeds-0` / `PickSeeds-1` / `ChoosePartition`, derived from current `m_count[]`),
- `a_index`, `a_group`, `m_total`, `m_minFill`, `m_count[]`,
- `m_taken[]`, `m_partition[]`,
- `m_coverSplitArea`, `m_area[0..1]`,
- every branch's `m_min/m_max/span` per dimension,

and `return`-ed without aborting. Wired up via `./docker/build.sh --diag rtree` (gated through the existing `--diag=<flags>` plumbing in `scripts/kicad/build-pcbnew.sh`).

### 3. The dump that nailed it

Two consecutive runs from the diagnostic build (excerpt — first run shown):

```
[RTREE-DIAG] Classify duplicate src=PickSeeds-1 idx=0 grp=1
             total=9 minFill=4 count=[1,0]
             coverSplitArea=-2099823776 area=[717833776,0]
[RTREE-DIAG]   m_taken=100000000 m_partition=0 -1 -1 -1 -1 -1 -1 -1 -1
[RTREE-DIAG]   branchBuf[0].rect=[67429380..67932300 span=502920]
                                 [117822980..117822980 span=0]
[RTREE-DIAG]   branchBuf[1].rect=[69441060..69943980 span=502920]
                                 [117805200..117810280 span=5080]
...
[RTREE-DIAG]   branchBuf[8].rect=[82008980..82511900 span=502920]
                                 [117955060..117962680 span=7620]
```

Key observations:

- `src=PickSeeds-1` plus `m_taken[0]=1` and `idx=0` → `seed0 == seed1 == 0`. Exactly the smoking-gun for hypothesis (1).
- Every per-dim `span` is small and positive (`5e5`, `5e3`, etc.). No leaf overflow.
- But `coverSplitArea = -2099823776` — **negative**, which `RectSphericalVolume` cannot algebraically produce (`sumOfSquares * unitSphereVolume` is non-negative).
- The magnitude is interesting too: `-2099823776 ≈ -INT_MAX × 0.98`. That's not a noisy double; that's an exact 32-bit signed-integer value sitting in a double slot.
- `area[0] = 717833776` (run 1) and `-919295316` (run 2) — also "round int32" magnitudes, also wildly wrong vs. the expected `~1.99e11` for the seed-0 branch.

### 4. The actual bug

Every value the diag pulled out of a "double" field had the shape of a 32-bit signed integer. That means the field is being computed and stored as `int32_t` somewhere, not as `double`. The `ELEMTYPEREAL` template parameter is supposed to be the wide floating-point type for volume math.

Grep across the kicad submodule:

```
kicad/include/view/view_rtree.h:36           RTree<VIEW_ITEM*, int, 2, double>
kicad/pcbnew/drc/drc_rtree.h:77              RTree<ITEM_WITH_SHAPE*, int, 2, double>
kicad/pcbnew/connectivity/connectivity_rtree.h:45  RTree<T, int, 3, double>
kicad/pcbnew/connectivity/connectivity_items.h:395 RTree<const SHAPE*, int, 2, double>
kicad/eeschema/sch_rtree.h:42                RTree<SCH_ITEM*, int, 3, double>
kicad/libs/kimath/include/geometry/shape_index.h   RTree<T, int, 2, double>
kicad/libs/kimath/src/geometry/shape_poly_set.cpp:1927   RTree<intptr_t, intptr_t, 2, intptr_t>   ← OUTLIER
```

Every other instantiation passes `double` for `ELEMTYPEREAL`. `splitCollinearOutlines` (called from `SHAPE_POLY_SET::Simplify`, which fires during any board load that has polygon-bearing items like the microwave demo's RF "footprints" or pic_programmer's pads) passes `intptr_t`.

On wasm32, `intptr_t` is `int32_t` because pointers are 32-bit. `RectSphericalVolume`'s loop:

```cpp
ELEMTYPEREAL sumOfSquares = 0;
for (int index = 0; index < NUMDIMS; ++index) {
    ELEMTYPEREAL halfExtent =
        ((ELEMTYPEREAL) max[index] - (ELEMTYPEREAL) min[index]) * 0.5f;
    sumOfSquares += halfExtent * halfExtent;
}
return sumOfSquares * m_unitSphereVolume;
```

…becomes int32 arithmetic. For span_x = 1.5×10⁷, halfExtent² = 5.7×10¹³ — far past `INT_MAX = 2.15×10⁹`. The multiplication wraps, `sumOfSquares` ends up as garbage (the `-2099823776` we observed), `m_coverSplitArea` follows, `worst = -coverSplitArea - 1` ends up hugely positive, and PickSeeds' `if (waste >= worst)` never fires for any pair. `seed0 = seed1 = 0` (their default), `Classify(0, 0)` succeeds, `Classify(0, 1)` trips the assertion.

On native (x86_64, arm64), `intptr_t = int64_t` so the same math succeeds even with the wrong template arg. KiCad's CI has therefore never seen the assertion.

### 5. The fix

```diff
- RTree<intptr_t, intptr_t, 2, intptr_t> rtree;
+ // ELEMTYPEREAL must be a wide floating-point type: RectSphericalVolume's
+ // sumOfSquares grows quadratically with extents, easily exceeding 2^31 for
+ // KiCad nanometer coordinates (~10^8 per axis -> ~10^14 area). All other
+ // RTree instantiations in KiCad use `double` for that fourth argument; this
+ // one was using `intptr_t`, which silently overflowed on wasm32 (where
+ // intptr_t is 32-bit) and tripped an assertion deep in PickSeeds during
+ // PCB load. See features/fix-asyncify-O2-and-modal-promise-rejection/
+ // rtree-debug-findings.md for the full diagnosis trail.
+ RTree<intptr_t, intptr_t, 2, double> rtree;
```

`git -C kicad diff origin/master -- thirdparty/rtree/geometry/rtree.h` is empty — the rtree third-party code stays vanilla upstream. The only divergence from upstream is `libs/kimath/src/geometry/shape_poly_set.cpp:1927`.

### 6. Verification

After the fix:

- `npm run test:kicad:firefox -- load-pcb.spec` → both `microwave` and `pic_programmer` tests pass (~38s total).
- `tests/logs/kicad/load-pcb/*.log` contains the `[KICAD] Wrote …{microwave,pic_programmer}.kicad_pcb` injection lines and no `Aborted(` line, no `[RTREE-DIAG]` line.
- `tests/baseline-screenshots/load-pcb-microwave.png` shows the microwave's two distinctive RF polygon footprints as horizontal red bars on F.Cu, `Pads: 8` in the status bar.
- `tests/baseline-screenshots/load-pcb-pic_programmer.png` shows the pic_programmer's fully-routed multi-IC layout with traces visible across F.Cu.
- `pcbnew.spec.ts` (empty-board path) still passes — no regression.

There remains a separate, pre-existing wasm-port issue downstream: after the board has fully rendered, KiCad's clipboard polling path hits a `RuntimeError: index out of bounds` (and `indirect call to null` on Firefox) inside `__asyncjs__js_clipboardHasText` → `Asyncify.handleSleep`. That's not blocking the load (the screenshot is fully painted by then) and is out of scope for this fix; the load-pcb test explicitly filters its assertion to the two things it cares about — no `[RTREE-DIAG]` and no `Aborted(` — leaving downstream clipboard noise for a follow-up.

---

## Reportable summary for upstream KiCad

Below is a self-contained version suitable for an upstream bug report; pull it as-is.

> **Title:** RTree `ELEMTYPEREAL = intptr_t` in `SHAPE_POLY_SET::splitCollinearOutlines` overflows on 32-bit-pointer targets
>
> **File:** `libs/kimath/src/geometry/shape_poly_set.cpp:1927`
>
> ```cpp
> RTree<intptr_t, intptr_t, 2, intptr_t> rtree;
> ```
>
> The 4th template parameter is `ELEMTYPEREAL`, which `RTree::RectVolume` and `RectSphericalVolume` use for the accumulated volume / sum-of-squares math. Every other `RTree<>` instantiation in KiCad passes `double` for that slot (`view_rtree.h`, `drc_rtree.h`, `connectivity_rtree.h`, `connectivity_items.h`, `eeschema/sch_rtree.h`, `kimath/include/geometry/shape_index.h`). This one passes `intptr_t`.
>
> On 64-bit-pointer hosts `intptr_t == int64_t` and the math fits, so the bug is latent. On 32-bit-pointer targets (wasm32, 32-bit Linux, etc.) `intptr_t == int32_t`, so `RectSphericalVolume`'s `sumOfSquares` overflows for typical KiCad nanometer extents (`~10⁸ per axis → halfExtent² ~5×10¹³`, well past `INT_MAX = 2.15×10⁹`). The wrap turns `m_coverSplitArea` negative, makes `worst = -m_coverSplitArea - 1` huge positive in `PickSeeds`, so `if (waste >= worst)` never fires for any pair. `seed0 == seed1 == 0` survives the loop, `Classify(0, 0)` succeeds, `Classify(0, 1)` trips
>
> ```
> Assertion failed: !a_parVars->m_taken[a_index]
> (thirdparty/rtree/geometry/rtree.h, line 1771)
> ```
>
> in debug builds. Release builds silently store a corrupt tree.
>
> Fix is one character class:
>
> ```diff
> -RTree<intptr_t, intptr_t, 2, intptr_t> rtree;
> +RTree<intptr_t, intptr_t, 2, double> rtree;
> ```
>
> Reproduces on any non-empty board on a wasm32 debug build (we've hit it on the `microwave`, `flat_hierarchy`, and `pic_programmer` demos). Should also reproduce on 32-bit Linux debug builds.
