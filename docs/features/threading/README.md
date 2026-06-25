# Threading in KiCad-WASM — why it's single-core today, and the paths to real multithreading

> **Status:** mechanism reference for KiCad-WASM threading. Native wasm-EH (`-fwasm-exceptions`) is
> the **default build**, and the three-failure-mode analysis below is validated by the pthread test
> suite — see [`../wasm-exceptions/10-pthreads-native-eh.md`](../wasm-exceptions/10-pthreads-native-eh.md).
> Authored 2026-06-24, updated 2026-06-25. Line numbers are against the artifacts current then
> (`kicad/thirdparty/thread-pool/bs_thread_pool.hpp`, `kicad/common/thread_pool.cpp`,
> `kicad/3d-viewer/3d_rendering/raytracing/render_3d_raytrace_base.cpp`,
> `scripts/kicad/build-kicad-target.sh`, `scripts/common/shims/handlesleep.js`,
> `scripts/common/apply-asyncify.sh`).

## Why this exists

A recurring question: we made "pthread hacks" in the 3D viewer's CPU renderer — *what* was the
issue, *why* were they needed, will **native WASM exceptions** (`-fwasm-exceptions`) fix them, and
how do we get back to **upstream-pristine KiCad source that still runs multithreaded** (so the fork
stays upstreamable)? This document answers all of that, plus: the exact deadlock mechanics, the
three-layer thread model, the complete inventory of raw threads in the tree, and what the *latest*
upstream KiCad has (and hasn't) already changed.

It is the threading companion to the Asyncify dossier in [`../async/`](../async) (especially
[`../async/11-asyncify-nesting-raytracer.md`](../async/11-asyncify-nesting-raytracer.md)) and the
[`../wasm-exceptions/`](../wasm-exceptions) migration.

## TL;DR

- **Three layers, often conflated:** (1) **Web Workers** = the real OS threads; (2) **Emscripten's
  pthread pool** (`PTHREAD_POOL_SIZE`) = pre-spawned *empty* Workers; (3) **KiCad's
  `BS::thread_pool`** (`GetKiCadThreadPool()`) = `hardware_concurrency()` long-lived `std::thread`s
  that **consume** the pre-warmed Workers at startup. **All** pthreads are full shared-memory
  Workers — there is no lightweight/isolated variant.
- **Effectively nothing runs multithreaded.** KiCad's pool funnels every entry point through one
  shimmed `detach_task()` (inline), so the whole pool is serial; the raytracer's *separate* raw
  `std::thread` passes are `#ifdef`'d to serial; `wxThread` is a no-op. The 16 pool Workers spawn at
  startup and then sit idle.
- **Three distinct failure modes, not one:** **(a) deadlock** (raw-thread join + on-demand Worker
  creation — fixed in the wasm layer, §4), **(b) nesting abort** `invalid state: 1` (a 2nd Asyncify
  unwind starting while already Unwinding — does **not** arise when the inner `emscripten_sleep` is
  dispatched at `state == Normal`, e.g. from a modal pump's `ProcessEvents`, §3), **(c) worker-rewind
  crash** `"func is not a function"` (a C++ throw driving Asyncify on a pool Worker under
  `-fexceptions` — **fixed by native EH**, now the default).
- **`-fwasm-exceptions` (the default) clears mode (c).** A C++ exception thrown on a pool Worker is
  safe under native EH — confirmed: the real-pool `threadpool-real` test runs 16-core with a throwing
  worker task, green only under native EH. Modes (a)/(b) are Asyncify, not EH — addressed separately
  in the wasm layer (the nanosleep override for (a); `state == Normal` dispatch for (b)).
- **`PROXY_TO_PTHREAD` is not our escape hatch.** Asyncify *can* mechanically run on the
  proxied-main Worker, but it's unsupported/rough — and the real blocker is that our **wx-dom port
  manipulates the DOM directly**, which a Worker cannot do.
- **A path to multi-core 3D needs zero KiCad edits — two ways.** (1) **Pre-warm** enough Workers
  (`PTHREAD_POOL_SIZE` ≥ pool + peak raw threads): on-demand creation never happens, so the upstream
  `sleep_for` busy-wait runs multi-core (with main-thread jank). (2) **The nanosleep override**
  (`wasm/shims/nanosleep_yield.c`) makes that main-thread `sleep_for` *yield* via Asyncify, so the
  event loop services the on-demand handshake — multi-core without pre-warming and without the jank
  (proven by `pthread-ondemand`, §4). The parked `WASM_RAYTRACE_POOL` (~6–7×) is the pre-warm shape.
- **Upstream has only migrated 1 of 7 raytracer parallel sections to the pool**, and that was an
  accident (a side effect of a cosmetic commit). The other six are **legacy 2018 OpenMP-translation
  code** — so a pool migration is a legitimate, *upstreamable* cleanup, not a wasm hack.

---

## 1. The model: three layers, two patterns

WebAssembly has no threads of its own. "Thread" means different things at three levels:

**Layer 1 — Web Workers = the real OS threads.** A "thread" in a browser is a Web Worker: a
separate JS context running the *same* wasm module against the *same* shared memory. Spinning one up
is **expensive** (new context + module instantiate) and **can only be initiated from the main
thread's event loop**.

**Layer 2 — Emscripten's pthread pool (`PTHREAD_POOL_SIZE`).** Because creating Workers is slow and
main-thread-bound, Emscripten pre-spawns a bag of *empty, generic* Workers at startup. We set
`PTHREAD_POOL_SIZE='navigator.hardwareConcurrency'` (`build-kicad-target.sh:413-415`), so on a
16-core machine you get 16 pre-warmed Workers. `std::thread`/`pthread_create` tries to grab one.

**Layer 3 — KiCad's `BS::thread_pool` (`GetKiCadThreadPool()`).** An *application-level* pool — a
different thing from Layer 2. Its constructor creates `hardware_concurrency()` long-lived
`std::thread`s (`thread_pool.cpp:44-45` → `determine_thread_count` at `bs_thread_pool.hpp:1965-1970`)
and parks them on a condition variable waiting for tasks. You feed it work with `submit_task`; the
parked threads pick it up. The "hire a team once, give them many jobs" pattern.

**The interaction that confuses everyone:** KiCad's Layer-3 pool threads *are* pthreads *are*
Layer-1 Workers. So the 16-thread pool **consumes all 16 pre-warmed Workers at startup.** After that
the pre-warmed bag is *empty*.

**All pthreads are full shared-memory Workers.** There is no `std::thread` that gets its own
isolated heap. Every pthread shares the one `WebAssembly.Memory` (one SharedArrayBuffer); a thread's
"own" memory is only its stack + TLS, carved *out of* that shared buffer. KiCad's raytracer threads
*need* this — they read the shared scene and write the shared output image. (An *isolated* Web
Worker with message-passing — copy data in, post results out — would sidestep the whole pthread +
Asyncify problem for pure-compute work like a raytrace band, but that is **not** what `std::thread`
does; using it means hand-writing a worker pool and **rewriting away from upstream KiCad**.)

**Two patterns in KiCad's code:**
- **Pool tasks** (`submit_task`/`submit_loop` on `GetKiCadThreadPool()`) — reuse the standing pool
  threads. No new Workers.
- **Raw `std::thread`** — create a brand-new thread each time, *outside* the pool. Since the
  pre-warmed bag is already drained by the pool, these force **on-demand Worker creation** (§4).

---

## 2. What runs multithreaded today: nothing — the shims + the full raw-thread inventory

### The pool is funneled inline

KiCad routes its data-parallelism through `GetKiCadThreadPool()`. The WASM patch sits at the pool's
single choke point, `bs_thread_pool.hpp:1419`:

```cpp
void detach_task(F&& task, const priority_t priority = 0) {
#ifdef __EMSCRIPTEN__
    (void) priority;
    std::forward<F>( task )();   // ← inline; never reaches a Worker
    return;
#else
    /* enqueue + notify_one() a Worker */
#endif
}
```

**Every** entry point funnels through it: `submit_task()` (`:1751`) calls `detach_task`;
`submit_loop`/`submit_blocks` call `submit_task`; `detach_loop`/`detach_blocks`/`detach_sequence`
call `detach_task`. So this one `#ifdef` makes the entire pool serial. (Note `create_threads`
(`:1903`) is **not** shimmed — so the pool still spawns its 16 idle threads/Workers at startup; they
just never get work. Pure overhead.)

Pool consumers now running serial: zone fill (`zone_filler.cpp`, `board.cpp`), **all** DRC providers
(`pcbnew/drc/*`), connectivity (`CONNECTION_GRAPH`), footprint enumeration
(`footprint_info_impl.cpp`), symbol/footprint **library preload** (`pgm_base.cpp:941`,
`pcbnew.cpp:664`), `tracks_cleaner`, plus the raytracer **main trace** (`renderTracing`, which is
pool-based).

### The complete raw-thread inventory

Beyond the pool, raw thread creation across the whole tree (the **wx port and our entire
wasm/shim/scripts layer have zero**):

| Site | What | WASM status |
|---|---|---|
| `render_3d_raytrace_base.cpp:764` (`shadeWorker`) | raytrace post-process shading | **`#ifdef __EMSCRIPTEN__`-guarded → serial** |
| `render_3d_raytrace_base.cpp:835` (`blurWorker`) | blur/finish | guarded → serial |
| `render_3d_raytrace_base.cpp:1456` (`previewWorker`) | preview | guarded → serial |
| `image.cpp:525` (`filterWorker`) | `IMAGE::EfxFilter` (AA/blur) | guarded → serial |
| `create_layer_items.cpp:848` (`zoneWorker`) | zone fill geometry | guarded → serial |
| `create_layer_items.cpp:1311` (`simplifyWorker`) | polygon simplify | guarded → serial |
| `libs/kinng/src/kinng.cpp:57` | IPC-API (nng) listener | **not compiled** — CMake links `kinng` only `if(KICAD_IPC_API AND NOT EMSCRIPTEN)`; IPC defaults **OFF** |
| `kicad/pcm/pcm.cpp:1123`, `pcm_task_manager.cpp` | Plugin & Content Manager (HTTP downloads) | **dormant** — network feature, not in the editor apps |
| `common/eda_dde.cpp:146` | DDE/TCP-socket cross-probe server | **compiled but dormant** — no raw TCP sockets in a browser; should never be constructed |
| `thirdparty/nanoflann.hpp:1278` | `std::async` parallel KD-tree build | conditional/dormant (serial by default) |
| **`common/widgets/font_choice.cpp:99`** (`FONT_LIST_MANAGER::Poll`) | background font enumeration | **UNGUARDED** (only `#ifndef __MINGW32__`) — likely the one place a raw Worker *does* spawn in WASM. Fire-and-forget (no main-thread join), so it does **not** deadlock; verify whether `FONT_LIST_MANAGER` is actually constructed in our apps. |

So the only *perf-relevant* raw threads are the six 3D-viewer ones (all guarded). The rest are
disabled/dormant network-IPC features, except `font_choice`, which is the lone unguarded raw thread.

---

## 3. The three failure modes (the core mechanism)

Keeping these apart is the whole key — different causes, different places, different fixes.

| Mode | Symptom | Where it bites | Root cause |
|---|---|---|---|
| **(a) Deadlock** | frozen tab | raytracer join (any main-thread blocking join needing a new Worker) | On-demand Worker creation needs the main-thread event loop; a *non-yielding* blocking join starves exactly that. Fixed by yielding the join (the nanosleep override) or pre-warming. **See §4.** |
| **(b) Nesting abort** | `Aborted(invalid state: 1)` | a 2nd `emscripten_sleep` started while Asyncify is already Unwinding | Asyncify holds one global suspend state. This bites only a *genuine* nested unwind — **not** an `emscripten_sleep` dispatched at `state == Normal` (e.g. work run from a modal pump's `ProcessEvents`, a fresh managed entry; verified by `raytrace-modal`). |
| **(c) Worker-rewind crash** | `"func is not a function"` in `Asyncify.doRewind` | a C++ throw on a pool Worker under `-fexceptions` | The `invoke_*` exception trampolines are Asyncify imports, so a throw drives an Asyncify transition on the Worker. **Native EH (the default) removes it** — exceptions become native wasm instructions, decoupled from Asyncify. |

The raytracer's worker tasks are mostly **pure math** (no throw, no suspend) — which is why the
parked multi-core pool *ran*: pure-compute tasks don't hit mode (c). The pool tasks that crash
(connectivity, library preload) throw C++ exceptions, which under `-fexceptions` drive Asyncify on
the Worker. **Under native EH (the default) those throwing tasks are safe** — confirmed by
`threadpool-real`, which runs the real pool 16-core with a worker task that throws and is caught.

### What `handlesleep.js` does and does *not* fix

`scripts/common/shims/handlesleep.js` fixes a **specific** nesting: a **fiber swap inside an
`EM_ASYNC_JS` await** (e.g. `ShowModal`) clobbers the single global `Asyncify.currData`; the shim
captures the sleep's buffer and restores it in `wakeUp`. It is *"one level of sleep nesting, blind to
`handleAsync` and to fibers"* and does **not** bypass the `state == Normal` assertion. In practice
that assertion is not hit by the cases we have: work dispatched from a modal pump's `ProcessEvents`
runs at `state == Normal`, so its `emscripten_sleep` join is already legal (`raytrace-modal`). A
**genuine** nested unwind (an `emscripten_sleep` started while already Unwinding) would still need a
cooperative scheduler — the **Design B** design ([`../async/12`](../async/12-design-b-asyncify-implementation-plan.md),
[`../async/13`](../async/13-design-b-engineering-spec.md); **status: Phase 0, not landed**) — but no
current app requires it.

---

## 4. The deadlock, mechanically

### The event loop and "pumping"

Each JS context — the main thread, and each Worker — has **one** call stack and **one** task queue,
on a strict **run-to-completion** model: pick one task, run its *entire* call stack to the end, and
only when it unwinds back to the top pick the next task. **While a task runs, nothing else on that
thread happens** — queued tasks (including messages from Workers) pile up undelivered. **"Pumping the
event loop"** = finishing the current task so the thread returns to drain its queue. A function that
runs long without returning *blocks the event loop* and starves everything behind it.

### Path A — `std::thread` → Worker (the *create* side)

`render_3d_raytrace_base.cpp:762-766`, on the main thread: `std::thread t = std::thread(shadeWorker);`

1. libc++ ctor → `pthread_create` → Emscripten `__pthread_create_js` → `spawnThread` (JS glue).
2. `spawnThread` checks `PThread.unusedWorkers` (the pre-warmed pool):
   - **free Worker** → post `{cmd:'run'}` to it; it runs on its own thread. **Main need not pump.** ✅
   - **empty** (our case — KiCad's pool drained them) → `new Worker()`; the new Worker boots
     **asynchronously**, posts *"I'm loaded"* back to the main thread, and **main's message handler
     must run** to then post `{cmd:'run'}`. Finalizing a new Worker **requires main to return to the
     event loop.**

### Path B — the join (the *wait* side)

`render_3d_raytrace_base.cpp:768-769`: `while(threadsFinished < parallelThreadCount) std::this_thread::sleep_for(10ms);`

`sleep_for` → `nanosleep`. On the **main browser thread** a real sleep is impossible (and
`Atomics.wait` throws there), so Emscripten implements it as a **busy-wait**: spin on the clock,
return after 10 ms. Wrapped in the `while`, this is **one task that never ends** — the main call
stack never unwinds to the event loop. The only thing that can move `threadsFinished` is a Worker
reaching `threadsFinished++` (`render_3d_raytrace_base.cpp:752`).

### The circular wait

With the pre-warmed pool empty:
1. Main calls `new Worker()` (A), then enters the busy-wait (B) and **stops pumping**.
2. The new Worker boots and posts *"loaded"* into main's queue.
3. **Main never processes it** (stuck in the busy-wait), so it never posts `'run'`.
4. So the Worker never runs `shadeWorker`, never reaches `threadsFinished++`.
5. So the `while` never exits.

> **Main** waits for `threadsFinished` → which needs the **Worker** to run → which needs **Main** to
> pump and post `'run'` → which Main won't do because it's waiting for `threadsFinished`.

A true cyclic dependency. **It is a deadlock, not slowness** — even if Worker boot took 0 ms, it
would never receive `'run'`. Frozen forever, not slow.

### Two ways to break the cycle, both zero-KiCad-edit

**(1) Pre-warm.** If the Worker is already in `unusedWorkers`, the entire "new Worker → loaded
handshake → main must pump" chain is **skipped**: main posts `'run'` directly, the Worker runs *in
parallel* with main's busy-wait, bumps the counter, the spin exits. So `PTHREAD_POOL_SIZE` ≥ (pool
threads + peak raw-thread concurrency) means on-demand creation never happens → **the deadlock
disappears.** The cost: the busy-wait still pegs the main thread → **jank** (not a freeze).

**(2) Make the join yield.** The deadlock is really "main never pumps", so making the wait *yield* to
the event loop fixes both the deadlock *and* the jank. `wasm/shims/nanosleep_yield.c` (a strong
`nanosleep` override) does exactly this: on the main thread a `sleep_for` join becomes an Asyncify
yield (`emscripten_sleep` semantics), so the loop services the on-demand handshake and the Worker
boots; on a worker thread it stays a real blocking sleep. This yield runs at `state == Normal`, so it
does **not** trip mode (b). Proven by `pthread-ondemand` (real pool drains the pre-warmed Workers,
raw fly-threads then boot on demand → multi-core), with no KiCad edit.

---

## 5. Native WASM exceptions (the default) and the failure modes

`-fwasm-exceptions` is a **size/speed de-bloat** that *keeps* Asyncify: it removes the `env.invoke_*`
exception trampolines from `ASYNCIFY_IMPORTS` (`apply-asyncify.sh`), ~59% of the Asyncify tax (pcbnew
**64.5 → ~36 MB gz**; [`../wasm-exceptions/`](../wasm-exceptions)). It is now the **default build**.

- **Raytracer — modes (a)/(b): not an EH question.** Asyncify nesting + main-thread topology. Handled
  in the wasm layer: the nanosleep override yields the join (a, §4), and a modal-pump `emscripten_sleep`
  runs at `state == Normal` (b, §3) — neither needs EH.
- **Thread pool — mode (c): solved by native EH.** Mode (c) fires when a Worker task drives an Asyncify
  transition. Under `-fexceptions`, *exceptions themselves* do that (the `invoke_*` trampolines are
  Asyncify imports; landing pads "fire unreliably when unwinding through asyncify frames"). KiCad's
  connectivity / library-load throw as ordinary control flow, tripping it. **Native EH makes exceptions
  native wasm instructions, decoupled from Asyncify** → a throwing-but-not-suspending Worker task no
  longer drives Asyncify. **Confirmed:** `threadpool-real` runs the real `GetKiCadThreadPool()` 16-core
  with a worker task that throws and is caught — green under native EH, and *only* under native EH.
  - **Per-pass nuance:** the pure-math raytracer passes (shading/blur/`EfxFilter`) don't throw → safe
    on Workers regardless. The **geometry** passes (zone fill / polygon `Simplify`) *can* throw →
    native EH is what makes them Worker-safe.
  - **Async I/O on a Worker:** a Worker doing *async* FS I/O (`EM_ASYNC_JS`) still suspends Asyncify on
    that Worker. KiCad's library preload avoids this not by synchronous FS but because our **PCBJAM IO
    plugins proxy the async fetch to the main thread** and futex-block the Worker; the only thing left
    on the Worker is the S-expr **parse** (a throw), which native EH makes safe. Verified by
    `async-preload` (the KiCad-10 `std::async` preload shape — §10, and doc 10 §7).

So a Worker task is fine under native EH as long as its only Asyncify-relevant act was the exception
itself; genuine async suspension must still be kept off the Worker (proxied to main).

---

## 6. Why `PROXY_TO_PTHREAD` is not our escape hatch

The textbook answer to "my native app blocks on joins" is `-sPROXY_TO_PTHREAD`: run `main()` on a
Worker where blocking is legal. In theory the most KiCad-pristine option (delete both shims). In
practice, off the table for us.

- **Asyncify under it?** Mechanically **yes** on the *proxied-main* Worker (own Asyncify state, runs
  `main()`). But **not officially supported**, with real sharp edges: `pthread_join` on a thread
  running `EM_ASYNC_JS` can hang ([#17552](https://github.com/emscripten-core/emscripten/issues/17552)),
  shutdown hangs with raw `handleSleep`/`handleAsync`
  ([#16940](https://github.com/emscripten-core/emscripten/issues/16940)). **Fibers are thread-pinned**
  — [`fiber.h`](https://emscripten.org/docs/api_reference/fiber.h.html): *"Rewind IDs are
  thread-specific… impossible to resume a fiber started from a different thread."* Our tool coroutines
  are Asyncify fibers.
- **The actual killer — the GUI can't leave the main thread.** Workers have **zero DOM access**; our
  wx-dom port renders widgets *as* DOM elements, so every widget op would have to be proxied. WebGL
  would need OffscreenCanvas or per-call GL proxying, and those only work for HTML5/SDL2 contexts
  ([#8852](https://github.com/emscripten-core/emscripten/issues/8852),
  [#23666](https://github.com/emscripten-core/emscripten/issues/23666)). Clipboard/input add more
  proxying. This is a massive, risky rearchitecture of *our* layer for an unsupported config.

---

## 7. JSPI — not now

JSPI (VM-level stack switching, the Asyncify successor) ships in **Chrome 137+**, **Firefox 139+**,
**Safari 27 beta** (three-engine green only once Safari 27 stables). Closed for *this* codebase
structurally: incompatible with `emscripten_set_main_loop`
([#22493](https://github.com/emscripten-core/emscripten/issues/22493)) — our whole architecture; can't
replace intra-wasm `emscripten_fiber_swap`; a ~350× `JS→C→JS` re-entry regression
([#21081](https://github.com/emscripten-core/emscripten/issues/21081)). Track it; prototype behind
`'Suspending' in WebAssembly` on a small tool. See [`../async/03`](../async/03-solutions-and-prior-art.md)
§3, [`../perf/README.md`](../perf/README.md) lever #10.

---

## 8. Upstream status & the upstreaming path

**Latest upstream KiCad (`master` `9e557f98`, 2026-06-24) has migrated only 1 of 7 raytracer
parallel sections to the pool** — and accidentally:

| Section | Upstream master today |
|---|---|
| `renderTracing()` (main trace) | **Pool** (`submit_task` + `multi_future::wait()`) |
| `postProcessShading` / `postProcessBlurFinish` / `renderPreview` | raw `std::thread` + busy-wait |
| `IMAGE::EfxFilter` (image.cpp) | raw `std::thread` + busy-wait |
| zone-fill / polygon-simplify (create_layer_items.cpp) | raw `std::thread` + busy-wait |

- **The one migration was a side effect.** `b99a43bec2` (2024-09-06) was a cosmetic *"render in
  Hilbert-curve order"* commit; the pool move came along for the ride. `bccf36538` (2025-04-07,
  *"Isolate thread pool loops"*, fixes GitLab #20572) then refined it from `wait_for_tasks()`
  (drain the whole pool) to `submit_task` + per-call `multi_future::wait()`, so a function waits only
  on **its own** tasks — the exact cross-frame concern we have, and the pattern any migration should
  copy.
- **Origin of the raw-thread pattern:** `f8784f30` (2018-09-21, *"Removing OpenMP"*) hand-translated
  `#pragma omp parallel for` into raw `std::thread` + atomic counter + `sleep_for` busy-wait. The
  six un-migrated sections are this **untouched 2018 code** — legacy inconsistency, not a deliberate
  "don't use the pool" decision.
- **A live upstream motivation:** GitLab **#20911** *"3D viewer ray tracing generates a high system
  load"* — the `sleep_for(10ms)` spin-poll + detached-thread churn is high-load *natively*. A pool
  migration (submit + futures, thread reuse, no spin) directly improves it.

**Conclusion:** migrating the six sections to the pool (like `renderTracing` already is) is a
**legitimate, upstreamable cleanup** — precedent in the same file, motivation in a filed issue, and
it removes dead OpenMP-era code. If accepted upstream, our fork carries **zero** divergence here, and
it incidentally fixes our deadlock (pool reuse ⇒ no on-demand Worker creation). Keeping KiCad
pristine and going multi-threaded are **not** in tension — the pristine-est KiCad (pool everywhere)
is also the one that threads cleanly in the browser.

---

## 9. The options — and whether they are interchangeable

Two goals: **keep KiCad pristine** and **enable threads**. Mapping candidates to the failure modes:

| | (a) deadlock | (b) nesting | (c) worker-rewind | Net |
|---|:--:|:--:|:--:|---|
| **0. Pre-warm `PTHREAD_POOL_SIZE`** (build-only) | **✓** | n/a* | partial† | Raw-thread raytracer runs multi-core, with jank. Zero KiCad edits. = the parked `WASM_RAYTRACE_POOL`. |
| **1. nanosleep override** (`wasm/shims/`) | **✓** | n/a | — | Main-thread join yields → on-demand Workers boot, no jank, no KiCad edit. Proven (`pthread-ondemand`). |
| **2. Native EH** (the default) | — | — | **✓** | Worker **execution** safe for throwing pool tasks. Confirmed (`threadpool-real`, 16-core + caught throw). |
| **3. `PROXY_TO_PTHREAD`** | sidesteps | sidesteps | sidesteps | Real threads via a DOM/WebGL-proxying rearchitecture. **Impractical for us (§6).** |
| **4. Design B scheduler** | n/a | only a genuine nested unwind | — | Not required by any current app — the modal pump dispatches at `state == Normal` (§3). |

\* The upstream busy-wait never invokes Asyncify, so mode (b) doesn't arise for it. † Pure-math passes
are mode-(c)-safe; geometry passes may throw → want native EH (option 2).

Read off the engines:
- **Raytracer post-process (raw threads):** the **nanosleep override** (option 1) yields the join →
  multi-core, no jank, no KiCad edit; the **upstreamable pool migration** (§8) is the pristine option.
- **Pool + raytracer main trace:** **native EH** (option 2, the default) makes throwing worker tasks
  safe → the `detach_task` shim can be dropped (a vendored-dep patch ⇒ *less* divergence).

**Where this leaves us:** native EH (default) clears mode (c); the nanosleep override clears mode (a)
and the jank; mode (b) doesn't arise for the cases we have (modal-pump dispatch is `state == Normal`).
All proven on pristine KiCad/wx-core by the doc-10 §6 tests. The remaining work is to **drop the
`detach_task` shim** for real (DRC/zone-fill/connectivity on real Workers) and, optionally, **upstream
the pool migration** (§8) so the fork carries nothing. Keep `PROXY_TO_PTHREAD`/JSPI tracked-only.

---

## 10. Open questions / decisive next steps

1. **Library-preload I/O — answered.** Our fork's library reads are **not** the upstream synchronous
   `KICAD_SEXPR` path: the lib-table rows are typed `PCBJAM`/`PCBJAM_FP`, so the runtime plugin is our
   custom async bridge, which **proxies the fetch to the main thread** and futex-blocks the Worker — so
   no async FS I/O suspends on the Worker. The only Worker-side Asyncify-relevant act is the S-expr
   **parse** (a throw), which native EH makes safe. So **option 2 is a shim deletion, not an I/O
   rework** for the preload path (verified by `async-preload`; full analysis in doc 10 §7).
2. **Does `FONT_LIST_MANAGER` actually spawn its thread in our apps?** `font_choice.cpp:99` is the one
   unguarded raw `std::thread`. Confirm whether it's constructed in WASM (and whether its `Poll`
   touches anything that suspends/throws on a Worker), or whether a wasm-specific font path supersedes
   it. It won't deadlock (no join), but it likely consumes a Worker.

---

## Sources

**Internal**
- `kicad/thirdparty/thread-pool/bs_thread_pool.hpp:1419` (`detach_task` shim), `:1751`
  (`submit_task`→`detach_task`), `:1903`/`:1965` (`create_threads`/`determine_thread_count`)
- `kicad/common/thread_pool.cpp:30-48` (`GetKiCadThreadPool`)
- `kicad/3d-viewer/3d_rendering/raytracing/render_3d_raytrace_base.cpp:752,764,835,1456`,
  `image.cpp:525`, `create_layer_items.cpp:848,1311` (raytracer raw threads + serial fallbacks)
- raw-thread inventory: `common/widgets/font_choice.cpp:99`, `common/eda_dde.cpp:146`,
  `kicad/pcm/pcm.cpp:1123`, `libs/kinng/src/kinng.cpp:57`; build exclusion in
  `common/CMakeLists.txt` (`KICAD_IPC_API AND NOT EMSCRIPTEN`), `CMakeLists.txt:301` (IPC default OFF)
- `scripts/kicad/build-kicad-target.sh:413-415`, `scripts/common/shims/handlesleep.js`,
  `scripts/common/apply-asyncify.sh:88`
- [`../async/11`](../async/11-asyncify-nesting-raytracer.md), [`../async/12`](../async/12-design-b-asyncify-implementation-plan.md),
  [`../async/13`](../async/13-design-b-engineering-spec.md), [`../async/03`](../async/03-solutions-and-prior-art.md),
  [`../wasm-exceptions/README.md`](../wasm-exceptions/README.md), [`../perf/README.md`](../perf/README.md),
  [`../../research/threading_2.md`](../../research/threading_2.md)

**Upstream KiCad (GitHub mirror `KiCad/kicad-source-mirror`, master `9e557f98`)**
- `b99a43bec2` (renderTracing → pool, 2024-09-06) ·
  [`bccf36538`](https://github.com/KiCad/kicad-source-mirror/commit/bccf36538065a8c318dcdb2bc8b28bd855fb5e81)
  (*"Isolate thread pool loops"*, fixes [GitLab #20572](https://gitlab.com/kicad/code/kicad/-/issues/20572)) ·
  `452e69de` (pool singleton, 2025-01-05) · `6e2b20ed` (BS pool 5.0, 2025-09-10) ·
  `f8784f30` (*"Removing OpenMP"*, 2018-09-21) ·
  [GitLab #20911](https://gitlab.com/kicad/code/kicad/-/issues/20911) (raytrace high system load)

**External (Emscripten / browsers)**
- [Pthreads](https://emscripten.org/docs/porting/pthreads.html) · [Asyncify](https://emscripten.org/docs/porting/asyncify.html) ·
  [fiber.h](https://emscripten.org/docs/api_reference/fiber.h.html) · [proxying.h](https://emscripten.org/docs/api_reference/proxying.h.html)
- Asyncify×pthreads/PROXY: [#17552](https://github.com/emscripten-core/emscripten/issues/17552),
  [#16940](https://github.com/emscripten-core/emscripten/issues/16940),
  [#9910](https://github.com/emscripten-core/emscripten/issues/9910)
- WebGL/DOM from a Worker: [#8852](https://github.com/emscripten-core/emscripten/issues/8852),
  [#23666](https://github.com/emscripten-core/emscripten/issues/23666)
- JSPI: [#22493](https://github.com/emscripten-core/emscripten/issues/22493),
  [#21081](https://github.com/emscripten-core/emscripten/issues/21081),
  [V8 JSPI](https://v8.dev/blog/jspi)
