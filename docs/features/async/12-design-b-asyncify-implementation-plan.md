# 12 — Design B on Asyncify: implementation plan to make suspensions compose

> How to realize the dossier's **Design B** ([`06`](06-design-b-fiber-first-runtime.md)) on the
> **current Asyncify toolchain — no JSPI**. The goal is concrete: make the parked main loop, modal
> dialogs, nested loops, clipboard/font waits, and **tool coroutines** all coexist without
> corrupting Asyncify's single suspension slot, so the de-park's coroutine regression goes green —
> under both `-fexceptions` and `-fwasm-exceptions`. Builds on the internal audit (current building
> blocks, the gap) and Design A ([`05`](05-design-a-js-asyncify-arbiter.md)).

## Why now — the red scenario the dossier didn't have

Doc 07/D3 shelved Design A's arbiter because *"no scenario could be made red that it would fix"* — at production semantics the per-sleep `handlesleep.js` capture already satisfied the core invariant. **The de-park changed that.** Measured in `wasm-exceptions/09`: config 3 (JS-EH + de-park) **fails** the 6 coroutine tests that config 1 (no de-park) **passes**. We now have a deterministic red test that only a scheduler fixes. The de-park and Design B are **coupled**: the de-park is *required* for native-EH (the `throw "unwind"` is fatal under wasm-EH catch_all), it breaks coroutines, and Design B is the fix.

## The physics we must obey (why this is hard)

Asyncify is **one** `Asyncify.currData` (active save-buffer pointer) + **one** `Asyncify.state` (`Normal`/`Unwinding`/`Rewinding`). The law: **at most one unwind-or-rewind in flight at a time**; it must begin at `state==Normal` and fully complete before the next. But **many contexts may be *parked* at once**, each holding its own durable buffer (a parked context = `state Normal`, its stack saved in *its* buffer, waiting for a wake).

- **Fibers** (KiCad tool coroutines via libcontext) already give per-context buffers (`wasm_fcontext.asyncify_stack`, 64 KB each) — durable storage is fine. But the *act* of swapping still drives the single global register.
- **`handleSleep`/`handleAsync`** (modals, clipboard, the de-park park, the per-tick `ccall`) take buffers from `Asyncify.allocateData`; only the live `currData` register remembers a parked one — `handlesleep.js` patches this for **one** level of sleep nesting, and is **blind to `handleAsync` and to fibers**.

**The de-park bug, precisely:** `wxWasmParkMainLoop` is a `handleAsync` suspend that is **live for the app's whole life**, and each rAF tick's `await ccall('ProcessEvents',{async:true})` is a second `handleAsync` suspend. A coroutine fiber-swap is then a **third** unwind, attempted while the slot is dirty / `state != Normal` → `Aborted(invalid state: 1)`. Three uncoordinated writers of one slot.

## Architecture: one scheduler owns the slot; everything is a context

The universal rule (06): **no API touches `Asyncify` directly. APIs ask the scheduler to park/wake contexts. The scheduler alone performs Asyncify transitions.**

```
Scheduler (JS) — the single authority
  owns:  Asyncify.currData, Asyncify.state, the fiber trampoline
  registry:  ctx = { id, kind: main|modal|nested|coroutine|sleep, buffer, status, wakeReason, result }
  readyQueue + drain():
     a wake event marks a ctx READY (it does NOT rewind directly)
     drain() resumes the next ready ctx ONLY when state==Normal && no transition in flight
  transitions (the only code that writes currData):
     park(ctx)   = set currData=ctx.buffer; start_unwind; (slot now free, ctx parked)
     resume(ctx) = set currData=ctx.buffer; start_rewind; doRewind
```

Every blocking-looking thing becomes a context that *yields* and is later *resumed*. A coroutine swap becomes "park ctx A, resume ctx B" — a normal scheduler operation serialized with the main loop and modals, exactly the doc-11 cure: *"if the pump and render yields were both scheduler-owned fiber contexts, 'render yields while the pump is parked' becomes a normal context switch instead of an illegal nested unwind."*

## The gap — what to build (from the internal audit)

None of these exist today: (1) a single owner of `currData`/`state`/the trampoline; (2) a scheduler-owned **fiber** context for the main loop + pump (today it's a `handleAsync` park, not a fiber); (3) a deferred-wakeup ready-queue/drain (today wakeups call `doRewind` inline); (4) **`handleAsync` coverage** (the park + the per-tick ccall are entirely unprotected); (5) sleep contexts promoted from "restore one pointer" to "registered context"; (6) trampoline ownership as a scheduler invariant; (7) a lifetime owner coordinated with `currData` management (the de-park gave us D1/lifetime without D2/ownership).

## Phased implementation (each phase gated by the red harness)

**Phase 0 — Red-green harness (2–3 days).** Make the coroutine regression a deterministic, minimal red test in `tests/asyncify/` (and a CPP test app): a tool-style fiber swap *while the main loop is parked* and *while a modal pump is live*. Reproduce `invalid state: 1` reliably in all three engines. This is the acceptance gate for every later phase. Also fold the 6 failing `coroutine*` specs in as the integration gate.

**Phase 1 — The scheduler core (1–2 weeks). The likely coroutine fix.** Extend `scripts/common/shims/handlesleep.js` into the `AsyncifyArbiter` of doc 05, but covering everything the de-park introduced:
- Own `Asyncify.currData`/`state` + `Fibers.trampoline`; make `currData` a *derived* register set only inside a managed transition; the registry records are the truth.
- **Register `handleAsync`** (wrap it as `handleSleep` is wrapped) so the de-park park and the per-tick `ccall` are tracked contexts, not invisible slot-writers.
- **Track fiber buffers** at `_emscripten_fiber_swap` (`oldFiber+20`/`newFiber+20`) so a coroutine swap is a managed transition.
- **Deferred-wakeup `drain()`** with *explicit* completion signals from `stop_rewind`/`maybeStopUnwind` (not JS `finally` — `doRewind` can re-enter and unwind again before returning).
- Keep it JS-only — **no C++ restructuring yet.** Build, run Phase 0. If green, the coroutine regression is fixed at lowest risk. If still red (the permanent `handleAsync` park can't be made a clean parked context), escalate to Phase 2.

**Phase 2 — Root fiber for the main loop (≈1 week). The clean cure.** Replace the `handleAsync` park with a scheduler-owned **fiber**: run `main → wxEntry → OnRun → DoRun` inside a managed root fiber (06's B2). The main loop *yields its fiber* to the scheduler instead of `handleAsync`-parking. Crucially, **drive `ProcessEvents` from the wasm-side scheduler (the root fiber calls it directly), not the current JS-side `await ccall('ProcessEvents',{async:true})`** — that JS-awaits-a-suspending-export boundary is the Emscripten #13302 corruption hazard (see Prior art). The rAF/`setTimeout` tick just resumes the root fiber (or returns through `set_main_loop`, Ruby/Julia-style, to keep the top off Asyncify entirely). Now the main loop is a sibling context to the coroutines and modals — no permanent `handleAsync` occupant, every swap is fiber↔fiber under the scheduler. This is the definitive fix if Phase 1's "park-as-context" proves fragile.

**Phase 3 — Migrate the waits to one yield API (1–2 weeks). The full Design B.** Add the C++ API and route the ad-hoc suspends through it:
```cpp
WAKE_TOKEN wasm_begin_async_wait(...);
int        wasm_yield_until(WAKE_TOKEN);     // park current ctx, run scheduler
void       wasm_resolve_wait(WAKE_TOKEN, int result);  // mark ctx ready
```
Reimplement `wxDialog::ShowModal` (`dialog.cpp` `startModal`), `wxGUIEventLoop` nested `DoRun` (`evtloop.cpp` `wxWasmRunNestedLoop`), clipboard, and font enum as `yield_until` waits. Removes the second suspension family entirely; the LIFO resolver stacks (`_wxModalResolvers`, `_wxNestedLoopExit`) become scheduler ready/wait bookkeeping.

**Phase 4 — Lifetime + cleanup (few days).** Coordinate the de-park's lifetime (D1) with the scheduler (D2): the browser/scheduler owns app lifetime; `wxEntryCleanupReal`/`OnExit` deferred to real exit/unload; `emscripten_cancel_main_loop` + teardown ordered after the root fiber resolves. (Already half-done in `evtloop.cpp` `ScheduleExit`.)

## Test matrix (doc 06 + nesting + EH)

Each asserts **no crash, no hang, correct return value, app stays interactive, no cleanup during steady-state pumping** — and runs in **Firefox + Chrome + Safari** and under **both `-fexceptions` and `-fwasm-exceptions`**:
- the 6 regressed `coroutine`/`coroutine-nested`/`coroutine-pthread` specs (the gate);
- `ShowModal` from root, from a tool coroutine; `ShowQuasiModal` from a coroutine; nested modal inside quasi-modal;
- coroutine swap **while** a modal pump is live (the Phase-0 red test);
- clipboard read from root and from a coroutine; font enum during startup;
- the **raytracer** threading suite (the doc-11 nesting wall) multi-core;
- exit/unload cleanup after parked contexts exist;
- a `-sASYNCIFY_ASSERTIONS=1` pass + a production `-sASSERTIONS=0` pass (the dossier's "production semantics already satisfy the invariant" claim must be re-validated post-de-park).

## Risks + mitigations

- **A partial arbiter is worse than none** (doc 05) — one path still writing `currData` behind the scheduler corrupts silently. → enumerate *every* `currData` writer (`handleSleep`, `handleAsync`, `_emscripten_fiber_swap`, `finishContextSwitch`, the park, the ccall), route all through the scheduler, assert on stray writes in dev builds.
- **Trampoline wedge** (`Fibers.trampolineRunning` stuck after a mid-flight unwind). → scheduler *owns* the trampoline; keep the `inject-dyncall-shims §3c` self-heal as a belt-and-suspenders.
- **Lifetime cleanup too early** → Phase 4 ordering; defer wx teardown to unload.
- **Reentrancy / out-of-order resolution** → explicit tests; keep wx modal-disabling semantics.
- **Native-EH coexistence** — the scheduler and the `HoistCppCatches` pass must compose (suspend-inside-catch under the scheduler). → test the whole matrix under `-fwasm-exceptions`, including a modal opened from inside a `catch`.
- **Starvation** → FIFO ready-queue; diagnostics for context age.

## Effort

Phase 0 ≈ 2–3 d · Phase 1 ≈ 1–2 wk · Phase 2 ≈ 1 wk · Phase 3 ≈ 1–2 wk · Phase 4 ≈ few d. **Coroutine fix = Phase 0–1 (+2 if needed) ≈ 2–3 wk; full Design B ≈ 4–6 wk** including the test matrix. Phase 1 is the high-value, lowest-risk step and may suffice on its own.

## Prior art (external research)

**The Asyncify fiber scheduler (this plan) is the proven path** for "event loop + blocking `ShowModal` + green threads" — it ships in real runtimes, and the comparisons sharpen two implementation details.

- **Qt for WebAssembly** (closest analog) uses a deliberate **two-tier** scheme: top-level `QApplication::exec()` uses Emscripten's `simulateInfiniteLoop` throw — which keeps the top loop **off Asyncify so the single slot stays free** — while `QDialog::exec()`/nested `QEventLoop::exec()` consume the one Asyncify slot. **This is the inverse of what our de-park did** (the de-park made the *top* loop a live Asyncify occupant, consuming the slot — exactly why coroutines broke). Qt's scheme caps at *one* modal at a time and the Qt team calls Asyncify "not quite scaling to Qt-sized software" — i.e. a single-slot scheme *without* a real scheduler hits a wall; the per-fiber-buffer scheduler (Design B) is the way past it. [Qt commit 6d039a5e; Qt dev ML, June 2024]
- **Ruby-WASM / Julia-WASM** implement this design directly: a **root fiber that *is* the browser event loop**; tasks/coroutines are fibers, each with its own C stack + `asyncify_data` buffer; the scheduler resumes the next ready fiber; "yield to browser" is `emscripten_sleep(0)` *or* returning through the `set_main_loop` callback (the latter keeps the top off Asyncify entirely). That is precisely Design B's B2 root-fiber — already shipping in production runtimes. [Julia PR #32532; Emscripten fiber PR #9859]
- **Pyodide** pre-JSPI used stackless CPS (`WebLoop` + `setTimeout(0)` per task) — not retrofittable to C++; post-JSPI uses per-`promising`-entry stacks plus explicit **spill-stack** save/restore.
- **Dart/Flutter, Blazor, Unity** all use compiler-lowered stackless state machines — not applicable to a C++ toolkit.

**Two findings that sharpen the plan:**
1. **The JS-boundary async-return hazard (Emscripten #13302):** returning a value to JS from a wasm export that internally `fiber_swap`s is broken — *"within-wasm scheduling is fine; the JS-awaits-a-suspending-wasm-export boundary is not."* Our per-tick `await ccall('ProcessEvents',{async:true})` is exactly that boundary. **Design B must drive `ProcessEvents` from the wasm-side scheduler (the root fiber), not via a JS async `ccall`** — folded into Phase 2 below.
2. **JSPI would not have helped this case anyway** (independently confirming the decision to scratch it): the wit-bindgen analysis shows that when the whole scheduler lives inside one app context, *a single `promising` root = a single suspension unit* — JSPI gives no fiber-multiplexing benefit unless each fiber is separately surfaced as a `promising` export (awkward; Chrome also showed a ~350× per-suspension penalty on the JS→wasm path). Pattern-C / Asyncify is the right tool regardless of JSPI availability.
