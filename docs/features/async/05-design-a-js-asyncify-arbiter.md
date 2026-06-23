# 05 - Design A: JS Asyncify arbiter

> **STATUS (2026-06-23):** the throw-based top loop assumed here **is gone** (de-park; [`../wasm-exceptions/09`](../wasm-exceptions/09-event-loop-deparking-plan.md)). This arbiter is the **core of Design B's scheduler**, now being implemented — the de-park created the red scenario (coroutine regression) that 07/D3 said this arbiter lacked. See [`12`](12-design-b-asyncify-implementation-plan.md) + [`13`](13-design-b-engineering-spec.md); this doc's arbiter design is reused there.

> Goal: fix the current system with the smallest architectural move. Keep
> `EM_ASYNC_JS` modal/clipboard/font calls and Emscripten fibers, but introduce one JS-side
> authority that owns `Asyncify.currData`, `Asyncify.state` transitions, the fiber trampoline,
> and resume queueing.

## Status

This is a design note, not an implementation. It explains an incremental universal fix:
instead of adding one-off patches for clipboard, modal dialogs, quasi-modal loops, and fibers,
we put one scheduler in front of all suspension paths.

The core idea is:

```text
Many contexts may be parked.
Only one context may be actively unwinding or rewinding at a time.
Asyncify.currData is not durable state. It is a temporary register loaded from the current context.
```

That is exactly the distinction that makes the design work.

## Concepts

### What is a call stack?

A call stack is the chain of active function calls for one line of execution.

If C++ is here:

```cpp
main()
  -> wxEntry()
    -> wxDialog::ShowModal()
      -> startModal()
```

then local variables and return addresses for all of those calls are on the stack. Normally, a
function returns by walking back up that chain.

In browser WebAssembly, we cannot block the browser main thread while waiting for a Promise. So
if C++ wants to pretend that `ShowModal()` blocks, the stack must be saved somewhere and resumed
later.

### What is Asyncify?

Asyncify is Binaryen/Emscripten's way to save and restore a WebAssembly call stack.

At the low level, it is buffer-oriented:

```text
asyncify_start_unwind(dataPtr)
asyncify_stop_unwind()
asyncify_start_rewind(dataPtr)
asyncify_stop_rewind()
```

`dataPtr` points at an `asyncify_data` structure. The important fact is that the Wasm-level
mechanism already accepts a buffer pointer. It does not require there to be only one buffer.

Emscripten's JS runtime adds a convenience layer:

```js
Asyncify.state    // Normal, Unwinding, Rewinding
Asyncify.currData // pointer to the buffer currently being used
```

That convenience layer is where our contention lives. `currData` is a single slot.

### What is a coroutine?

A coroutine is a function that can pause in the middle and later continue from the same place.

Ordinary function:

```text
call -> run to completion -> return
```

Coroutine:

```text
call -> run a bit -> yield -> later resume -> run more -> yield/return
```

KiCad's interactive tools are coroutine-shaped. A routing tool, drawing tool, or selection tool
often waits for user input, yields to the UI, then resumes with the next event.

### What is a fiber?

A fiber is a stackful coroutine. It has its own stack.

That matters because a stackful coroutine can pause deep inside ordinary C++ calls without
turning every caller into a callback or Promise. From the C++ side it can still look synchronous.

In this repo, KiCad's `libcontext` shim maps KiCad coroutines to Emscripten fibers:

```text
KiCad COROUTINE
  -> libcontext jump_fcontext
    -> emscripten_fiber_swap
      -> Asyncify unwind/rewind
```

Each `wasm_fcontext` already has its own `asyncify_stack` buffer in
`kicad/thirdparty/libcontext/libcontext.cpp`. So the fiber half already understands the key
pattern: one context, one buffer.

### What is a trampoline?

A trampoline is a small piece of code whose job is to bounce control into another execution
context.

In Emscripten's fiber implementation, `_emscripten_fiber_swap(oldFiber, newFiber)` starts by
unwinding the old fiber. Once the unwind reaches the bottom of the JS/Wasm call boundary,
Emscripten must start the new fiber's rewind. That second half cannot happen directly from the
middle of the old fiber. It happens from `Fibers.trampoline()`.

So the rough flow is:

```text
old fiber calls emscripten_fiber_swap(old, new)
  -> old stack unwinds into old.asyncify_data
  -> control reaches JS boundary
  -> Fibers.trampoline() runs
  -> trampoline loads new.asyncify_data
  -> trampoline starts rewind into new fiber
```

The trampoline is needed because a fiber swap is two operations separated by the unwind reaching
the edge of the runtime:

```text
leave old stack now
enter new stack after old stack is fully saved
```

The bug-prone part is that `Fibers.trampoline()` has its own guard,
`Fibers.trampolineRunning`. If a rewind from inside the trampoline itself unwinds again before
the trampoline function returns, the guard can stay stuck. Then future fiber swaps set
`Fibers.nextFiber`, but the trampoline refuses to run.

### What is parking?

Parking means a context is suspended and waiting outside Wasm.

Examples:

- A modal dialog is parked while waiting for the user to press OK or Cancel.
- A clipboard read is parked while waiting for `navigator.clipboard.readText()`.
- A KiCad tool fiber is parked after yielding to another fiber.

Parked does not mean active. Many contexts can be parked at once as long as each has its own
saved stack buffer.

### What is queueing?

Queueing means "this parked context is ready to resume, but do not resume it immediately if the
runtime is in the middle of another unwind/rewind."

The queue is not a mutex that blocks all async work. A naive mutex would deadlock modal UI,
because a modal needs events to keep flowing while it is waiting.

The queue should serialize only active transitions:

```text
Allowed:
  sleep A parked
  fiber B parked
  nested loop C parked
  clipboard D parked

Not allowed:
  two calls to asyncify_start_rewind at the same instant
  a Promise wakeup directly calling doRewind while the fiber trampoline is mid-switch
```

## The problem this design solves

Today, several roads write the same global slot:

```text
handleSleep:
  Asyncify.currData = Asyncify.allocateData()

fiber swap:
  Asyncify.currData = oldFiber + 20

fiber finishContextSwitch:
  Asyncify.currData = newFiber + 20

current handleSleep shim:
  restores the sleep buffer before wakeUp
```

The current `handlesleep.js` shim is useful, but it is still local. It protects one sleep from
fiber swaps by remembering the sleep's buffer. It does not make all suspension producers obey one
state machine.

Design A says: make the local patch into a real arbiter.

## Core design

Introduce a JS object, conceptually:

```js
AsyncifyArbiter = {
  active: null,
  readyQueue: [],
  contexts: new Map(),
  transitionRunning: false,
  trampolineRunning: false,

  registerSleep(ctx) {},
  registerFiber(ctx) {},
  park(ctx) {},
  markReady(ctx, value) {},
  drain() {},
  beginUnwind(ctx) {},
  beginRewind(ctx) {},
  finishRewind(ctx) {},
  withCurrData(ctx, fn) {}
}
```

Each context has durable state:

```js
{
  id,
  kind: "sleep" | "fiber" | "nested-loop" | "main-loop",
  dataPtr,
  status: "running" | "unwinding" | "parked" | "ready" | "rewinding" | "done",
  result,
  cancel
}
```

`Asyncify.currData` becomes a derived value:

```text
When rewinding context X:
  Asyncify.currData = X.dataPtr

When unwinding context X:
  Asyncify.currData = X.dataPtr

When no transition is active:
  Asyncify.currData may be null
```

No context is allowed to rely on `Asyncify.currData` as its long-term storage.

## Hooks

### Hook 1: `Asyncify.handleSleep`

This is the road used by `EM_ASYNC_JS` functions:

- `startModal` in `wxwidgets/src/wasm/dialog.cpp`
- clipboard read/write/clear/has-text in `wxwidgets/src/wasm/clipbrd.cpp`
- font enumeration in `wxwidgets/src/wasm/fontenum.cpp`
- the nested event loop added by wx commit `c27fe8bf`, if adopted

The current shim wraps `handleSleep` and captures the allocated buffer. The arbiter would keep
that, but add explicit lifecycle state:

```text
handleSleep begins
  -> create sleep context
  -> intercept allocateData
  -> associate allocated dataPtr with the context
  -> start unwind
  -> mark context parked

Promise resolves
  -> store result on context
  -> mark context ready
  -> queue drain

drain runs when safe
  -> load context.dataPtr into Asyncify.currData
  -> start rewind
  -> doRewind(context.dataPtr)
```

Important difference from the current implementation: the Promise resolution path should not
directly call `wakeUp` if another transition is already active. It should enqueue the context and
let `drain()` decide when to resume.

### Hook 2: `_emscripten_fiber_swap`

The fiber path already has per-fiber buffers. The arbiter should not allocate new buffers for
fibers. It should track them.

Current idea:

```text
oldFiber data = oldFiber + 20
newFiber data = newFiber + 20
```

On swap from old to new:

```text
register old fiber context if unknown
register new fiber context if unknown
begin unwind of old
set Fibers.nextFiber = new
```

When the unwind reaches bottom, the arbiter owns the trampoline step:

```text
finish old unwind
queue new fiber as ready
drain
  -> begin rewind of new
```

The original Emscripten functions can still do much of the work. The key is to wrap their
critical sections so the arbiter knows which data pointer belongs to which context and can reset
guards reliably.

### Hook 3: `Fibers.trampoline`

The arbiter must own the trampoline guard.

Minimum invariant:

```js
try {
  Fibers.trampolineRunning = true;
  // process next fiber
} finally {
  Fibers.trampolineRunning = false;
}
```

But the arbiter design goes further. It treats the trampoline as part of the scheduler:

```text
maybeStopUnwind()
  -> old stack is fully saved
  -> notify arbiter that a transition completed
  -> arbiter queues the next fiber
  -> arbiter drains when safe
```

The reason this matters: if re-entered Wasm unwinds again while the trampoline is running, the
arbiter has to know that it left the trampoline in an incomplete state. A `try/finally` fixes the
guard symptom. A scheduler gives us a place to reason about the whole switch.

### Hook 4: main loop diagnostic, not necessarily main loop ownership

This is the part that caused the earlier "do not start by de-parking" comment.

The top-level `emscripten_set_main_loop(ProcessEvents, 0, 1)` throws `"unwind"` to stop C++
from returning into wx cleanup. That throw is not Asyncify. It is a special Emscripten lifetime
trick.

Design A can leave that alone if the throw happens while no Asyncify context is in flight.

So the first diagnostic is:

```text
At the moment top-level DoRun installs the main loop:
  Asyncify.state == Normal?
  Asyncify.currData == null?
  Fibers.trampolineRunning == false?
```

If yes, the throw is only a lifetime mechanism. It is not corrupting Asyncify state. Then the
arbiter can fix overlapping sleeps/fibers without touching wx app lifetime.

If no, the throw is abandoning a live Asyncify context. Then Design A is incomplete unless it
also takes ownership of the main-loop park or we de-park main.

## Why not de-park first?

De-parking means changing the top-level main loop from:

```cpp
emscripten_set_main_loop(ProcessEvents, 0, 1);
```

to:

```cpp
emscripten_set_main_loop(ProcessEvents, 0, 0);
```

The `0` version does not throw. It returns normally. That sounds cleaner for Asyncify.

But it has a cost: after `DoRun()` returns, wx thinks the app is done. `wxEntryReal()` continues
into cleanup:

```text
OnRun returns
  -> CallOnExit destructor runs wxTheApp->OnExit()
  -> wxEntryCleanupReal deletes windows and wxTheApp
  -> Emscripten rAF main loop is still alive
  -> next tick touches deleted app/window state
```

So de-parking is not just a one-line Asyncify fix. It is an application lifetime redesign.

That is why Design A starts with the arbiter and the diagnostic. If the top-level throw is not
orphaning a live buffer, de-parking is avoidable. If the diagnostic proves the throw is
orphaning a live buffer, then de-parking becomes part of the solution, not a speculative first
move.

## Queueing model

The queue should be cooperative and explicit:

```js
function markReady(ctx, result) {
  ctx.result = result;
  ctx.status = "ready";
  readyQueue.push(ctx);
  scheduleDrain();
}

function scheduleDrain() {
  if (drainScheduled) return;
  drainScheduled = true;
  setTimeout(drain, 0);
}

function drain() {
  drainScheduled = false;

  if (transitionRunning) return;
  if (Asyncify.state !== Asyncify.State.Normal) return;
  if (Fibers.trampolineRunning) return;
  if (!readyQueue.length) return;

  const ctx = readyQueue.shift();
  transitionRunning = true;

  try {
    beginRewind(ctx);
  } finally {
    // This may not run immediately if beginRewind re-enters Wasm and unwinds.
    // Therefore the real implementation must pair this with explicit callbacks
    // from stop_rewind/maybeStopUnwind, not rely only on JS finally.
  }
}
```

The subtle point: queueing must understand that `doRewind()` can re-enter Wasm and trigger
another unwind before returning. A plain JS queue is not enough unless the arbiter also receives
transition completion signals.

## Flow: modal dialog plus tool fiber

Current bad flow:

```text
ShowModal starts handleSleep
  -> currData = modalBuffer
  -> modal parked

modal's JS pump calls ProcessEvents
  -> tool fiber swaps
  -> currData = fiberBuffer

modal Promise resolves
  -> handleSleep rewinds currData
  -> currData is wrong
  -> crash or wrong rewind
```

Arbiter flow:

```text
ShowModal starts handleSleep
  -> modal context dataPtr = modalBuffer
  -> modal context parked

modal's JS pump calls ProcessEvents
  -> fiber context old/new dataPtr tracked
  -> fiber transitions complete
  -> currData may change transiently

modal Promise resolves
  -> modal context marked ready
  -> drain waits until no active transition
  -> currData = modalContext.dataPtr
  -> modal rewinds using modalBuffer
```

`currData` can be overwritten during the wait. It no longer matters because the durable pointer
lives in the context record.

## Flow: long clipboard read plus fiber swap

The clipboard `IsSupported()` path is unpleasant because it can park for two seconds on a
permission-gated `readText()`.

With the arbiter:

```text
clipboard sleep parks with dataPtr C
fiber swap parks/resumes with dataPtr F
clipboard Promise resolves later
arbiter reloads C before clipboard rewind
```

That makes the path correct, but it does not make it good UX. We may still want a synchronous or
cached `IsSupported()` for performance and browser permission reasons. That is a separate
quality fix.

## Flow: quasi-modal nested event loop

The linked wx commit `c27fe8bf` adds a nested event loop implemented with `EM_ASYNC_JS`.

Conceptually, that creates another sleep context:

```text
DIALOG_SHIM::ShowQuasiModal()
  -> wxGUIEventLoop event_loop
  -> event_loop.Run()
  -> nested DoRun
  -> wxWasmRunNestedLoop()
  -> Asyncify sleep until EndQuasiModal exits it
```

Design A can support this if `wxWasmRunNestedLoop()` goes through the same `handleSleep`
arbiter.

The caution: if the nested pump catches an async `ProcessEvents` rejection and stops pumping
without resolving its Promise, the nested `DoRun()` remains parked forever. The arbiter can
make the rewind safe, but the nested loop implementation still needs a policy:

```text
on pump error:
  resolve with an error/exit code
  or reject in a controlled way
  or mark context cancelled and resume C++ through cleanup
```

It should not silently stop with no resolution.

## Invariants

The arbiter should assert these aggressively in diagnostics builds:

1. Only the arbiter writes `Asyncify.currData` during managed transitions.
2. Every parked context has a durable `dataPtr`.
3. A context may be parked without being active.
4. At most one context is `unwinding` or `rewinding`.
5. Promise resolution never directly calls `doRewind()` if another transition is active.
6. `Fibers.trampolineRunning` is reset even if re-entered Wasm unwinds.
7. A context's buffer is not freed until that context reaches `done` or `cancelled`.
8. `Asyncify.currData` may be null while contexts are parked. The context records are the truth.

## What this design does not solve by itself

### It does not remove the top-level `throw "unwind"`

If the top-level main-loop throw is clean, that is fine. If it abandons a live Asyncify context,
the arbiter cannot recover perfectly after the fact because the throw bypasses Asyncify
bookkeeping.

That is why the diagnostic matters.

### It does not make arbitrary nested C stacks possible

Raw nested `handleSleep` on the same C stack is still not a thing Asyncify can magically support.
If function `f()` is parked and function `g()` inside the same live stack tries to park
independently, there is only one actual stack. To have independent suspension, `f` and `g` must
be on separate stacks/fibers or be parked as one combined context.

The arbiter prevents buffer loss. It does not violate stack physics.

### It does not remove browser permission latency

A correct two-second clipboard read is still a two-second clipboard read. Correctness and UX are
separate.

## Implementation sketch

Stage 1: observation only.

- Add diagnostics around `handleSleep`, `_emscripten_fiber_swap`, `Fibers.trampoline`,
  `maybeStopUnwind`, and the first rAF tick.
- Log context ids, data pointers, states, queue length, and trampoline guard.
- Confirm whether the top-level main-loop throw happens with clean Asyncify state.

Stage 2: make sleeps context-owned.

- Promote `handlesleep.js` from "restore captured pointer" to "register sleep context".
- Store sleep data pointer in context.
- Queue Promise wakeups through `drain()` instead of direct immediate rewind when unsafe.

Stage 3: make fibers context-owned.

- Wrap `_emscripten_fiber_swap`.
- Register fiber buffers by pointer.
- Move trampoline guard reset into arbiter invariants.
- Record old/new fiber context state around swaps.

Stage 4: unify drain.

- One drain path handles ready sleep contexts and ready fiber contexts.
- Drain only starts a rewind when `Asyncify.state` is Normal and no transition is active.

Stage 5: decide on de-parking.

- If diagnostics prove the top-level throw is clean, leave it alone.
- If not, combine the arbiter with a separate lifetime change. See Design B for the cleaner
  version of that world.

## Tests this design needs

Minimum named tests:

- `long_parked_sleep_clobbered_by_swap`
- `modal_pump_runs_fiber_then_modal_resolves`
- `fiber_swap_after_top_level_main_loop_park`
- `nested_quasi_modal_loop_exit_resumes_DoRun`
- `nested_quasi_modal_pump_error_does_not_hang`
- `clipboard_has_text_timeout_does_not_crash`
- `out_of_order_sleep_resolution`
- `fiber_trampoline_unwinds_inside_trampoline_then_next_swap_lives`

Each test should assert:

- no `index out of bounds`
- no `indirect call to null`
- no uncaught `"unwind"` rejection
- completion within a timeout
- correct returned value or dialog code

Liveness is as important as crash freedom.

## Why this is elegant enough

This design is elegant because it changes the ownership model without forcing KiCad or wxWidgets
to become async-first.

The main rule becomes:

```text
Every suspension has a context.
Every context owns its buffer.
The arbiter owns the one active transition slot.
```

That is the same shape as Emscripten fibers, TinyGo's scheduler, and other coroutine runtimes.
It respects Asyncify's real constraint: not one buffer total, but one active transition at a
time.

## Tradeoffs

Pros:

- Lowest disruption to KiCad and wxWidgets C++ APIs.
- Keeps `ShowModal()` and `ShowQuasiModal()` synchronous from KiCad's perspective.
- Can be built incrementally from the current `handlesleep.js` shim.
- Avoids app-lifetime risk unless diagnostics prove de-parking is required.

Cons:

- JS shim complexity increases.
- Still depends on Emscripten-generated runtime shapes (`handleSleep`, `Fibers.trampoline`,
  `_emscripten_fiber_swap`).
- A partial arbiter can be worse than no arbiter if some path still writes `currData` behind its
  back.
- It makes unsafe overlaps safe, but it does not automatically improve slow clipboard/font UX.

## Decision point

Choose Design A if we want the practical universal fix first.

Before implementing it, answer:

```text
At top-level main-loop installation, is Asyncify clean?
```

If yes, build the arbiter around sleeps and fibers. If no, either extend Design A to own the
main-loop lifetime too, or move toward Design B.
