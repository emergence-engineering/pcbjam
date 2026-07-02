# Shared pool vs raw `std::thread` — why the raytracer deadlocks and where `2N+8` comes from

> Companion to [`README.md`](README.md) (the camera-move deadlock fix). That doc describes *what*
> was fixed; this one explains the underlying architecture: upstream KiCad's **two** threading
> patterns, why only one of them is WASM-hostile, the Worker ledger behind the
> `PTHREAD_POOL_SIZE = hardwareConcurrency*2+8` constant, why the June-30 threading revert did
> **not** already cover this, and the upstream-able follow-up that would make the whole deadlock
> class impossible by construction.
>
> Line numbers are against the branch at fix time (KiCad 10.0.4; the cited KiCad files are
> byte-identical to upstream).

## 1. Web Workers are the scarce resource — and a missing one can't be waited for

Every pthread in the browser runs inside a Web Worker. Emscripten obtains one of two ways:

- **Pre-warmed** (`-sPTHREAD_POOL_SIZE`): Workers created and fully loaded at startup, parked
  idle. `pthread_create` against one is a single `postMessage` that the Worker's **own** event
  loop receives — the main thread does not participate.
- **On-demand** (the fallback, since `-sPTHREAD_POOL_SIZE_STRICT=0`): `new Worker()` at
  `pthread_create` time. The Worker must fetch + instantiate the (~190 MB) module, then post
  *"loaded"* back to the **main thread**, whose handler posts *"run"*. The thread only starts
  once the main thread returns to its event loop.

That asymmetry is the whole story. A Worker shortfall is not a slowdown: if the spawner then
blocks the main thread waiting for the spawned threads (the raytracer's busy-wait join), the
on-demand boot handshake can never complete — circular wait, tab frozen. See
[`README.md` §3](README.md) for the deadlock diagram.

## 2. Upstream KiCad has two threading patterns, side by side

**Pattern 1 — the shared pool.** `KICAD_SINGLETON::Init()` (`common/singleton.cpp:60-62`)
creates one `BS::priority_thread_pool` (`include/thread_pool.h:31`) with
`hardware_concurrency()` threads (`bs_thread_pool.hpp:1949-1954`) **once, at startup**. The
threads park on a condition variable; subsystems *submit tasks*:
zone fill (`pcbnew/zone_filler.cpp:736,825`), DRC
(`drc/drc_test_provider_copper_clearance.cpp:697`), connectivity (`pcbnew/board.cpp:1159`),
footprint loading (`pcbnew/footprint_info_impl.cpp:218`) — and, notably, **the raytracer's own
main tracing pass**, `renderTracing`
(`3d-viewer/3d_rendering/raytracing/render_3d_raytrace_base.cpp:250-288`):

```cpp
thread_pool& tp = GetKiCadThreadPool();
// ...
for( size_t i = 0; i < tp.get_thread_count(); ++i )
    futures.push_back( tp.submit_task( processBlocks ) );
futures.wait();
```

Running a task = queue-push + condvar-notify to threads whose Workers **already exist**. No
`pthread_create` ever happens after startup.

**Pattern 2 — raw `std::thread`.** Older 3D-viewer code predating KiCad's pool adoption creates
`std::max( hardware_concurrency(), 2 )` fresh threads **per pass**, detaches them, and busy-waits
(`while( threadsFinished < N ) sleep_for( 10ms )`) on the calling (= browser main) thread:

| Site | Spawn / join | Runs when |
|---|---|---|
| `renderPreview` | `render_3d_raytrace_base.cpp:818` / `:1401` | **every camera move** (the interaction pass) |
| `postProcessShading` | `render_3d_raytrace_base.cpp:707` / `:727` | end of a full trace |
| `postProcessBlurFinish` | `render_3d_raytrace_base.cpp:756` / `:789` | end of a full trace |
| `BOARD_ADAPTER::createLayers` helpers | `create_layer_items.cpp:1241,1742` | scene build (viewer open / board change) |
| `IMAGE::EfxFilter` | `image.cpp:488` | not on the raytrace hot path |

The WASM-critical difference between the patterns is **when `pthread_create` runs**: Pattern 1
calls it at startup, when the main thread is idle and the pre-warmed bag is full. Pattern 2 calls
it at **render time** — mid-interaction, with the main thread about to block in the join. Only
Pattern 2 can ever need an on-demand Worker boot, and it needs it at the worst possible moment.

It is a wry detail that upstream already ported the *slow* pass (`renderTracing`, the full-quality
progressive trace) to the pool, while the pass that runs on **every camera move**
(`renderPreview`) is still raw — which is exactly why the deadlock bites on interaction.

## 3. The Worker ledger — deriving `2N+8`

The invariant the build must satisfy: **pre-warmed Workers ≥ peak simultaneous live pthreads.**
Any shortfall silently switches the excess threads to on-demand boot (`STRICT=0`), i.e. to the
deadlock path. On an 8-core machine (`N = 8`):

| Consumer | Workers | Held |
|---|---|---|
| KiCad shared pool (Pattern 1, `singleton.cpp:60`) | `N` = 8 | forever (threads never exit) |
| One raw-thread pass in flight (Pattern 2) | `N` = 8 | for the pass duration |
| Margin (`+8`) | 8 | see below |
| **Pre-warmed total** | **`2N+8` = 24** | |

The `2N` is *derived*: two independent populations, both sized off `hardware_concurrency` by
upstream, provably alive at the same time (the pool threads never exit; a raw pass spawns its full
set before joining). With the old `PTHREAD_POOL_SIZE = N`, the free warm count at render time was
**exactly zero** — every `renderPreview` thread went on-demand, which is why the freeze was 100%
reproducible, not flaky.

The `+8` is *margin*, not derived. It absorbs:

- **Recycle lag** — an exited pthread's Worker returns to the warm bag only after the **main
  thread** processes its exit message. Back-to-back passes (preview → trace slices → post-process)
  can spawn while a few Workers from the previous pass are still in limbo.
- **Stray long-lived threads** outside the pool that each permanently hold a Worker (e.g. the
  font-list poller, `common/widgets/font_choice.cpp:100`, if active in a given app).
- Small-core machines, where `2N` alone is a small absolute number.

Honest assessment: this is a **capacity answer to a structural problem**. The constant chases the
runtime behavior of upstream code we deliberately don't patch — if a future KiCad adds another
raw-thread site or resizes its pool, `2N+8` silently goes stale. The guard is the regression test
(`tests/kicad/3d-viewer-deadlock.spec.ts`), not construction. §5 is the structural fix.

## 4. "Didn't the June-30 threading revert already fix this?"

No — it's what *exposed* this, and the distinction matters:

1. **Route C** (kicad `4ccabfd5c3`, 2026-06-18): multi-threaded wasm didn't survive Asyncify, so
   the raytracer passes were forced single-threaded behind `#ifdef __EMSCRIPTEN__` and the shared
   pool got an inline-`detach_task` shim. No parallelism → no Worker demand → no deadlock.
2. **Native EH** (root `c1ef489`/`ee01642`, 2026-06-29) removed the Asyncify-rewind crash that
   motivated those hacks.
3. **The threading revert** (kicad `4f42d0b328` + root `71807db`, 2026-06-30) restored the four
   files **byte-identical to upstream** and linked `wasm/shims/nanosleep_yield.c` as the guard:
   the busy-wait join yields via Asyncify so on-demand Workers *can* boot.

The revert restored upstream's **mixed** state — Pattern 1 for `renderTracing`, Pattern 2 for
everything in the §2 table. It did not (and could not) route the raw passes through the pool,
because **upstream itself never has**. "Original upstream threading" *is* the raw-thread preview
pass. And the revert's guard, the nanosleep yield, turned out to hold only in some call chains:
it boots Workers fine at viewer-open (scene build + first render, reached via the yielding pump),
but not reliably in interaction paint chains — hard freeze, or `Aborted(invalid state)` when the
unwind is illegal ([`README.md` §3–4](README.md)). The June-30 e2e suite was green (63/63) because
no test then dragged **on the GL canvas** — the only drag test moved the DOM titlebar; the
camera-move path had no coverage until `3d-viewer-deadlock.spec.ts`.

So the layering on this branch is: the revert made upstream threading *run*; the `2N+8` pre-warm
makes the fragile on-demand path *unnecessary*; the shim and the mouse-button `Paint()` defer
remain as fallback layers beneath it.

## 5. Follow-up — finish the port upstream already started

The structural fix is to convert the §2 table's raw-thread sites to the pattern `renderTracing`
already demonstrates ~400 lines above them in the same file: submit the same block-consuming
lambdas to `GetKiCadThreadPool()` instead of spawning threads.

```cpp
// today (renderPreview and friends): spawn + detach + busy-wait
for( size_t ii = 0; ii < parallelThreadCount; ++ii )
    std::thread( [&]() { /* consume blocks via nextBlock.fetch_add */ } ).detach();
while( threadsFinished < parallelThreadCount )
    std::this_thread::sleep_for( std::chrono::milliseconds( 10 ) );

// ported: the renderTracing pattern (render_3d_raytrace_base.cpp:284-288)
thread_pool& tp = GetKiCadThreadPool();
BS::multi_future<void> futures;
for( size_t i = 0; i < tp.get_thread_count(); ++i )
    futures.push_back( tp.submit_task( /* same lambda */ ) );
futures.wait();
```

Consequences:

- **The deadlock class disappears by construction** — no `pthread_create` after startup, so no
  on-demand Worker boot can ever be needed, regardless of pool sizing, call chain, or Asyncify
  state. Not "unlikely"; impossible.
- `PTHREAD_POOL_SIZE` drops back to plain `navigator.hardwareConcurrency` — no multiplier, no
  margin, no staleness risk. The nanosleep shim and the `Paint()` defer become pure
  belt-and-braces.
- Native desktop benefits too: no create/destroy churn of ~N OS threads per pass per progressive
  frame, and the raytracer becomes consistent with every other KiCad subsystem.

Wrinkles, all manageable: the main-thread wait can stay `futures.wait()` (proven viable in this
very build — `renderTracing` does it today) or keep the counter + `sleep_for` loop (which the
shim turns into a UI-pumping yield); every §2 call site runs on the main thread, so there is no
nested-submission (pool-task-waiting-on-pool-task) hazard; it's a priority pool if preview passes
ever need to jump the queue.

**Why it's deferred, not done here:** those exact files were made byte-identical to upstream the
day before this fix (kicad `4f42d0b328`) — re-diverging them reverses that cleanup and walks the
fork away from upstream again (the standing fork policy; `scripts/kicad-diff-stats.sh` polices
it). The right vehicle is an **upstream KiCad merge request** — "port the 3D raytracer's remaining
raw-`std::thread` passes to the shared thread pool, like `renderTracing`" is an upstream-quality
cleanup with native benefits. If it lands, the fork inherits it on the next rebase and the pool
expression collapses back to `N`.
