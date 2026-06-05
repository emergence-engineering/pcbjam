# KiCad WASM Coroutine Deep Dive

## Why Our Use Case Is Special

### Most WASM projects don't need coroutines at all

When you think of "compile C/C++ to WebAssembly with Emscripten," the typical projects are:

- **Games** (Unity, Unreal, etc.): They have a main loop that renders frames. The game engine calls `emscripten_set_main_loop(renderFrame, 60, 0)` and Emscripten calls `renderFrame()` 60 times per second. No coroutines needed — everything is event-driven already.

- **Command-line tools** (ffmpeg, SQLite, etc.): They run, produce output, and exit. Linear execution. No coroutines.

- **Simple GUI apps**: They handle events through callbacks. Button clicked → run handler. No need to pause mid-function.

**KiCad is unusual** because its interactive tools use a **synchronous programming model** inside a coroutine:

```cpp
void PCB_TOOL::DrawLine(TOOL_EVENT& evt) {
    Point p1 = WaitForClick();  // ← PAUSES HERE, waits for user
    Point p2 = WaitForClick();  // ← PAUSES HERE again
    CreateLine(p1, p2);
}
```

This code looks simple and linear, but `WaitForClick()` can't actually block in a browser. Instead, KiCad uses a coroutine to pause the function, return control to the browser event loop, and resume later when the click arrives. This requires the ability to **save and restore the entire call stack** — which is what libcontext and fibers do.

### Very few projects need this

The number of large C/C++ applications that:
1. Were designed for desktop with coroutine-based control flow
2. Are now being ported to the browser via Emscripten
3. Need those coroutines to actually work

...is very small. QEMU is one. KiCad is another. Maybe a handful of others.

Because so few people need this, the Emscripten support for it is:
- **Functional** (the fiber API exists and works)
- **But rough around the edges** (bugs in internal code, poor documentation, edge cases not handled)
- **And under-tested** (most users never exercise these code paths)

### Emscripten's priorities

Emscripten's main user base is game engines and simple tools. Their effort goes into:
- Compilation speed
- WASM binary size
- Performance of simple programs
- SIMD, threading, memory64

The fiber/coroutine path is a niche feature. The `makeDynCall` bug persists because almost nobody hits it — the people who do (like us) work around it.

---

## Concepts From the Ground Up

### What is "The Stack"?

Every time you call a function, a new "frame" is pushed onto the call stack holding local variables, return address, and arguments.

```
main() calls drawLine() calls calculatePoint()

Stack (grows downward):
┌──────────────────┐
│ main()           │  ← local vars of main
├──────────────────┤
│ drawLine()       │  ← local vars of drawLine
├──────────────────┤
│ calculatePoint() │  ← TOP: local vars of calculatePoint
└──────────────────┘
```

**"Stack-local"** = a variable that lives in a frame. When that function returns, the frame is popped and the variable's memory becomes garbage.

### What is a Coroutine?

A function that can **pause** mid-execution and **resume** later. KiCad needs this because in a browser you can't block waiting for a mouse click (the page freezes). So a drawing tool must pause after requesting a click, let the browser run, then resume when the click arrives.

### Stackful vs Stackless

**Stackless** (C++20 `co_await`): Can only pause at the top level. If `waitForClick()` is 5 calls deep, you can't pause.

**Stackful** (KiCad): Can pause from **anywhere** in the call stack. The entire stack is saved and restored. KiCad needs this.

### What is libcontext?

A small C library (from Boost.Context) that performs context switching via three functions:

```cpp
make_fcontext(stack, size, entry_func);  // Create a new context
jump_fcontext(&old, new, value);         // Switch contexts
release_fcontext(ctx);                   // Free a context
```

On native: ~20 lines of assembly per platform (x86, ARM, etc.) that saves/loads CPU registers. On WASM: impossible natively, must be emulated.

**libcontext is NOT a separate repo.** It's a directory inside KiCad (`kicad/thirdparty/libcontext/`). Our kicad submodule points to our fork (`VV-EE/kicad-source-mirror.git`), so we already own it. No additional forking needed.

### The Full Stack of Abstractions

```
KiCad COROUTINE class  (kicad/include/tool/coroutine.h)
    ↓ calls
libcontext API  (make_fcontext / jump_fcontext)
    ↓ implemented with (on WASM)
Emscripten Fibers  (emscripten_fiber_swap)
    ↓ built on
Asyncify  (wasm-opt binary transformation)
    ↓ manipulates
WebAssembly call stack  (in the browser's WASM runtime)
```

---

## How Asyncify Actually Works

### The Core Idea

WASM doesn't let you save/restore call stacks like native assembly does. Asyncify works around this with a completely different approach: **it rewrites your WASM bytecode** so that every function can cooperatively save its state and return, then later be re-called and skip ahead to where it left off.

Two globals drive everything:
- `__asyncify_state`: 0 = Normal, 1 = Unwinding, 2 = Rewinding
- `__asyncify_data`: pointer to a buffer that holds saved state

### The Asyncify Data Buffer

Each fiber/coroutine has its own buffer (the "asyncify stack"). Layout:

```
[ptr+0]   i32: current stack position (grows upward as data is pushed)
[ptr+4]   i32: stack end (upper bound)
[ptr+8]   i32: rewind_id (which WASM export to re-enter during rewind)
[ptr+12]  ... actual saved data (call indices + serialized local variables)
```

### What the Binary Transformation Does

Asyncify (via `wasm-opt --asyncify`) rewrites every function in the WASM module. Here's a before/after:

**Before transformation:**
```c
void foo(int x) {
    x = x + 1;
    x = x / 2;
    bar(x);          // ← this call might trigger a pause
    while (x & 7) {
        x = x + 1;
    }
}
```

**After transformation (pseudocode of the generated WASM):**
```c
void foo(int x) {
    // PRELUDE: if we're rewinding, restore our saved locals
    if (__asyncify_state == REWINDING) {
        x = pop_from_asyncify_stack();          // restore x
        call_index = pop_from_asyncify_stack();  // which call site to skip to
    }

    // Normal code: skip during rewind
    if (__asyncify_state == NORMAL) {
        x = x + 1;
        x = x / 2;
    }

    // The call site: execute if normal, OR if rewinding to this specific call
    if (__asyncify_state == NORMAL || call_index == 0) {
        bar(x);

        // After the call returns: are we unwinding?
        if (__asyncify_state == UNWINDING) {
            push_to_asyncify_stack(0);    // save call index (we were at bar())
            push_to_asyncify_stack(x);    // save local variable x
            return;                        // cooperatively return up the chain
        }
    }

    // Rest of function: skip during rewind
    if (__asyncify_state == NORMAL) {
        while (x & 7) {
            x = x + 1;
        }
    }
}
```

**Key insight:** Every function in the call chain gets this treatment. During unwind, each frame saves its state and returns normally. During rewind, each frame skips ahead to the right call site and dives deeper.

### The Complete Unwind Sequence (Pause)

When something wants to pause (e.g., `emscripten_fiber_swap`):

```
1. JS sets __asyncify_state = UNWINDING (1)
2. JS sets __asyncify_data = pointer to this fiber's buffer
3. The call to emscripten_fiber_swap returns to its caller in WASM
4. The caller checks: state == UNWINDING? Yes.
   → Pushes its call index + locals to asyncify_data buffer
   → Returns to ITS caller
5. That caller checks: state == UNWINDING? Yes.
   → Same thing: push call index + locals, return
6. This cascades all the way up until the WASM export returns to JS
7. JS: all WASM frames have returned. Call asyncify_stop_unwind().
   → __asyncify_state = 0 (Normal)
8. The entire WASM call stack is gone. State is saved in the buffer.
```

### The Complete Rewind Sequence (Resume)

When something wants to resume a paused fiber:

```
1. JS sets __asyncify_state = REWINDING (2)
2. JS sets __asyncify_data = pointer to the saved fiber's buffer
3. JS calls the same WASM export function that was running before (e.g., main)
4. main() enters. Sees state == REWINDING.
   → Pops its locals from asyncify_data buffer
   → Pops its call index → skips ahead to that call site
   → Calls the function at that call site
5. That function enters. Sees state == REWINDING.
   → Same thing: pop locals, pop call index, skip ahead, call deeper
6. This continues until we reach the DEEPEST frame (the one that paused)
7. The deepest frame calls asyncify_stop_rewind()
   → __asyncify_state = 0 (Normal)
8. Execution continues normally from exactly where it paused.
```

### How `emscripten_fiber_swap` Coordinates Two Fibers

Each `emscripten_fiber_t` struct contains:
```c
typedef struct {
    void*  stack_base;      // C stack top
    void*  stack_limit;     // C stack bottom
    void*  stack_ptr;       // current C stack pointer (saved on swap)
    void (*entry)(void*);   // entry function (NULL after first call)
    void*  user_data;       // argument for entry function
    asyncify_data_t asyncify_data;  // this fiber's own asyncify buffer
} emscripten_fiber_t;
```

The swap sequence for switching from Fiber A to Fiber B:

```
Fiber A is running (state = Normal)

A calls emscripten_fiber_swap(&A, &B):
  JS side:
    1. state = Unwinding
    2. currData = A.asyncify_data  (save into A's buffer)
    3. asyncify_start_unwind(A.asyncify_data)
    4. Save A's C stack pointer into A.stack_ptr
    5. Set Fibers.nextFiber = B
    6. Return (emscripten_fiber_swap returns to caller)

  WASM side:
    7. A's call chain unwinds: each frame saves state into A.asyncify_data
    8. All WASM frames return to JS

  JS side (maybeStopUnwind):
    9. asyncify_stop_unwind()  → state = Normal
    10. Fibers.trampoline() → finishContextSwitch(B)

  finishContextSwitch(B):
    11. Restore B's C stack pointer + limits
    12. Is B.entry != NULL?  (first time entering B)
        YES → call B.entry(B.user_data)  ← this is where dynCall_vi matters!
        NO  → (B was previously paused)
              asyncify_start_rewind(B.asyncify_data)
              doRewind()  → calls the saved export, which replays B's call chain

B is now running.

Later, B calls emscripten_fiber_swap(&B, &A):
  Same process in reverse:
    - B's state is saved into B.asyncify_data
    - finishContextSwitch(A):
        A.entry == NULL → rewind into A.asyncify_data
        A's call chain replays until emscripten_fiber_swap
        emscripten_fiber_swap's "else" branch runs:
          state = Normal
          asyncify_stop_rewind()

A continues exactly where it left off.
```

### Why This Is Slow

Every context switch involves:
1. Unwinding the entire call stack (every frame saves state and returns)
2. Rewinding the entire call stack (every frame re-enters, restores state, skips ahead)

Native libcontext: save ~15 CPU registers, change stack pointer. Done in nanoseconds.
Asyncify: serialize/deserialize every frame. Documented overhead: 20-100% slowdown.

---

## The dynCall Problem

### What dynCall Functions Were

`dynCall_vi`, `dynCall_ii`, etc. were JavaScript wrapper functions for calling WASM **function pointers** from JS. Naming convention:
- `v` = void, `i` = int, `f` = float, `d` = double
- First letter = return type, rest = argument types
- `dynCall_vi(ptr, arg)` = "call the WASM function at table index `ptr` with one int `arg`, returning void"

They existed because calling a WASM function pointer from JavaScript requires:
1. Looking up the function in the `WebAssembly.Table` by index
2. Calling it with the right types

Before the WebAssembly.Table API stabilized, Emscripten generated one typed wrapper per signature used in the program.

### Why They Were Removed

Starting Emscripten 2.0.2 (August 2020), removed for performance:

The replacement is `getWasmTableEntry(index)` which directly looks up the function in the table:
```javascript
// Old way:
dynCall_vi(funcPtr, arg1);

// New way:
getWasmTableEntry(funcPtr)(arg1);
```

Benchmarks showed the new way is **60-80% faster** and produces smaller JS output.

### How Emscripten's Internal Code Uses dynCall

Emscripten's own JS library files (the runtime glue) need to call WASM function pointers too. They use a preprocessor macro called `makeDynCall`:

```javascript
// Inside Emscripten's library_async.js, library_html5.js, etc.
// This is a BUILD-TIME macro, expanded by Emscripten's preprocessor

// Old syntax (pre-2.0.9):
{{{ makeDynCall('vi') }}}(funcPtr, arg1)

// New syntax (2.0.9+):
{{{ makeDynCall('vi', 'funcPtr') }}}(arg1)
```

The difference: the old syntax doesn't tell the macro which variable holds the function pointer. The new syntax does.

### The Silent Degradation Bug

Here's what happens when the macro expands. Inside Emscripten's `parseTools.mjs`:

```javascript
function makeDynCall(sig, funcPtr) {
    if (funcPtr === undefined) {
        // OLD SYNTAX: funcPtr not provided
        if (DYNCALLS) {
            // -sDYNCALLS=1 is set: use the generated dynCall_vi function
            return `dynCall_${sig}`;
        }
        // DYNCALLS is false (default since ~2.0.3)
        // Try to find an exported dynCall_vi... it doesn't exist
        // Fall through to:
        return `((args) => {} /* a dynamic function call to signature ${sig},
          but there are no exported function pointers with that signature,
          so this path should never be taken. */)`;
    }
    // NEW SYNTAX: funcPtr provided → use getWasmTableEntry
    return `getWasmTableEntry(${funcPtr})`;
}
```

**The critical problem:** Emscripten's **own internal library files** still use the old syntax in many places. When `DYNCALLS=false` (the default), the macro generates an empty arrow function `(a1 => {})` instead of actually calling the function.

The generated comment even says *"this path should never be taken"* — but it IS taken, because the internal library files trigger it.

### What Breaks

| Location in Emscripten JS | What the no-op replaces | Effect |
|---------------------------|------------------------|--------|
| `Fibers.finishContextSwitch` | `dynCall_vi(entryPoint, userData)` | **Fiber entry function never called** — coroutines are dead |
| `_emscripten_set_main_loop` | `dynCall_v(callback)` | Main loop callback is a no-op |
| `_emscripten_async_call` | `dynCall_vi(callback, arg)` | Timer callbacks never fire |
| `___call_sighandler` | `dynCall_vi(handler, sig)` | Signal handlers are no-ops |
| `invokeEntryPoint` (pthreads) | `dynCall_ii(entry, arg)` | Thread entry never called |
| HTML5 event callbacks | `dynCall_iiii(callback, ...)` | Mouse/keyboard events ignored |

### Why `finishContextSwitch` Matters Most For Us

This is the function that runs when a fiber is being entered for the first time. The flow:

```javascript
finishContextSwitch(newFiber) {
    // ... restore C stack ...

    var entryPoint = /* read from fiber struct */;
    if (entryPoint !== 0) {
        // FIRST TIME entering this fiber: call the entry function
        var userData = /* read from fiber struct */;

        // THIS LINE is what's broken:
        {{{ makeDynCall('vi', 'entryPoint') }}}(userData);
        //
        // With old-syntax makeDynCall and DYNCALLS=false, this becomes:
        // (a1 => {})(userData);
        //
        // The entry function is NEVER CALLED.
        // The fiber "starts" but its body never runs.
    } else {
        // Subsequent entry: rewind via asyncify
        // This path works fine
    }
}
```

So: every fiber's FIRST entry goes through `dynCall_vi(entryPoint, userData)`. If that's a no-op, the coroutine body never starts. The fiber appears to start (the swap succeeds) but nothing actually happens inside it.

### What Our Fix Does

`inject-dyncall-shims.sh` does two things:

**1. Generates Asyncify-aware dynCall shims:**
```javascript
function dynCall_vi(funcPtr, arg1) {
    var func = getWasmTableEntry(funcPtr);
    // Track in Asyncify's export call stack so unwind/rewind works
    Asyncify.exportCallStack.push('dynCall_vi');
    try {
        func(arg1);
    } finally {
        if (Asyncify.currData) {
            // We're mid-unwind: set the rewind function
            Asyncify.setDataRewindFunc(Asyncify.currData);
        }
        Asyncify.exportCallStack.pop();
    }
}
```

**2. Patches the six empty arrow function patterns** to call the real shims.

### Why Not Just Use `-sDYNCALLS=1`?

You could. Unity does. But there's a subtlety:

Plain `dynCall_vi` from `-sDYNCALLS=1` is just:
```javascript
function dynCall_vi(index, a1) { getWasmTableEntry(index)(a1); }
```

It does **not** push/pop `Asyncify.exportCallStack`. That tracking is needed for Asyncify to know which WASM export to re-enter during rewind. Without it, if a fiber swap happens inside an indirect call (function pointer), Asyncify loses track of the call chain and the rewind fails.

Our shims add this tracking. That's the extra value over `-sDYNCALLS=1`.

### Is This an Emscripten Bug?

**Yes, arguably.** The problem is that Emscripten's own internal library files (`library_async.js`, `library_html5.js`, etc.) use the deprecated `makeDynCall` syntax, which silently degrades to no-ops when `DYNCALLS=false`. The generated comment says "this path should never be taken" but it's taken constantly. Worth filing as a bug.

---

## QEMU: The Gold Standard Reference

### What QEMU actually is

QEMU is a **machine emulator and virtualizer**. It lets you:
- Run an ARM Linux system on your x86 laptop
- Run Windows inside a virtual machine on Linux
- Emulate hardware for embedded development

It's one of the most important open-source infrastructure projects — it powers much of cloud computing (via KVM/QEMU).

### Why QEMU uses coroutines

QEMU's disk I/O layer uses coroutines for the same reason KiCad uses them: to write **synchronous-looking code** that actually runs asynchronously.

When QEMU needs to read from a virtual disk:
```c
void handle_disk_read(Request *req) {
    Buffer data = read_from_disk(req->sector);  // ← this might take time
    send_data_to_guest(req, data);
}
```

`read_from_disk()` might need to wait for actual I/O. Instead of blocking (which would freeze the emulator), QEMU pauses the coroutine, processes other events, and resumes when the data is ready. Exactly the same pattern as KiCad's `WaitForClick()`.

### Why QEMU was recently ported to WASM

People want to run QEMU in the browser — to provide virtual machines in web-based development environments, education tools, etc. The QEMU project accepted patches to build with Emscripten, and part of that work was making coroutines work in WASM.

### Why QEMU's solution is relevant to us

QEMU and KiCad have the **exact same problem**:
- Both are large C/C++ codebases
- Both use stackful coroutines internally
- Both need those coroutines to work when compiled to WASM
- Both use Emscripten's fiber API as the backend

QEMU's solution (`util/coroutine-wasm.c`) was:
1. Written by someone who clearly understood the Emscripten fiber API constraints
2. Reviewed by the QEMU maintainers
3. Accepted into the official QEMU repository
4. Has been running in production

It's only 127 lines. It's the cleanest, most proven reference for "how to do coroutines in Emscripten."

### QEMU's Full Implementation

Source: [github.com/qemu/qemu/blob/master/util/coroutine-wasm.c](https://github.com/qemu/qemu/blob/master/util/coroutine-wasm.c)

**The struct:**
```c
typedef struct {
    Coroutine base;              // QEMU's base coroutine type
    void *stack;                 // C stack buffer (heap-allocated)
    size_t stack_size;
    void *asyncify_stack;        // Asyncify data buffer (heap-allocated)
    size_t asyncify_stack_size;
    CoroutineAction action;      // Communication channel (YIELD, TERMINATE, etc.)
    emscripten_fiber_t fiber;    // The Emscripten fiber handle
} CoroutineEmscripten;
```

Each coroutine owns **two** heap-allocated buffers: a C stack and an asyncify stack. Both persist for the coroutine's lifetime.

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

1. A new QEMU coroutine is created for some I/O operation.
2. `emscripten_fiber_init()` is called with `coroutine_trampoline` as the entry function.
3. When the coroutine is first entered (someone swaps to it), `coroutine_trampoline` starts running.
4. It calls `co->entry(co->entry_arg)` — this is the actual I/O handler.
5. The I/O handler might pause (yield) many times while waiting for data. Each yield does a `fiber_swap` back to the caller, and each resume does a `fiber_swap` back to this coroutine. But throughout all of that, `coroutine_trampoline` is still on the stack — we're inside the `co->entry()` call.
6. Eventually the I/O handler finishes and returns.
7. `coroutine_trampoline` resumes after the `co->entry()` line.
8. It calls `qemu_coroutine_switch(co, co->caller, COROUTINE_TERMINATE)` — this swaps back to the caller with a "I'm done" flag.
9. The `while(true)` loops back to the top. If nobody ever swaps back to this coroutine, it just stays suspended here forever (which is fine — the fiber is deallocated later).
10. The entry function **never returns**. The `while(true)` guarantees it.

**Creating a coroutine:**
```c
Coroutine *qemu_coroutine_new(void)
{
    CoroutineEmscripten *co = g_malloc0(sizeof(*co));

    co->stack_size = COROUTINE_STACK_SIZE;
    co->stack = qemu_alloc_stack(&co->stack_size);

    co->asyncify_stack_size = COROUTINE_STACK_SIZE;
    co->asyncify_stack = g_malloc0(co->asyncify_stack_size);

    emscripten_fiber_init(
        &co->fiber,
        coroutine_trampoline,   // the infinite-loop entry
        &co->base,              // user_data
        co->stack, co->stack_size,
        co->asyncify_stack, co->asyncify_stack_size
    );

    return &co->base;
}
```

Both stacks are **heap-allocated** and persist for the coroutine's entire lifetime.

**Context switch:**
```c
CoroutineAction qemu_coroutine_switch(Coroutine *from_, Coroutine *to_,
                                      CoroutineAction action)
{
    CoroutineEmscripten *from = DO_UPCAST(CoroutineEmscripten, base, from_);
    CoroutineEmscripten *to = DO_UPCAST(CoroutineEmscripten, base, to_);

    set_current(to_);
    to->action = action;                              // Tell the target why
    emscripten_fiber_swap(&from->fiber, &to->fiber);  // Swap!
    return from->action;                              // Read what caller set
}
```

Communication between coroutines uses the `action` field: one side sets it before swapping, the other reads it after resuming.

**Main thread bootstrap (lazy init):**
```c
Coroutine *qemu_coroutine_self(void)
{
    Coroutine *self = get_current();
    if (!self) {
        // First call: capture the main thread as a fiber
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

Both stacks freed when coroutine destroyed. No stack-local temporaries, no abandoned frames.

### The Key Insight: Entry Function Must NEVER Return

Emscripten's fiber API has a rule: **if the fiber's entry function returns, the program terminates**. This is documented in `fiber.h`:

> "If entry_func returns, the entire program will end, as if main had returned."

Why? Because when the entry function returns, control goes... nowhere. The fiber's stack is done. There's no caller to return to (the fiber was started from a swap, not a regular function call). Emscripten handles this by treating it as program exit.

---

## How Our Implementation Compares to QEMU

### Our Code (`kicad/thirdparty/libcontext/libcontext.cpp`)

```cpp
[[noreturn]] void wasm_fcontext_entry(void* aArg)
{
    auto* ctx = static_cast<wasm_fcontext*>(aArg);

    // Step 1: Run the coroutine body
    ctx->entry(ctx->transfer_value);

    // Step 2: The coroutine body returned. We're in trouble.
    ctx->running = false;

    // Step 3: Try to swap back to the caller
    if (ctx->return_to)
    {
        // Create a TEMPORARY fiber just so we have something to swap FROM
        emscripten_fiber_t finished_ctx {};
        alignas(16) char finished_asyncify_stack[64*1024] {};
        emscripten_fiber_init_from_current_context(&finished_ctx, ...);

        // Swap to the caller. We'll never come back.
        emscripten_fiber_swap(&finished_ctx, &ctx->return_to->fiber);
    }

    // Step 4: If we get here, kill everything
    emscripten_unwind_to_js_event_loop();
}
```

The problems:

1. **Step 2 is dangerous.** The entry function returned. According to Emscripten docs, this should terminate the program. We're in undefined territory.

2. **Step 3 creates stack-local buffers.** `finished_ctx` and `finished_asyncify_stack` (64KB!) are on this function's stack. When we swap away, this stack frame is abandoned. But Asyncify's bookkeeping still holds pointers to `finished_ctx` (because `emscripten_fiber_swap` saves the asyncify state into it). If Asyncify ever tries to do anything with those pointers, it's reading garbage memory.

3. **Step 4 uses `emscripten_unwind_to_js_event_loop()`**. This function says "I'm done with all WASM execution, return to the browser event loop." It tears down the ENTIRE WASM call stack — not just this fiber, but everything. If this happens during KiCad's startup sequence, the startup dies.

### The Three Differences

| Issue | Our Code | QEMU |
|-------|----------|------|
| Entry function returns? | Yes, then handles it | Never - `while(true)` |
| Stack-local asyncify buffers? | Yes (64KB on stack) | No - all heap-allocated |
| `emscripten_unwind_to_js_event_loop`? | Yes, as fallback | Not used |

---

## How Would We Adopt QEMU's Pattern?

### The change is small

The fix is to replace our `wasm_fcontext_entry` with a QEMU-style trampoline:

**QEMU-style replacement:**
```cpp
[[noreturn]] void wasm_fcontext_entry(void* aArg)
{
    auto* ctx = static_cast<wasm_fcontext*>(aArg);

    while (true) {
        // Run the coroutine body
        ctx->entry(ctx->transfer_value);

        // Coroutine finished. Swap back to whoever started us.
        ctx->running = false;

        if (ctx->return_to) {
            ctx->return_to->transfer_value = 0;
            ctx->return_to->running = true;
            g_current_context = ctx->return_to;
            emscripten_fiber_swap(&ctx->fiber, &ctx->return_to->fiber);
            // If we're swapped back to (unlikely), the while(true) loops
        }
    }
    // We never reach here
}
```

Key differences:
1. `while(true)` ensures we never return from the entry function
2. We swap using `ctx->fiber` (the coroutine's own, heap-allocated fiber) instead of creating a stack-local temporary
3. No `emscripten_unwind_to_js_event_loop()` — we just stay in the loop

### How hard is the change?

**Maybe 15-20 lines changed** in one file (`kicad/thirdparty/libcontext/libcontext.cpp`). The architecture is already right — we use Emscripten fibers, we have a `wasm_fcontext` struct with proper fields, we have `g_current_context` tracking. The only wrong part is the entry-return handling.

The change is small but **the testing is critical**. After making it:
1. Rebuild the WASM module (`docker/build.sh`)
2. Run the PCBnew E2E test (`cd tests && npm run test:kicad -- --grep "select draw lines"`)
3. Check if toolbars now fully appear (the `tools: []` should become non-empty)
4. Check if drawing actually works

### What could go wrong?

The biggest risk is that `jump_fcontext`'s semantics don't perfectly match what KiCad's COROUTINE class expects. Specifically:

- KiCad's COROUTINE uses `jump_fcontext(&old_ctx, new_ctx, value)` where the returned `intptr_t` is a pointer to `INVOCATION_ARGS` that tells the coroutine why it was resumed (FROM_ROOT, FROM_ROUTINE, CONTINUE_AFTER_ROOT).
- If the trampoline loop doesn't correctly set the transfer value before swapping back, the caller might misinterpret why the coroutine stopped.

But this is testable — the E2E test will catch it.

---

## Verification of the Investigation Document

The original investigation document (`0001-kicad-wasm-tool-activation-investigation.md`) was reviewed and verified:

| Claim | Verdict |
|-------|---------|
| Fiber entry callback was a no-op | TRUE |
| inject-dyncall-shims.sh fixes it | TRUE |
| emscripten_fiber_swap needed in ASYNCIFY_IMPORTS | TRUE |
| Tools array is empty / startup stalls | TRUE |
| Problem is in WASM coroutine layer, not KiCad UI | TRUE (well-supported) |
| libcontext impl is "experimental / not clean" | FALSE - it's well-structured production code |
| Coroutine return is the remaining issue | PLAUSIBLE but not proven |
| KiCad investigative changes exist in files | NOT FOUND (likely already reverted) |

---

## Summary

### What's already correct
- The `wasm_fcontext` struct design
- The `make_fcontext` / `jump_fcontext` API mapping to fibers
- The `inject-dyncall-shims.sh` JS patching
- The `apply-asyncify.sh` import configuration
- The main context lazy initialization

### What needs fixing
- `wasm_fcontext_entry`: add `while(true)`, remove stack-local buffers, remove `emscripten_unwind_to_js_event_loop()`
- Dead code cleanup: delete `wasm/libcontext/` directory

### Alternative approaches considered

| Approach | Viability | Notes |
|----------|-----------|-------|
| Fix current Asyncify + fibers | HIGH | Adopt QEMU's trampoline pattern |
| JSPI (JS Promise Integration) | MEDIUM | Future Asyncify replacement, limited browser support |
| Event-driven state machines | NOT VIABLE | Rewrites every KiCad tool |
| C++20 stackless coroutines | NOT COMPATIBLE | KiCad needs stackful suspension |
| WASM Stack Switching proposal | FUTURE | Not standardized yet |

### References

- [QEMU coroutine-wasm.c](https://github.com/qemu/qemu/blob/master/util/coroutine-wasm.c) — gold standard implementation
- [Emscripten fiber.h docs](https://emscripten.org/docs/api_reference/fiber.h.html) — API reference
- [Asyncify blog post](https://kripken.github.io/blog/wasm/2019/07/16/asyncify.html) — deep technical dive
- [Binaryen Asyncify.cpp](https://github.com/WebAssembly/binaryen/blob/main/src/passes/Asyncify.cpp) — the compiler pass source
- [Fiber PR #9859](https://github.com/emscripten-core/emscripten/pull/9859) — design discussion
- [minicoro](https://github.com/edubart/minicoro) — single-header coroutine lib with WASM support
- [Issue #13302](https://github.com/emscripten-core/emscripten/issues/13302) — fiber swap return value bug
- [Issue #12733](https://github.com/emscripten-core/emscripten/issues/12733) — dynCall removal discussion
