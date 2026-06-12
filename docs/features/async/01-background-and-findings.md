# 01 — Background: the session, the test, and the three bugs

## How we got here

The work began with: *"load a real PCB design in the PCB editor … use the open menu inside
KiCad and open it … create a test, make screenshots."* That investigation lives in Claude
session **`3301ab3a-c457-4359-be9a-dcf4dcfc9fbc.jsonl`** (started 2026-05-28). It produced:

- **The e2e test:** `tests/kicad/load-pcb.spec.ts` — drives File→Open, injects demo boards into
  MEMFS, waits for `LoadBoard`, screenshots. Parametrized over two demos: **`microwave`**
  (RF-polygon heavy) and **`pic_programmer`** (~698 KB real layout). Probe variant:
  `tests/kicad/load-pcb-probe.spec.ts`.
- **Logs:** `tests/logs/kicad/load-pcb/…microwave….log`.
- **Findings docs:** `docs/docs/features/fix-asyncify-O2-and-modal-promise-rejection/rtree-debug-findings.md`
  and `…/clipboard-asyncify-findings.md`.

Three distinct errors appeared along the way. They are easy to conflate but have different
root causes.

---

## Bug 1 — rtree `Classify` assert during `LoadBoard()` — **FIXED**

A WASM-only 32-bit integer overflow in KiCad geometry:
`kicad/libs/kimath/src/geometry/shape_poly_set.cpp:1927` instantiated
`RTree<intptr_t, intptr_t, 2, intptr_t>`. The 4th template arg (`ELEMTYPEREAL`) is the wide
float type for `RectSphericalVolume`'s `sumOfSquares`. Every other RTree in KiCad uses `double`;
this one used `intptr_t`. On native (`intptr_t==int64_t`) the bug is latent; on **wasm32
(`intptr_t==int32_t`)** a microwave polygon's area (~1.79e14) wraps int32 to garbage
(`coverSplitArea = -2099823776`), breaking `PickSeeds` → `seed0==seed1==0` →
`Classify(0,1)` trips `ASSERT(!m_taken[0])` at `rtree.h:1771` → WASM `Aborted()` during load.

**Fix (committed):** `intptr_t` → `double`.
- kicad `07d8130d` — *"shape_poly_set: use double instead of intptr_t for RTree ELEMTYPEREAL"*
- root `31ff88e` — *"tests: load-pcb e2e for microwave + pic_programmer demos"* (bumps submodule)

This bug is **not** part of the async story. Listed only so it isn't re-confused with the
others.

---

## Bug 2 — clipboard `index out of bounds` crash, *after* the board renders

Symptoms (Firefox): `RuntimeError: index out of bounds` (microwave) / `indirect call to null`
(pic_programmer), preceded by `[wxClipboard] Cannot check clipboard content: Clipboard
operation timed out`. The board is already fully painted; this is downstream noise that the
load-pcb test deliberately filtered out.

**Mechanism (verified against current code):** `wxClipboard::IsSupported()`
(`wxwidgets/src/wasm/clipbrd.cpp:288-311`) answers "is text available?" by calling
`js_clipboardHasText()` (`clipbrd.cpp:118-142`), an `EM_ASYNC_JS` that does
`navigator.clipboard.readText()` raced against a **2-second timeout**. The just-loaded headless
page has no clipboard permission, so each call **suspends via Asyncify for the full 2 s**.
`IsSupported` is a synchronous-by-contract predicate that the UI-update / paste-enable path
calls repeatedly, so these suspends stack (`pendingSleeps`→3 in the diagnostics) and, crossed by
a modal teardown's fiber swap, the single `Asyncify.currData` slot is clobbered →
`doRewind(null/garbage)` → crash.

> The `clipboard-asyncify-findings.md` doc labels its fix "Applied," but the **code is still
> buggy** — `wxwidgets` HEAD `6fb2eac257` still calls the async `IsSupported`. The fix was
> designed but never committed.

Full control flow in [`02-asyncify-internals.md`](02-asyncify-internals.md) §"The crash".

---

## Bug 3 — the tool-open **hang**, *after* idle (the real blocker for rendering)

From the live trace (libcontext `KICAD_DIAG_COROUTINE`): the programmatic File→Open hangs
inside the **first tool fiber swap** after startup. Trace ends at a `jump-swap` with no
following `entry-call`/`jump-resume` — the swap unwinds but the target fiber never runs. Key
observations from that session:

1. The **same** coroutine completes many swap cycles during the startup burst, then the **first
   swap after startup hangs.**
2. It is **not specific to the open** — on the fileless `/p/mytest/eeschema` route, a `w`
   keystroke after the startup burst triggers a fiber resume that hangs identically. So **all
   post-idle tool interactivity is affected.**
3. At idle, measured **`Asyncify.state == Normal` but `Asyncify.currData` set** — i.e. a swap
   unwound and its rewind was never issued.

The session attributed this to the main loop "parking" `main()` in the single `currData` slot
via `wxwidgets/src/wasm/evtloop.cpp:107`
`emscripten_set_main_loop(ProcessEvents, 0, /*simulate_infinite_loop=*/1)`.

> **Important correction (see §"De-parking" in 02):** `simulate_infinite_loop=1` is **not** an
> Asyncify park — it is a plain `throw "unwind"` (`pcbnew.js:11392`) that *discards* the native
> `main()` stack. The dangling-`currData`-at-idle it produces is the leading suspect for the
> hang, but the precise mechanism (orphaned buffer vs. stuck trampoline guard) is an open
> empirical question answered by a one-line diagnostic.

There is also a related **null-`IsModal` / `windowClosing` close crash**: when `beforeunload`
fires during the suspended-open window, the close path crashes on a null vtable slot. That is a
*lifecycle* bug (teardown firing under the live loop), adjacent to the hang.

---

## The connective insight

Bug 2 (crash) and Bug 3 (hang) are **the same disease**: one global `currData`/`state` register
shared by three producers. Crash vs. hang is just which producer loses the race for the slot:

- **Crash:** a long-parked **sleep** (the 2 s clipboard read) is clobbered by a **fiber swap**.
- **Hang:** a **fiber swap** is stranded because the slot is dirtied/occupied (by the parked
  main loop's abnormal teardown), so its rewind is never issued.

Everything else in this dossier follows from that one observation.
