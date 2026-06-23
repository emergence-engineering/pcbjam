# 06 - Design B: fiber-first async runtime

> **STATUS (2026-06-23):** Design B is **now being implemented** on Asyncify — see [`12`](12-design-b-asyncify-implementation-plan.md) (plan/phases/test-matrix) and [`13`](13-design-b-engineering-spec.md) (engineering spec/work log). The de-park ([`../wasm-exceptions/09`](../wasm-exceptions/09-event-loop-deparking-plan.md)) replaced the top-level `throw` with an Asyncify park and regressed the coroutine suite — the red scenario this design fixes. External research (Ruby-WASM, Julia-WASM, Qt-for-WASM) confirms the fiber-scheduler is the proven path.

> Goal: make the architecture conceptually cleaner by reducing the number of suspension
> primitives. Instead of having tool coroutines use fibers while modal/clipboard/font/nested loops
> use `EM_ASYNC_JS` sleeps, put every blocking-looking operation onto a fiber-like runtime and let
> one scheduler decide which stack runs next.

## Status

This is a design note, not an implementation. It is more invasive than Design A, but it is also
cleaner.

Design A says:

```text
Keep both suspension systems.
Put an arbiter in front of them.
```

Design B says:

```text
Stop having two suspension systems.
Represent every suspendable C++ activity as a scheduler context with its own stack/buffer.
```

In other words: modals, clipboard waits, font waits, quasi-modal loops, and tool coroutines all
become the same kind of thing from the runtime's point of view.

## Concepts

### Coroutine

A coroutine is code that can yield and later resume.

KiCad tools already have this shape:

```text
tool starts
  -> waits for user event
  -> yields
  -> resumes when event arrives
  -> waits again
```

The useful property is that the tool can be written in direct style. It does not have to become a
chain of callbacks.

### Stackless coroutine vs. stackful coroutine

A stackless coroutine can only suspend at explicit points in that function. JavaScript
`async`/`await` is stackless from the JS perspective: every caller must also understand Promise
control flow.

A stackful coroutine can suspend deep inside normal calls:

```text
tool()
  -> helper()
    -> dialog.ShowModal()
      -> suspend here
```

When it resumes, it continues from inside `ShowModal()` and returns normally to `helper()` and
then to `tool()`.

KiCad wants stackful behavior because a large C++ application assumes blocking APIs like
`ShowModal()` and synchronous predicates.

### Fiber

A fiber is a stackful coroutine with its own stack.

Native platforms switch fibers by saving CPU registers and the stack pointer. In WebAssembly we
cannot directly manipulate the real engine stack, so Emscripten implements fibers using
Asyncify.

The important thing: a fiber has an identity and storage.

```text
fiber A:
  C stack memory
  asyncify_data buffer
  status

fiber B:
  C stack memory
  asyncify_data buffer
  status
```

This is exactly the model we want for every independently parked operation.

### Asyncify buffer

An Asyncify buffer is where the saved Wasm stack goes when a context parks.

Think of it like a suitcase for a suspended stack:

```text
before suspend:
  live call stack is inside Wasm engine

during suspend:
  saved stack is copied into context.dataPtr

after resume:
  stack is rebuilt from context.dataPtr
```

Many suitcases may exist. Only one suitcase is being packed or unpacked at any instant.

### Trampoline

A trampoline is code that transfers control from one context to another after the old context has
fully yielded.

For fibers:

```text
old fiber asks to switch to new fiber
old fiber unwinds
JS boundary is reached
trampoline rewinds new fiber
```

It is called a trampoline because control "bounces" through it. The old stack cannot directly
jump into the new stack while it is still being unwound. The trampoline is the neutral place
where the runtime can say, "old is saved, now start new."

### Scheduler

A scheduler decides which context runs next.

In a cooperative scheduler, contexts yield voluntarily. There is no preemption. That matches
browser main-thread WebAssembly well: only one thing runs at a time, and control returns to the
browser between slices.

Design B wants a scheduler like:

```text
ready queue:
  tool fiber
  modal continuation
  nested loop continuation
  clipboard continuation

running:
  exactly one context
```

## Current architecture

Today KiCad-WASM has two broad suspension families.

Family 1: fibers.

```text
KiCad tool coroutine
  -> libcontext
  -> emscripten_fiber_swap
  -> fiber-owned asyncify buffer
```

Family 2: `EM_ASYNC_JS` sleeps.

```text
wxDialog::ShowModal
clipboard read/write/hasText/clear
font enumeration
nested event loop if c27 is adopted
  -> Asyncify.handleSleep
  -> malloc-owned asyncify buffer
```

Both families eventually manipulate the same `Asyncify.currData` and `Asyncify.state`.

Design B removes that split.

## Core design

Make all blocking-looking APIs suspend the current scheduler context instead of directly using
`EM_ASYNC_JS` as an independent stack owner.

Conceptual API:

```cpp
int wxWasmAwaitModal();
char* wxWasmAwaitClipboardRead();
int wxWasmAwaitClipboardHasText();
int wxWasmAwaitNestedLoopExit();
```

Internally:

```text
current fiber/context calls await operation
  -> runtime records what JS Promise/event will wake it
  -> current context yields to scheduler/main context
  -> JS continues pumping browser events
  -> Promise/event resolves
  -> scheduler marks context ready
  -> scheduler later resumes that same context
```

From C++'s perspective, this still looks blocking:

```cpp
int result = wxWasmAwaitModal();
```

From the runtime's perspective, there is no separate `handleSleep` stack competing with fibers.
There are only scheduler contexts.

## How `ShowModal()` would work

Current model:

```text
wxDialog::ShowModal()
  -> startModal() EM_ASYNC_JS
  -> handleSleep parks the whole current C stack
  -> JS setTimeout loop calls ProcessEvents
  -> EndModal resolves Promise
  -> handleSleep rewinds the saved C stack
```

Fiber-first model:

```text
wxDialog::ShowModal()
  -> show dialog
  -> register modal wait on current context
  -> yield current context to scheduler
  -> browser/main loop keeps pumping events
  -> EndModal stores return code and marks context ready
  -> scheduler resumes context
  -> ShowModal returns int
```

There is still a suspension. The difference is ownership.

In the current model, `startModal()` creates a separate `handleSleep` suspension that can overlap
with tool fibers.

In Design B, the modal wait is a reason for the current fiber/context to yield. It does not
create a second independent suspension mechanism.

## How clipboard would work

Current model:

```text
wxClipboard::GetData()
  -> js_readTextFromClipboard() EM_ASYNC_JS
  -> handleSleep
  -> Promise waits
  -> rewind C++ stack
```

Fiber-first model:

```text
wxClipboard::GetData()
  -> start JS clipboard Promise
  -> current context yields
  -> Promise resolves with text or error
  -> scheduler resumes context
  -> GetData continues synchronously with stored result
```

This still allows the public wx API to look synchronous. But the wait is represented as "this
fiber is blocked on clipboard" instead of "handleSleep owns another Asyncify buffer."

## How quasi-modal nested loops would work

The linked wx commit `c27fe8bf` implements nested `wxGUIEventLoop::DoRun()` by adding another
`EM_ASYNC_JS` pump. That is reasonable as an incremental fix, but in Design B the nested loop is
just another scheduler wait.

Current c27-shaped model:

```text
ShowQuasiModal
  -> wxGUIEventLoop::Run()
  -> nested DoRun
  -> wxWasmRunNestedLoop() EM_ASYNC_JS
  -> setTimeout pump calls ProcessEvents
  -> EndQuasiModal resolves Promise
```

Fiber-first model:

```text
ShowQuasiModal
  -> wxGUIEventLoop::Run()
  -> nested DoRun registers "wait until this loop exits"
  -> current context yields to scheduler
  -> top-level browser loop continues pumping ProcessEvents
  -> EndQuasiModal calls loop->Exit()
  -> scheduler marks nested-loop context ready
  -> nested DoRun returns
```

No second `emscripten_set_main_loop`. No nested `handleSleep` pump. No independent Promise
rewind directly from the nested loop.

## The main loop in Design B

This is where de-parking becomes easier to understand.

The top-level Emscripten main loop currently uses:

```cpp
emscripten_set_main_loop(ProcessEvents, 0, 1);
```

The `1` means "simulate an infinite loop." Emscripten implements that by throwing `"unwind"` out
of the startup stack. This prevents `main()` and `wxEntryReal()` from returning into wx cleanup.

In Design B, the cleaner version is:

```text
main loop is also a scheduler participant
app lifetime is owned by the scheduler/browser loop
wx cleanup runs only on real exit/unload
```

That probably means eventually replacing the top-level throw with explicit lifetime ownership:

```text
startup initializes wx app
scheduler starts rAF/setTimeout event pump
startup returns without destroying wx app
real cleanup is deferred to page unload or explicit app exit
```

But this is the risky part. wx's normal contract says:

```text
OnRun returns -> app exits -> cleanup happens
```

Browser apps want:

```text
OnRun starts event pump -> app stays alive -> cleanup happens later
```

The existing `simulate_infinite_loop=1` throw is Emscripten's shortcut for that mismatch.
Design B would replace the shortcut with explicit lifetime rules.

## Why this design may need de-parking

Design B tries to make every suspension normal and scheduler-owned. A plain JS throw that
abandons the startup stack is not normal and not scheduler-owned.

So the cleanest Design B includes de-parking:

```text
no special top-level throw
no hidden abandoned C++ stack
main loop is represented as a scheduler/lifetime state
```

But de-parking must be paired with suppressing normal wx cleanup during steady-state operation.
Otherwise `wxTheApp` and top-level windows can be deleted while the browser rAF loop is still
calling `ProcessEvents()`.

That is why "de-park main" is not a trivial first patch. It belongs naturally in Design B, but it
requires an app-lifetime plan.

## Can we have separate Asyncify state for each stack?

Design B's answer is nuanced:

```text
Separate durable state per stack: yes.
Separate active Asyncify.state per stack: no, not needed.
```

Each scheduler context gets:

```text
own C stack/fiber stack
own asyncify_data buffer
own status/result/wait reason
```

But the Wasm instance still has one active transition at a time:

```text
Normal -> Unwinding -> Normal
Normal -> Rewinding -> Normal
```

That is fine. A single-threaded cooperative scheduler only needs one active transition. The
important thing is that parked contexts retain their own buffers while they are inactive.

## Why not just queue `handleSleep` calls?

Because a modal dialog must pump events while it is waiting.

A bad queue would say:

```text
modal sleep is active
do not allow any other suspension until modal resolves
```

That freezes the UI if the modal's own event pump needs to run tool callbacks or nested waits.

A good scheduler says:

```text
modal context is parked
other contexts may run
when modal resolves, resume it later when the transition slot is free
```

Design B makes that cleaner by representing all waits as scheduler waits, not arbitrary nested
`handleSleep` calls.

## Implementation approaches

There are two possible ways to implement Design B.

### B1: Fiberize wx waits on top of current libcontext

Keep the existing Emscripten fiber/libcontext machinery. Add a small runtime API:

```cpp
using WAKE_TOKEN = int;

WAKE_TOKEN wasm_begin_async_wait(...);
int wasm_yield_until(WAKE_TOKEN token);
void wasm_resolve_wait(WAKE_TOKEN token, int result);
```

Then implement modal/clipboard/font/nested-loop waits through that API.

Rough flow:

```text
C++ starts async JS operation
JS operation gets token
C++ yields current fiber/context
JS resolves token later
scheduler resumes waiting context
```

This approach keeps most of KiCad's coroutine system. The risk is making sure every caller is on
a scheduler-owned context when it tries to wait. If code on the raw main stack calls a wait, the
runtime must either fiberize the main stack first or reject with a clear diagnostic.

### B2: Make the whole app run inside a managed root fiber

Instead of only tool coroutines being fibers, start KiCad inside a root managed fiber. Then even
"main stack" waits are scheduler-owned.

Conceptual startup:

```text
JS starts runtime
runtime creates root app fiber
root app fiber calls main/wxEntry
root app fiber yields when OnRun starts browser loop
browser loop/scheduler owns future resumes
```

This is cleaner but more invasive. It makes the top-level main loop, modal waits, tool
coroutines, and nested loops all part of one runtime from the beginning.

If we were designing from scratch, this is probably the architecture. In an existing port, it is
a bigger migration.

## How this compares to Design A

| Question | Design A: JS arbiter | Design B: fiber-first runtime |
|---|---|---|
| Keeps current `EM_ASYNC_JS` waits? | Yes | Mostly no |
| Requires de-parking main? | Only if diagnostic proves needed | Probably yes for the clean version |
| Touches wx app lifetime? | Maybe | Likely |
| JS shim complexity | Medium/high | Medium |
| C++ runtime changes | Low/medium | High |
| Conceptual cleanliness | Good | Best |
| Migration risk | Lower | Higher |
| End state | Two suspension families under one arbiter | One scheduler-owned suspension family |

## Failure modes

### Code waits outside a managed context

If a blocking-looking API is called on a stack the scheduler does not own, it cannot safely yield.

Mitigation:

- initialize a root app fiber early, or
- detect unmanaged waits and abort with a diagnostic in development builds.

### Lifetime cleanup runs too early

If de-parking lets `wxEntryReal()` continue into cleanup, the app can be destroyed while the
browser loop still runs.

Mitigation:

- make browser loop own app lifetime,
- defer `OnExit()`/`wxEntryCleanupReal()` to page unload or explicit app exit,
- ensure `emscripten_cancel_main_loop()` and cleanup are ordered.

### Reentrancy bugs become visible

When waits become scheduler-managed, the browser can continue running other events while a
context is parked. That is correct, but C++ code may have assumed certain globals cannot change
while a "blocking" call is waiting.

Mitigation:

- tests for out-of-order resolution,
- clear "modal blocks this parent/window" rules,
- keep wx's modal/quasi-modal disabling semantics intact.

### Starvation

If the scheduler always resumes newly ready contexts first, an older parked context could wait
too long.

Mitigation:

- FIFO ready queue by default,
- priority only for paint/input if proven necessary,
- diagnostics for context age.

## Test matrix

Design B should pass everything Design A needs, plus root-context tests:

- app startup inside managed root fiber
- top-level main loop starts without orphaning Asyncify state
- `ShowModal()` from root context
- `ShowModal()` from tool coroutine
- `ShowQuasiModal()` from tool coroutine
- clipboard read from root context
- clipboard read from tool coroutine
- font enumeration during startup
- nested modal inside quasi-modal
- exit/unload cleanup after parked contexts exist

Each test should assert:

- no crash
- no hang
- correct return value
- app remains interactive after the wait
- cleanup does not run during steady-state main-loop pumping

## Why this is elegant

Design B is elegant because it makes the runtime model match the actual problem:

```text
KiCad is a synchronous C++ GUI app.
The browser is asynchronous.
Therefore the port needs a stackful cooperative scheduler.
```

Once we accept that, modal dialogs, clipboard operations, font enumeration, nested event loops,
and tool coroutines are not different species. They are all contexts that sometimes wait.

The universal rule becomes:

```text
No API directly owns Asyncify.
APIs ask the scheduler to park or wake contexts.
The scheduler alone performs Asyncify transitions.
```

That is the clean architecture.

## Why this may be too much as the first fix

It asks us to change more than the bug requires:

- modal implementation,
- clipboard implementation,
- font enumeration,
- nested event loops,
- possibly app startup and shutdown,
- root stack ownership.

That is a lot of surface area for a port that already has working pieces.

So the pragmatic path is often:

```text
1. Build Design A arbiter.
2. Use tests to locate remaining architectural pain.
3. Migrate high-risk waits toward Design B over time.
4. De-park/root-fiber the app only when the evidence says it is necessary or worth the cleanup.
```

## Decision point

Choose Design B if we want the clean long-term runtime architecture and are willing to touch
wx/KiCad lifetime boundaries.

Choose Design A first if we want to stabilize the current port and learn exactly which
suspension overlaps still fail.
