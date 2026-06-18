# 11 — Asyncify can't nest: why the WASM raytracer is single-core

> **Status:** finding + decision. The multi-core raytracer was built, measured (~6–7× on
> 10 cores), and **parked** because the only way to make it cooperate with the browser main
> thread — `emscripten_sleep` to yield between work batches — aborts when it runs inside the
> 3D viewer's already-suspended call stack. Authored 2026-06-18 while landing the 3D viewer
> (Route C, CPU raytracer). Code: `kicad/3d-viewer/3d_rendering/raytracing/render_3d_raytrace_base.cpp`
> (and `image.cpp`, `3d_canvas/create_layer_items.cpp`). Parked pool: `git -C kicad stash`
> (`WASM_RAYTRACE_POOL`). Repro: `tests/apps/standalone/raytrace-threads/` +
> `tests/e2e/coroutine-raytrace.spec.ts`.

## TL;DR

- The native raytracer fans work out across a **thread pool** and joins with
  `futures.wait()` (`render_3d_raytrace_base.cpp:307`). Several post-process passes
  (shading, blur, anti-alias preview, the `EfxFilter` in `image.cpp`, and the zone/segment
  builds in `create_layer_items.cpp`) follow the same `spawn N threads → main thread
  sleep_for-busy-wait → join` shape.
- The WASM build has **no `-sPROXY_TO_PTHREAD`** and runs the renderer on the **browser main
  thread**. That topology breaks the native shape two different ways:
  1. **A plain join deadlocks.** `futures.wait()` / `std::this_thread::sleep_for()` blocks
     the one thread that the web workers need in order to be scheduled and to post their
     results back. Nothing progresses.
  2. **A "yield instead of block" join aborts.** The obvious fix — spawn workers, then
     `emscripten_sleep(…)` on the main thread to pump the event loop instead of
     busy-waiting — **aborts with `Aborted(invalid state: 1)`**. This is the headline
     finding: **`emscripten_sleep` cannot nest on an Asyncify context that is already
     mid-unwind**, and the 3D viewer always runs inside such a context.
- **Shipped fix:** every parallel section runs **serially on the calling thread** under
  `#ifdef __EMSCRIPTEN__`. The renderer is progressive by design (it drains work up to a
  per-frame time limit and re-schedules via the render-state machine), so single-core still
  paints the board — just slower. This trades the ~6–7× for correctness and zero new
  infrastructure.

## The machine: one Asyncify slot, and the viewer is already using it

This is the same single-`Asyncify.currData` register documented across this dossier
([`02-asyncify-internals.md`](02-asyncify-internals.md),
[`07-decisions-and-outcome.md`](07-decisions-and-outcome.md)). The relevant property here:

- `emscripten_sleep(ms)` is an **Asyncify suspend point**. To return control to the browser
  it calls `asyncify_start_unwind`, copies the live C stack into the global suspension
  buffer, sets `Asyncify.state = Unwinding (1)`, and throws out to JS. When the timer fires,
  JS calls back in and `asyncify_start_rewind` replays the stack.
- Emscripten **asserts that you cannot start a second async operation while one is in
  flight** — `Asyncify.state` must be `Normal (0)` at the entry of a new suspend. Starting an
  unwind while `state == 1` is exactly the `invalid state: 1` abort.

The 3D viewer never runs from a clean stack. It renders from inside wx's **modal / nested
event-pump** (`ShowModal`, the nested-loop pump — see D5 in
[`07-decisions-and-outcome.md`](07-decisions-and-outcome.md)), and that pump is itself
implemented with an Asyncify suspend (it `await`s a JS `ProcessEvents` ccall). So at the
moment `Redraw()` runs, the stack is **already unwound/suspended once**. A worker-join that
calls `emscripten_sleep` to yield is then a **second** suspend on the **same** context →
`state` is already `1` → abort.

```
wxGUIEventLoop pump  ──emscripten_sleep──►  state = Unwinding(1)   (the pump is parked here)
   └─ ProcessEvents → … → EDA_3D_CANVAS::DoRePaint → raytracer Render()
         └─ spawn workers; main thread wants to yield
               └─ emscripten_sleep  ──►  start_unwind while state==1  ──►  Aborted(invalid state: 1)
```

This is **not** the `currData`-contention bug (that one is about *overlapping distinct*
contexts trampling one buffer). This is simpler and more fundamental: **you cannot suspend a
context that is already suspended.** Asyncify is one level deep, full stop. Fibers each carry
their own buffer, but `emscripten_sleep` always targets the global one.

## What we tried (in order), and why each failed or was rejected

1. **Native shape as-is (thread pool + `futures.wait()` / `sleep_for` join).**
   → **Deadlock.** Main thread blocks; workers can't be serviced. Never paints.

2. **Spawn workers, `emscripten_sleep` to yield on the main thread instead of busy-waiting.**
   → **`Aborted(invalid state: 1)`** the instant it runs in the *real* viewer. Worked in a
   *standalone* harness (`raytrace-threads/`) only because there the render is called from a
   clean stack, not from inside a modal pump — which is precisely why the standalone repro
   was misleading and the bug only showed up integrated.

3. **Persistent worker pool + main-thread busy-wait (no `emscripten_sleep` at all).**
   → **Worked and was fast (~6–7× on 10 cores).** Rejected anyway: it busy-waits the browser
   main thread for the whole render (jank, fans, blocks input), and it adds a standing worker
   pool + SAB plumbing to maintain. Parked, not deleted — it's in `git -C kicad stash`
   (`WASM_RAYTRACE_POOL`) behind a `WASM_RAYTRACE_POOL` gate, with its repro harness.

4. **Serial on the calling thread (SHIPPED).**
   → No nesting, no busy-wait, no new infra. `processBlocks()` / `shadeWorker()` /
   `blurWorker()` / `previewWorker()` / `filterWorker()` are each invoked directly under
   `#ifdef __EMSCRIPTEN__`; the native `tp.submit_task(...)` + `futures.wait()` path stays
   for non-WASM. Progressive rendering keeps the UI responsive across frames.

## The standalone test suite — and what it does / does NOT prove

`tests/e2e/coroutine-raytrace.spec.ts` drives the one-binary harness
(`tests/apps/standalone/raytrace-threads/`, switchable by URL `#m=`). It maps almost
1:1 onto the ladder above. **Polarity rule: a test is green IFF the mechanism genuinely
runs multi-core (`workersRan > 1`); a freeze or a single-thread fallback is never a green
pass.**

| `#m=` | Variant | Ladder step | Test verdict |
|---|---|---|---|
| 0 | A — detached threads + main-thread busy-wait | step 1 (deadlock) | **negative control**, `test.fail()` — held to `workersRan > 1`, can't meet it (deadlocks → `workersRan=0`), reported as an *expected* failure (self-recovers after a 12 s cap) |
| 1 | B1 — detached + `emscripten_sleep` yield | step 2 | green (multi-core in isolation) |
| 2 | B2 — persistent pool + `emscripten_sleep` | step 2 | green |
| 4 | B1 with stack-local atomics (mirrors the raytracer's shared locals) | step 2 | green |
| 5 | B3 — persistent pool + `sleep_for` busy-wait (the parked port) | step 3 | green |
| 3 | C — serial | step 4 | not a standalone pass; used only as the slower baseline in the speedup test |

**Critical caveat — the suite reproduces Bug 1, not Bug 2.** The harness runs from a clean
`OnInit`, so mode 0 faithfully reproduces the **worker-spawn deadlock** (step 1: a
main-thread busy-wait starves the event loop, the on-demand worker is never created). But
**no** standalone test reproduces the actual current blocker — the `Aborted(invalid state:
1)` Asyncify-nesting abort (step 2 in the *real* viewer) — because that requires rendering
from inside an already-suspended modal pump, which a clean stack never does. So the
emscripten_sleep variants (m=1/2/4) are green here yet abort the real viewer; B3 (m=5) is
green here and *also* works integrated, but is parked for jank (step 3). The suite proves
the *threading mechanisms in isolation*; it is **not** a gate on the shipped viewer, which
stays serial. A test with teeth against Bug 2 would need to fake the enclosing suspend
(render inside a modal-pump `emscripten_sleep`, then attempt the worker-join) — and would
currently be a genuine red.

## The open question (what would unpark the multi-core path)

The build **already ships `emscripten_fiber_swap`** (it's how tool coroutines and the parked
main loop work — [`02`](02-asyncify-internals.md), [`06`](06-design-b-fiber-first-runtime.md)).
A fiber owns its **own** suspension buffer, so a *fiber* swap is not bound by the single
global-slot assertion the way `emscripten_sleep` is. So the real question is:

> Can the worker-join yield via a **nestable** mechanism — a fiber swap, or JSPI — instead of
> `emscripten_sleep`, so it can suspend even though the enclosing modal pump is already
> suspended?

That is unverified and needs its own red test before re-landing. The fiber-first runtime in
[`06-design-b-fiber-first-runtime.md`](06-design-b-fiber-first-runtime.md) is the natural home
for it: if modal pumps and render yields were both scheduler-owned fiber contexts, "render
yields while the pump is parked" becomes a normal context switch instead of an illegal nested
unwind. Until then, single-core is the correct answer.

## Practical guidance for future work in this area

- **Never call `emscripten_sleep` from code that can run inside a modal / nested event loop.**
  It will abort, not just block. The viewer, dialogs, and progress reporters all qualify.
- **A standalone harness that calls your code from a clean stack will not reproduce this.**
  The nesting only happens through the wx pump. Test integrated, or fake the enclosing suspend.
- **Prefer "drain up to a time budget, then return and let the state machine re-schedule"**
  over "block until done." The raytracer already works this way; lean on it.
- **If you need real parallelism**, the path is a *nestable* yield (fiber/JSPI), not
  `emscripten_sleep`, **or** `-sPROXY_TO_PTHREAD` so the render runs off the main thread (a
  much larger architectural change for this build).
