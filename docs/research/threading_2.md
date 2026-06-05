# Research: Asyncify + Coroutines — External Solutions, QEMU Deep Dive, and Why Alternatives Fail

This document extends `threading_1.md` with external research: how other projects solved (or failed to solve) the exact same problem, the technical details of why JSPI/WasmFX/state-machines don't help, and a deeper analysis of QEMU's working implementation vs our code.

---

## How Asyncify Works at the Instruction Level

Understanding why coroutines break Asyncify requires knowing exactly what the binary transformation does.

### The Binaryen Pass

`wasm-opt --asyncify` (implemented in `binaryen/src/passes/Asyncify.cpp`) rewrites every WASM function that can transitively reach an "async import" (a function that might suspend). It transforms each function into a three-state machine:

- **State 0 (Normal)**: Code runs as-is.
- **State 1 (Unwinding)**: Functions return immediately, saving their local variables and a call-site index into a contiguous "asyncify stack" region in linear memory.
- **State 2 (Rewinding)**: Functions are re-entered from the top. They read saved call indices to skip forward to the correct inner call, restoring locals along the way.

Two globals drive everything:
```
__asyncify_state: 0 = Normal, 1 = Unwinding, 2 = Rewinding
__asyncify_data:  pointer to the asyncify buffer for the current operation
```

### Asyncify Data Buffer Layout

Each fiber/coroutine has its own buffer (the "asyncify stack"):
```
[ptr+0]   i32: current stack position (grows upward as data is pushed)
[ptr+4]   i32: stack end (upper bound — overflow → wasm trap)
[ptr+8]   i32: rewind_id (which WASM export to re-enter during rewind)
[ptr+12]  ... actual saved data: alternating call indices + serialized locals
```

### Before/After Transformation

**Before:**
```c
void foo(int x) {
    x = x + 1;
    x = x / 2;
    bar(x);          // ← might trigger a pause
    while (x & 7) x = x + 1;
}
```

**After (pseudocode of the generated WASM):**
```c
void foo(int x) {
    if (__asyncify_state == REWINDING) {
        x = pop_from_asyncify_stack();
        call_index = pop_from_asyncify_stack();
    }

    if (__asyncify_state == NORMAL) {
        x = x + 1;
        x = x / 2;
    }

    if (__asyncify_state == NORMAL || call_index == 0) {
        bar(x);
        if (__asyncify_state == UNWINDING) {
            push_to_asyncify_stack(0);  // call index
            push_to_asyncify_stack(x);  // local
            return;                      // cooperative return
        }
    }

    if (__asyncify_state == NORMAL) {
        while (x & 7) x = x + 1;
    }
}
```

Every function in the call chain gets this treatment. During unwind, each frame saves state and returns. During rewind, each frame skips ahead to the saved call site and dives deeper.

### The Fundamental Assumption

**Asyncify assumes a single linear call stack.** The rewind mechanism works by re-entering the outermost export and replaying the call chain from the top down. This requires that the call stack at rewind time is identical to the one at unwind time.

When `jump_fcontext()` or `emscripten_fiber_swap()` switches the C stack pointer to a different region of memory, the entire call chain changes. This is fine **if and only if** the Asyncify machinery knows about it — which is what `emscripten_fiber_swap` does. Each fiber has its own asyncify buffer, so unwind saves into fiber A's buffer and rewind uses fiber B's buffer. The JS glue orchestrates which buffer is active.

**What breaks**: If code uses raw stack manipulation (like native boost.context assembly) that bypasses Asyncify entirely. Then Asyncify's bookkeeping points to a call chain that no longer exists.

### Indirect Calls Compound the Problem

Because `jump_fcontext` in non-WASM code is called through a function pointer (table call), Asyncify by default conservatively assumes any indirect call may reach an async import. This causes ALL indirect call sites to be instrumented, massively inflating code size. The workaround (`ASYNCIFY_IGNORE_INDIRECT`) skips indirect call analysis but is dangerous if any indirect call IS on the active stack during unwind.

**Sources**: [Binaryen Asyncify.cpp](https://github.com/WebAssembly/binaryen/blob/main/src/passes/Asyncify.cpp), [Alon Zakai's blog post](https://kripken.github.io/blog/wasm/2019/07/16/asyncify.html), [emscripten #8979](https://github.com/emscripten-core/emscripten/issues/8979)

---

## emscripten_fiber_t: The Correct Abstraction

Emscripten's fiber API (`<emscripten/fiber.h>`) is specifically designed to solve the problem of multiple execution stacks on top of Asyncify. Our code already uses it — the question is whether it's used correctly.

### How It Works

Each `emscripten_fiber_t` contains:
```c
typedef struct {
    void*  stack_base;      // C stack top
    void*  stack_limit;     // C stack bottom
    void*  stack_ptr;       // current C stack pointer (saved on swap)
    void (*entry)(void*);   // entry function (NULL after first call)
    void*  user_data;       // argument for entry function
    asyncify_data_t asyncify_data;  // THIS fiber's own asyncify buffer
} emscripten_fiber_t;
```

`emscripten_fiber_swap(old_fiber, new_fiber)`:
1. Triggers Asyncify unwind of the current call stack into `old_fiber->asyncify_data`
2. Switches the C stack pointer to `new_fiber->stack_ptr`
3. Either calls `new_fiber->entry` (if first entry) or triggers Asyncify rewind using `new_fiber->asyncify_data`

**Key**: Because each fiber has its own `asyncify_data`, Asyncify tracks each fiber's call stack independently. Context switches tell Asyncify "save state here, restore state there."

### The Critical Constraint

From `fiber.h` documentation:

> "If entry_func returns, the entire program will end, as if main had returned."

When the entry function returns, there's no caller to return to — the fiber was started from a swap, not a regular function call. Emscripten treats this as program exit.

### What This Means For Our Code

Our `wasm_fcontext_entry()` (libcontext.cpp:249-272) violates this constraint. After `ctx->entry(ctx->transfer_value)` returns, the function tries to swap back using a stack-local parking fiber. This is undefined behavior per the Emscripten docs.

**Sources**: [fiber.h docs](https://emscripten.org/docs/api_reference/fiber.h.html), [PR #9859](https://github.com/emscripten-core/emscripten/pull/9859), [boost.context #109](https://github.com/boostorg/context/issues/109)

---

## The "Cannot Have Multiple Async Operations in Flight" Rule

Asyncify enforces a hard invariant: only one unwind/rewind cycle can be active at any moment. The global `Asyncify.state` variable tracks this. The assertion "Cannot have multiple async operations in flight at once" fires when:

- WASM is suspended (state = unwinding or rewinding)
- A second call tries to enter the WASM module (e.g., from a JS event handler)

### Why This Matters for KiCad

When an interactive tool coroutine is suspended in `Wait()`, the fiber has been unwound and the main fiber rewound. Main is now in Normal state. A browser event fires, `ProcessEvents()` runs, finds a matching event, and resumes the coroutine via `cofunc->Resume()` — this triggers a new fiber swap. This is fine because the previous operation completed.

But consider RunMainStack: coroutine fiber → main fiber → ShowModal() → EM_ASYNC_JS suspends main. Now main's asyncify state is being managed by the EM_ASYNC_JS mechanism, AND the fiber system has its own asyncify buffers. These are separate paths but share `__asyncify_state`.

The `emscripten_fiber_swap` mechanism handles this correctly because the fiber JS glue and EM_ASYNC_JS use different code paths. But bugs in the glue code (like the dynCall no-ops) can cause state confusion.

### The `setTimeout(wakeUp, 0)` Pattern

When Asyncify.wakeUp() is called while compiled code is still on the JS call stack, it corrupts state. The fix is always to defer: `setTimeout(wakeUp, 0)` ensures the previous operation has fully unwound before starting the next rewind. Our modal dialog code uses `setTimeout(0)` twice (double-deferred) for this reason — documented in `../debugging/learning.md`.

**Sources**: [emscripten #16291](https://github.com/emscripten-core/emscripten/issues/16291), [emscripten #18412](https://github.com/emscripten-core/emscripten/issues/18412), [emscripten #10515](https://github.com/emscripten-core/emscripten/issues/10515)

---

## QEMU WASM: The Gold Standard (Deep Technical Analysis)

QEMU was compiled to WASM with working coroutines. The patch series "Enable QEMU to run on browsers" (Kohei Tokunaga, April 2025, merged upstream) is the canonical reference for this problem.

### QEMU's Coroutine Problem

QEMU's async I/O uses coroutines everywhere — disk reads, network operations, etc. On native systems, QEMU uses `coroutine-ucontext.c` (`ucontext_t` + `sigsetjmp`/`siglongjmp`). Emscripten doesn't support ucontext, so they wrote a new backend.

### The Implementation: `util/coroutine-wasm.c`

127 lines. Three functions.

**The struct:**
```c
typedef struct {
    Coroutine base;
    void *stack;                 // C stack buffer (heap-allocated, persists)
    size_t stack_size;
    void *asyncify_stack;        // Asyncify data buffer (heap-allocated, persists)
    size_t asyncify_stack_size;
    CoroutineAction action;      // Communication: YIELD, TERMINATE, etc.
    emscripten_fiber_t fiber;
} CoroutineEmscripten;
```

Both stacks are heap-allocated and persist for the coroutine's entire lifetime. No stack-local temporaries.

**The trampoline (most important part):**
```c
static void coroutine_trampoline(void *co_)
{
    Coroutine *co = co_;

    while (true) {                                    // ← NEVER returns
        co->entry(co->entry_arg);                     // Run the coroutine body
        qemu_coroutine_switch(co, co->caller,
                              COROUTINE_TERMINATE);   // Swap back to caller
    }
}
```

Walk-through:
1. `emscripten_fiber_init()` is called with `coroutine_trampoline` as entry
2. When first swapped to, `coroutine_trampoline` starts running
3. Calls `co->entry(co->entry_arg)` — the actual I/O handler
4. Handler may yield many times (each yield does fiber_swap back to caller, resume does fiber_swap back)
5. Handler finishes and returns
6. `coroutine_trampoline` resumes after the `co->entry()` line
7. Calls `qemu_coroutine_switch(co, co->caller, COROUTINE_TERMINATE)` — swaps back with "done" flag
8. `while(true)` loops. If nobody swaps back, stays suspended forever (fiber freed later)
9. **Entry function never returns.**

**Context switch:**
```c
CoroutineAction qemu_coroutine_switch(Coroutine *from_, Coroutine *to_,
                                      CoroutineAction action)
{
    CoroutineEmscripten *from = DO_UPCAST(CoroutineEmscripten, base, from_);
    CoroutineEmscripten *to = DO_UPCAST(CoroutineEmscripten, base, to_);

    set_current(to_);
    to->action = action;
    emscripten_fiber_swap(&from->fiber, &to->fiber);
    return from->action;
}
```

Simple two-party swap. Communication via the `action` field.

**Main thread bootstrap (lazy init):**
```c
Coroutine *qemu_coroutine_self(void)
{
    Coroutine *self = get_current();
    if (!self) {
        CoroutineEmscripten *leaderp = g_malloc0(sizeof(*leaderp));
        leaderp->asyncify_stack = g_malloc0(leader_asyncify_stack_size);
        leaderp->asyncify_stack_size = leader_asyncify_stack_size;

        emscripten_fiber_init_from_current_context(
            &leaderp->fiber,
            leaderp->asyncify_stack,
            leaderp->asyncify_stack_size
        );

        set_leader(leaderp);
        self = &leaderp->base;
        set_current(self);
    }
    return self;
}
```

The main execution context is captured lazily as a fiber. Its asyncify stack is heap-allocated.

**Cleanup:**
```c
void qemu_coroutine_delete(Coroutine *co_)
{
    CoroutineEmscripten *co = DO_UPCAST(CoroutineEmscripten, base, co_);
    qemu_free_stack(co->stack, co->stack_size);
    g_free(co->asyncify_stack);
    g_free(co);
}
```

Both stacks freed. No dangling pointers because the while(true) loop means the fiber is either suspended (waiting inside the loop) or never entered again.

### QEMU Limitation We Share

From the patch notes: "Fiber does not support submitting coroutines to other threads." QEMU disabled cross-thread coroutine operations in 9pfs for Emscripten builds. KiCad's tool coroutines are single-threaded by design, so this is not a concern.

### What QEMU Does NOT Need (That We Do)

QEMU's coroutine model is simpler than KiCad's:

| Feature | QEMU | KiCad |
|---------|------|-------|
| Context switch parties | Always 2: coroutine ↔ caller | 3 types: FROM_ROOT, FROM_ROUTINE, CONTINUE_AFTER_ROOT |
| Communication | Simple `action` enum | `INVOCATION_ARGS*` struct via `intptr_t` |
| RunMainStack (execute on main from coroutine) | Not needed | Essential for ShowModal from tools |
| Nested coroutines | Not used | Parent→child tool invocation |
| EM_ASYNC_JS nested inside fiber context | Not applicable | ShowModal inside RunMainStack |

These differences mean we can't copy QEMU verbatim. We adopt the **trampoline pattern** and **heap-only buffers**, but keep KiCad's richer invocation protocol.

**Sources**: [ktock/qemu-wasm](https://github.com/ktock/qemu-wasm), [QEMU coroutine-fiber.c patch](https://www.mail-archive.com/qemu-block@nongnu.org/msg119137.html), [PATCH 00/10](https://patchew.org/QEMU/cover.1744032780.git.ktokunaga.mail@gmail.com/)

---

## Why JSPI Does NOT Solve Our Problem

JSPI (JavaScript Promise Integration) is a WebAssembly standard (Phase 4 W3C, Chrome 137+, Firefox 139+) that works at the VM level: the JS engine intercepts Promise returns from WASM-to-JS calls and natively suspends the WASM stack. No binary transformation needed.

### How JSPI Differs from Asyncify

| | Asyncify | JSPI |
|---|---|---|
| Mechanism | Binaryen rewrites WASM binary as state machine | VM natively suspends/resumes WASM stack |
| Code size overhead | ~50% | Zero |
| Suspension speed | Serialize/deserialize all frames | ~1 microsecond |
| Where suspension happens | Inside WASM (any instrumented call) | At WASM→JS boundary only |

### Why JSPI Cannot Replace Coroutines

**1. JSPI only suspends at JS-WASM boundaries.**

A JSPI suspension happens when a WASM function calls a JS function that returns a Promise. Coroutine switches from one C++ coroutine to another (both inside WASM) do not cross a JS boundary. JSPI cannot mediate them.

```
Coroutine A ←→ Coroutine B    (intra-WASM, no JS boundary → JSPI can't help)
Main stack → JS API            (WASM→JS boundary → JSPI works here)
```

**2. No JS frames can be suspended.**

V8 enforces: JSPI cannot capture JS frames on the stack. When WASM calls JS (which calls back into WASM), only the inner WASM stack can be suspended. This means callback-heavy patterns (like our ProcessEvents loop) need careful architecture.

The error is: "trying to suspend without a WebAssembly.promising export" — which Qt also hits.

**3. Emscripten main loop incompatibility.**

`emscripten_set_main_loop()`, `emscripten_request_animation_frame_loop()`, and `emscripten_set_timeout()` invoke WASM callbacks WITHOUT wrapping them in `WebAssembly.promising()`. Those callbacks cannot be suspended by JSPI.

Qt's investigation of JSPI (`QT_EMSCRIPTEN_ASYNCIFY=2`) confirmed they hit this exact error for dialog operations. As of early 2026, Qt's JSPI support is still incomplete.

**4. Each JSPI export runs on a separate stack.**

JSPI allocates a new stack per suspended export call. Multiple outstanding JSPI suspensions (one per tool coroutine) each get their own stack. But the "switch between" semantics of cooperative coroutines (yield to scheduler → scheduler resumes specific other coroutine) doesn't map onto JSPI's Promise-based model.

### What JSPI IS Good For

Async operations that cross JS boundaries: file I/O, network requests, `sleep()`, dialog results. If KiCad's tools could be restructured to yield to JS rather than to another C++ coroutine, JSPI becomes applicable. But the current architecture — `COROUTINE::yield()` switches directly via `jump_fcontext` — has no JS boundary.

**Verdict**: JSPI could potentially replace EM_ASYNC_JS for modal dialogs (Pattern 4 in threading_1.md). It cannot replace emscripten_fiber_swap for tool coroutines (Patterns 1/2/3/7/8).

**Sources**: [V8 JSPI blog](https://v8.dev/blog/jspi), [V8 JSPI new API](https://v8.dev/blog/jspi-newapi), [emscripten #22493](https://github.com/emscripten-core/emscripten/issues/22493), [emscripten #22469](https://github.com/emscripten-core/emscripten/issues/22469), [wasm/stack-switching #49](https://github.com/WebAssembly/stack-switching/issues/49)

---

## Why WasmFX / Typed Continuations Won't Help (Yet)

WasmFX is a formal WebAssembly proposal adding native stack-switching instructions: `cont.new`, `resume`, `suspend`, `switch`, `cont.bind`. These would allow efficient, type-safe coroutine/fiber switching entirely within WASM — the "correct long-term solution."

### Status (April 2026)

**Not shipped in any browser.** Not enabled in Chrome, Firefox, or Safari. Wasmtime has partial x64-Linux-only experimental support (tracking [issue #10248](https://github.com/bytecodealliance/wasmtime/issues/10248)). The proposal has been under discussion since 2021. A reference interpreter exists, but browser shipping is not imminent.

**Verdict**: Do not plan around this. If it ships in 2027+, we can revisit. For now, Asyncify + emscripten_fiber_t is the only viable path.

**Sources**: [WasmFX site](http://wasmfx.dev/), [Stack Switching Explainer](https://github.com/WebAssembly/stack-switching/blob/main/proposals/stack-switching/Explainer.md)

---

## Qt for WebAssembly: The Closest GUI Framework Comparison

Qt is the closest analogy: large C++ GUI framework with blocking modal dialogs (`QDialog::exec()`), nested event loops (`QEventLoop::exec()`), and tools that assume synchronous behavior.

### Qt's Evolution

**Pre-6.3 (no Asyncify)**: No support for `exec()`. Forced API change to `show()` + signal/slot callbacks. Broke all sync dialog patterns.

**Qt 6.3+ with Asyncify**: Added `--enable-asyncify` build option. `QEventLoop::exec()` works by Asyncify-suspending the entire WASM module. The Qt event loop spins inside the Asyncify unwind, JS processes browser events, then Asyncify rewinds when ready.

**JSPI exploration (ongoing)**: Qt has `-feature-wasm-jspi` but as of early 2026 still hits "attempting to suspend without a WebAssembly.promising export" for dialog operations.

### Qt's Core Insight

Qt uses Asyncify not to implement cooperative C++ coroutines, but to make the **main** execution context suspendable at arbitrary call depth. The browser JS event loop becomes the "scheduler." There is no explicit coroutine switching between multiple C++ contexts.

### What Qt Has NOT Solved

Interactive tools that use cooperative coroutines (like KiCad's tool framework) are NOT something Qt needs to handle. Qt's model is signal/slot, not coroutine-based. This means Qt's experience validates Asyncify for modal dialogs but tells us nothing about the multi-fiber case.

**Sources**: [Qt WASM docs](https://doc.qt.io/qt-6/wasm.html), [Qt exec() on WASM](http://qtandeverything.blogspot.com/2019/05/exec-on-qt-webassembly.html), [QTBUG-102827](https://bugreports.qt.io/browse/QTBUG-102827)

---

## Python/Pyodide/Greenlet: The Conceptual Match

Python greenlets are stackful coroutines using `slp_switch` (similar to `jump_fcontext`) for stack switching. The Pyodide and Wasmer teams hit exactly our problem.

### Pyodide Finding

From [issue #2664](https://github.com/pyodide/pyodide/issues/2664): Hood Chatham identified a fundamental incompatibility — greenlet's `slp_switch` duplicates call stacks (like `fork()`). JSPI explicitly cannot duplicate stacks. Therefore JSPI alone is insufficient for greenlets. A `continulet` abstraction on top of WASM stack switching was needed.

### Wasmer's Greenlet Solution (2025)

Wasmer exposed runtime-level system calls (`wasix_context_create/switch/destroy`) implementing cooperative stack switching. This is specific to the Wasmer runtime, not applicable to browser WASM.

### Pyodide's `syncify()` / `runPythonSyncifying()`

Works in Chrome with JSPI or Node.js with `--experimental-wasm-stack-switching`. But requires the outer call to be wrapped in `WebAssembly.promising()` — same limitation.

### Lesson for Us

If you need N concurrently-suspended C++ coroutines that switch between each other inside WASM, neither raw Asyncify nor JSPI is sufficient alone. The `emscripten_fiber_t` API (managing one `asyncify_data` per fiber) is the correct and currently only tool. QEMU proved it works. Our implementation just has bugs.

**Sources**: [Pyodide #2664](https://github.com/pyodide/pyodide/issues/2664), [Wasmer greenlet post](https://wasmer.io/posts/greenlet-support-python-wasm)

---

## Other Real-World Examples

### WordPress Playground (PHP in WASM)

Uses Asyncify for synchronous PHP networking code. Works because PHP has a single-threaded, single-stack model. No cooperative coroutine switching inside PHP. Not comparable.

### minicoro (Single-header coroutine library)

[github.com/edubart/minicoro](https://github.com/edubart/minicoro) — a minimal C coroutine library that explicitly supports Emscripten/WASM via the fiber API. Its WASM backend is essentially a cleaner version of what we're doing in libcontext.cpp. Worth studying for patterns but doesn't add capabilities beyond what emscripten_fiber_t provides.

---

## Summary of All Approaches Evaluated

| Approach | Viability | Handles Intra-WASM Coroutines? | Handles Modal Dialogs? | Browser Support |
|----------|-----------|-------------------------------|----------------------|----------------|
| **Asyncify + emscripten_fiber_t** (current, with fixes) | **HIGH** | Yes | Yes (via EM_ASYNC_JS) | All browsers |
| JSPI | Medium | **No** — only at JS boundary | Yes | Chrome 137+, Firefox 139+ |
| WasmFX / Typed Continuations | Future | Yes (native) | Yes | **No browser support** |
| C++20 stackless coroutines | Not viable | No — only top-level suspension | N/A | N/A |
| Rewrite tools as state machines | Not viable | N/A (eliminates coroutines) | N/A | N/A |
| Raw Asyncify handleSleep | Not viable | No — can't recurse | Partial | All browsers |
| boost.context assembly for wasm32 | Impossible | N/A | N/A | N/A |

**Conclusion**: Fix the emscripten_fiber_t usage in libcontext.cpp. Everything else is either not ready, not applicable, or not viable.

---

## Concrete Bugs In Our Code (Updated From threading_1.md)

### Bug 1: Entry Function Returns (libcontext.cpp:249-272)

The `wasm_fcontext_entry()` function violates the Emscripten rule that fiber entry functions must never return. After the coroutine body finishes:
- Creates a `parking_fiber` with `emscripten_fiber_init_from_current_context()` — but the asyncify stack is stack-local (64KB on the C stack)
- Swaps from parking_fiber to return_to — the parking_fiber's asyncify state now points to stack memory that's garbage
- Falls through to `emscripten_unwind_to_js_event_loop()` — terminates ALL WASM execution

**Fix**: QEMU-style `while(true)` trampoline. Swap back using `&ctx->fiber` (heap-allocated) instead of parking fiber.

### Bug 2: Detached Epoch Kills Everything (libcontext.cpp:329-335)

In `jump_fcontext()`, after `emscripten_fiber_swap()` returns, if `old_ctx->resume_epoch == expected_resume_epoch`, the code calls `emscripten_unwind_to_js_event_loop()`. This is the "ghost resume" detection, but the response (kill everything) is disproportionate.

**Fix**: Log the ghost and return 0 instead of killing. Let the caller handle the null INVOCATION_ARGS.

### Bug 3: Parking Fiber Complexity (libcontext.cpp:152-175)

The entire parking fiber mechanism — `ensure_parking_context()`, `active_fiber()` indirection, `parking_initialized` flag, `parking_asyncify_stack` — exists to handle the case where the entry function returns. With the while(true) trampoline, this case doesn't exist. The complexity can be removed entirely.

**Fix**: Delete parking infrastructure. Always use `&ctx->fiber`.

---

## Key External References

### Emscripten Issues
- [#8979](https://github.com/emscripten-core/emscripten/issues/8979) — Coroutines broken with Asyncify (root issue)
- [#9859](https://github.com/emscripten-core/emscripten/pull/9859) — Fiber API implementation PR
- [#10515](https://github.com/emscripten-core/emscripten/issues/10515) — Asyncify repeated yield fails
- [#13302](https://github.com/emscripten-core/emscripten/issues/13302) — Bad return value with Asyncify and fibers
- [#16291](https://github.com/emscripten-core/emscripten/issues/16291) — Cannot have multiple async operations in flight
- [#20413](https://github.com/emscripten-core/emscripten/issues/20413) — C++20 coroutines + JSPI
- [#22469](https://github.com/emscripten-core/emscripten/issues/22469) — Trying to suspend JS frames with JSPI
- [#22493](https://github.com/emscripten-core/emscripten/issues/22493) — Main loop incompatible with JSPI

### Documentation
- [fiber.h docs](https://emscripten.org/docs/api_reference/fiber.h.html) — Emscripten fiber API reference
- [Asyncify docs](https://emscripten.org/docs/porting/asyncify.html) — Asyncify porting guide
- [Binaryen Asyncify.cpp](https://github.com/WebAssembly/binaryen/blob/main/src/passes/Asyncify.cpp) — Compiler pass source
- [Alon Zakai's Asyncify blog](https://kripken.github.io/blog/wasm/2019/07/16/asyncify.html) — Technical deep dive

### QEMU
- [ktock/qemu-wasm](https://github.com/ktock/qemu-wasm) — QEMU WASM repo
- [PATCH 00/10](https://patchew.org/QEMU/cover.1744032780.git.ktokunaga.mail@gmail.com/) — Patch series: Enable QEMU to run on browsers
- [coroutine-fiber.c patch](https://www.mail-archive.com/qemu-block@nongnu.org/msg119137.html) — The fiber backend

### JSPI / Stack Switching
- [V8 JSPI blog](https://v8.dev/blog/jspi) — Introduction
- [V8 JSPI new API](https://v8.dev/blog/jspi-newapi) — Updated API
- [WasmFX Explainer](https://github.com/WebAssembly/stack-switching/blob/main/proposals/stack-switching/Explainer.md)
- [Wasmtime #10248](https://github.com/bytecodealliance/wasmtime/issues/10248) — Stack switching tracking
- [JS frames constraint](https://github.com/WebAssembly/stack-switching/issues/49)

### Other Projects
- [Pyodide #2664](https://github.com/pyodide/pyodide/issues/2664) — Greenlet/stackful coroutines in WASM
- [Wasmer greenlet](https://wasmer.io/posts/greenlet-support-python-wasm) — Runtime-level solution
- [boost.context #109](https://github.com/boostorg/context/issues/109) — WASM support (not possible)
- [minicoro](https://github.com/edubart/minicoro) — Minimal C coroutine lib with WASM support
- [Qt WASM docs](https://doc.qt.io/qt-6/wasm.html)
- [Qt QTBUG-102827](https://bugreports.qt.io/browse/QTBUG-102827) — Asyncify crash
- [WordPress Playground](https://wordpress.github.io/wordpress-playground/developers/architecture/wasm-asyncify/) — PHP WASM asyncify
