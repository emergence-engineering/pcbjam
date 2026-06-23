# 02 — The machine: Asyncify internals and control flows

> **STATUS (2026-06-23):** the top-level `emscripten_set_main_loop(...,1)` `throw "unwind"` this doc treats as current **is gone** — it was fatal under native wasm-EH and was replaced by the Asyncify **de-park** rAF pump (`wxWasmParkMainLoop`); see [`../wasm-exceptions/09`](../wasm-exceptions/09-event-loop-deparking-plan.md). The de-park regressed the coroutine suite, and **Design B is now being built to fix it** ([`12`](12-design-b-asyncify-implementation-plan.md) + [`13`](13-design-b-engineering-spec.md)). Read below as the pre-de-park analysis (the internals are still accurate).

This is the legible model: what suspends, who owns the single slot, and exact line-by-line
control flow for the park, the hang, the crash, and **de-parking**.

---

## §0. One-paragraph model

Emscripten Asyncify has **two global registers**: `Asyncify.state`
(`Normal=0 / Unwinding=1 / Rewinding=2`) and `Asyncify.currData` (pointer to *the* save buffer).
They describe **"the single suspension currently in flight."** The runtime assumes **at most one**
suspension is live and that it **fully rewinds before the next begins.** KiCad-WASM breaks that
because **three subsystems drive those same two registers**: tool coroutines (libcontext →
`emscripten_fiber_swap`), modal dialogs + clipboard (`EM_ASYNC_JS` → `handleSleep`), and the
parked main loop. Overlap on the single slot → one context reads a buffer that is no longer its
own → crash or hang.

---

## §1. What "sleeps" and what does not

"Sleep" = an **Asyncify suspension**: the wasm stack is *unwound* into a buffer, control returns
to JS, JS runs, then the stack is *rewound*. The only wasm exports involved are
`_asyncify_start_unwind / stop_unwind / start_rewind / stop_rewind` (`pcbnew.js:15532-15538`);
**all scheduling is JS glue.** C++ never writes `currData`/`state` — it only spills/restores
locals when the JS-driven state says to.

| Call | Sleeps? | Mechanism | Where |
|---|---|---|---|
| `emscripten_fiber_swap` (tool coroutine swap) | **YES** | unwind source fiber + rewind target fiber | `pcbnew.js:11557` |
| `startModal` (`wxDialog::ShowModal`) | **YES** | `EM_ASYNC_JS` → `handleSleep`, awaits a Promise | `dialog.cpp:201` |
| `js_clipboardHasText` (old `IsSupported`) | **YES** | `EM_ASYNC_JS`, `readText()` raced vs 2 s timeout | `clipbrd.cpp:118` |
| `js_readTextFromClipboard` (paste) | **YES** | `EM_ASYNC_JS`, only on user gesture | `clipbrd.cpp:76` |
| `js_writeTextToClipboard` / `js_clearClipboard` | **YES** | `EM_ASYNC_JS` | `clipbrd.cpp:38`, `:145` |
| `js_enumerateFonts` | **YES** | `EM_ASYNC_JS` | `fontenum.cpp:33` |
| `js_isClipboardAPIAvailable` / `js_isFontAccessAPIAvailable` | **NO** | synchronous `EM_JS` capability probe | `clipbrd.cpp:29`, `fontenum.cpp:25` |
| `emscripten_async_call`, `emscripten_async_run_in_main_runtime_thread` | **NO** | timer/main-thread dispatch, not a suspend | `timer.cpp:80`, `utils.cpp:162/183` |
| `ProcessEvents` (one main-loop tick) | **NO** by itself | plain C call on a fresh stack; sleeps only if something *inside* does | `evtloop.cpp:19` |
| the rAF main-loop tick | **NO** | `requestAnimationFrame`/`setTimeout` re-enters wasm fresh each frame | `pcbnew.js:11342` |
| `emscripten_set_main_loop(...,1)` "infinite loop" | **NO** (not a sleep!) | `throw "unwind"` — a *plain JS exception*, not Asyncify | `pcbnew.js:11392` |

**The single most important correction:** the main loop's "park" is **not** an Asyncify
suspension. It is a thrown JS string. This matters enormously (§7).

The complete inventory of EM_ASYNC_JS "sleep" sites is **6**, all in `wxwidgets/src/wasm/`
(the KiCad tree has **zero** EM_ASYNC_JS / `emscripten_sleep`): `dialog.cpp:201`,
`clipbrd.cpp:38/76/118/145`, `fontenum.cpp:33`. This is why a fix can stay in the wasm layer.

---

## §2. The three suspension producers

### 2a. Tool coroutines = libcontext = emscripten fibers
KiCad runs interactive tools as coroutines (`COROUTINE` in `kicad/include/tool/coroutine.h`).
`Call`/`Resume`/`KiYield` switch stacks via `libcontext::jump_fcontext` (`coroutine.h:530`,
`:548`). On wasm, libcontext is **not** native assembly — it is a shim over emscripten fibers
(`libcontext.cpp`): `make_fcontext` → `emscripten_fiber_init` (`:287`); `jump_fcontext` →
`emscripten_fiber_swap` (`:320`). So **"a tool fiber swap" is literally `emscripten_fiber_swap`,
which drives `Asyncify.currData`/`state`.** Each `wasm_fcontext` embeds its **own** asyncify
buffer (`libcontext.cpp:98` `char asyncify_stack[64*1024]`, `ASYNCIFY_STACK_SIZE` at `:34`),
bound at `emscripten_fiber_init` (`:287`); the main stack is fiberized via
`emscripten_fiber_init_from_current_context` (`:210-212`). libcontext keeps its own
`g_current_context`, a per-context `resume_epoch` to detect "ghost resumes" (`:323`), and a
`[[noreturn]]` trampoline `wasm_fcontext_entry` (`:228`) that loops forever so a finished
coroutine swaps back instead of returning. `KICAD_DIAG_COROUTINE`
(`kicad/include/kicad_wasm_diag.h`) logs every `jump-enter / save-slot / jump-swap /
jump-resume / jump-ghost / entry-call / trampoline-swap`.

### 2b. Modal dialogs (and the old clipboard) = EM_ASYNC_JS = handleSleep
`wxDialog::ShowModal` (`dialog.cpp:245`) must *block and return an `int`* (native semantics —
hundreds of KiCad sites do `if( dlg.ShowModal()==wxID_OK )`). A browser main thread cannot
block, so `startModal` (`dialog.cpp:201`) is an `EM_ASYNC_JS` that: suspends the C++ stack via
Asyncify, runs a `setTimeout(17ms)` loop calling `ProcessEvents` so the UI stays live, and
resolves when `EndModal` (`dialog.cpp:286`) fires `Module._endModal(code)`. **The modal is,
structurally, a coroutine on `handleSleep`.** The old clipboard `IsSupported` (`clipbrd.cpp:288`)
used the same road.

### 2c. The main loop "park"
`wxGUIEventLoop::DoRun` (`evtloop.cpp:85`) ends with
`emscripten_set_main_loop(ProcessEvents, 0, /*simulate_infinite_loop=*/1)` (`:107`). Dissected
in §4 and §7.

---

## §3. The Asyncify engine (the JS glue)

### handleSleep — the EM_ASYNC_JS / sleep road (`pcbnew.js:10160`)
- First entry, `state==Normal`: call `startAsync(wakeUp)`. If `wakeUp` is not called
  synchronously, a real suspend begins (`:10219`):
  `state=Unwinding; currData = allocateData(); MainLoop.pause(); start_unwind()`.
- Promise resolves → `wakeUp(result)` (`:10169`):
  `state=Rewinding; start_rewind(currData); MainLoop.resume(); doRewind(currData)`.
  `doRewind` reads **field #8 of the buffer** to learn *which exported function to re-enter*
  (`getDataRewindFuncName`, `:10143`). **If `currData` is wrong or null here → garbage →
  `RuntimeError: index out of bounds`.**
- Re-entry at `state==Rewinding` (`:10229`): `state=Normal; stop_rewind(); free(currData);
  currData=null`.

> Asymmetry: the sleep road pauses/resumes `MainLoop` (`:10225`, `:10180`). The fiber road does
> **not** touch `MainLoop`.

### fiber swap — the coroutine road (`pcbnew.js:11557`)
```js
function _emscripten_fiber_swap(oldFiber, newFiber) {
  if (Asyncify.state === Asyncify.State.Normal) {     // leaving a fiber
    Asyncify.state = Asyncify.State.Unwinding;
    var asyncifyData = oldFiber + 20;                 // OLD fiber's embedded buffer
    Asyncify.setDataRewindFunc(asyncifyData);
    Asyncify.currData = asyncifyData;                 // <-- writes the single slot
    _asyncify_start_unwind(asyncifyData);
    Fibers.nextFiber = newFiber;                      // schedule the rewind target
  } else {                                            // landing back via rewind
    Asyncify.state = Asyncify.State.Normal;
    _asyncify_stop_rewind();
    Asyncify.currData = null;
  }
}
```
The actual rewind of the *target* is deferred to **`Fibers.trampoline`** (`pcbnew.js:11522`),
invoked from **`maybeStopUnwind`** (`:10097`) once the unwind reaches bottom
(`exportCallStack.length===0`) — `maybeStopUnwind` also `runtimeKeepalivePush()`es (`:10105`):
```js
trampoline() {
  if (!Fibers.trampolineRunning && Fibers.nextFiber) {  // GUARD
    Fibers.trampolineRunning = true;
    do { var f = Fibers.nextFiber; Fibers.nextFiber = 0;
         Fibers.finishContextSwitch(f); } while (Fibers.nextFiber);
    Fibers.trampolineRunning = false;                    // only reached if body returns
  }
}
finishContextSwitch(newFiber) {                          // the rewind half
  ... restore stack limits/pointer ...
  if (entryPoint !== 0) { Asyncify.currData = null; dynCall_vi(entryPoint, userData); } // first run
  else { var d = newFiber+20; Asyncify.currData = d; Asyncify.state = Rewinding;
         _asyncify_start_rewind(d); Asyncify.doRewind(d); }                              // resume
}
```
**Two fragilities:**
1. `finishContextSwitch` re-enters wasm (`doRewind`/`dynCall_vi`). If that re-entered code
   itself unwinds before returning, the `do/while` is abandoned with `trampolineRunning===true`
   (the reset never runs). **Every future `Fibers.trampoline()` then fails the guard** → pending
   `nextFiber` never processed → **hang.** (This is the facet the pasted `try/finally`
   "self-heal" targets.)
2. fiber buffers come from `emscripten_fiber_init`, **not** `Asyncify.allocateData`, so the
   `handlesleep.js` shim is **blind to them.**

### The #9153 shim — what `handlesleep.js` is, and where it comes from
`tests/apps/kicad/pcbnew.js` is **generated** (emscripten link, then post-processed; committed
but overwritten by every build). The handleSleep override is **not** Emscripten's — its source
of truth is **`scripts/common/shims/handlesleep.js`**, injected verbatim into `pcbnew.js` by
**`scripts/common/inject-dyncall-shims.sh`** (`cat "$SHIM_DIR/handlesleep.js" >>`) right after
the `_emscripten_fiber_swap.isAsync = true;` marker (~`pcbnew.js:11579`).

Build order (`docker/build.sh:123-156`): **link → inject-dyncall-shims.sh → apply-finalize.sh →
apply-asyncify.sh.** `inject-dyncall-shims.sh` injects, in order: (1) per-signature `dynCall_*`
bindings, (2) six inline empty-callback fixes, (3) `handlesleep.js`, (4) optional
`diagnostics.js` (only with `SHIM_DIAGNOSTICS=1` — source of the `[CLIP-DIAG]`/`[DIAG_SLEEP]` log
lines). The trampoline self-heal is **not present today.** The asyncify pass itself
(`apply-asyncify.sh`) uses imports `env.invoke_*,env.__asyncjs__*,env.emscripten_fiber_swap`
(`:33`), a large-function removelist (`:37-50`), then a `-O2` shrink pass (`:72`).

What the shim does: tag each `handleSleep` with the buffer it allocated, and in `wakeUp` restore
`Asyncify.currData = thatBuffer` right before `start_rewind`/`doRewind` — so a fiber swap that
clobbered the slot during the await doesn't make the sleep rewind the wrong buffer. **It fixes
exactly one level of nesting, and only for sleeps (not fibers).**

---

## §4. Control flow — startup, and how the loop becomes "parked"

```
run() -> doRun() -> callMain()                                   pcbnew.js:21346
  └─ entryFunction(argc,argv)  == wasmExports["__main_argc_argv"]   (C main)
       └─ wxEntry -> wxEntryReal()                                 init.cpp:464
            ├─ wxTheApp->CallOnInit()           (build UI, frames, tools…)
            │    └─ [STARTUP BURST: tool coroutines Call/Yield/Resume run here.
            │        Each is an emscripten_fiber_swap; currData churns Normal<->set<->null.
            │        These WORK because main's real C stack is on exportCallStack,
            │        so each unwind reaches bottom, trampoline fires, target rewinds.]
            ├─ class CallOnExit { ~CallOnExit(){ wxTheApp->OnExit(); } } callOnExit;  init.cpp:488
            └─ return wxTheApp->OnRun()
                 └─ MainLoop() -> wxGUIEventLoop::DoRun()           evtloop.cpp:85
                      └─ emscripten_set_main_loop(ProcessEvents,0,1) evtloop.cpp:107
                           └─ setMainLoop(...)                       pcbnew.js:11324
                                ├─ _emscripten_set_main_loop_timing(1,1)  :11387
                                │     └─ runtimeKeepalivePush(); MainLoop.running=true  :11270
                                │        (★ runtime now stays alive even if main "exits")
                                ├─ MainLoop.scheduler()  -> schedules first rAF tick
                                └─ if (simulateInfiniteLoop) throw "unwind";  :11392  <-- THE PARK
```
The `throw "unwind"` propagates **as a plain JS exception** out through every wasm frame of
`OnRun/DoRun/...` (abandoned, *not* asyncify-saved, *no* C++ destructors) up to:
```
callMain catch(e) -> handleException(e)                          pcbnew.js:21362, 1391
   └─ e == "unwind" -> return EXITSTATUS   (swallowed silently)   :1397
```
**Result of the park:**
- The native C stack of `main()` (and `wxEntryReal`/`OnRun`/`DoRun`) is **gone**.
- **`CallOnExit::~CallOnExit()` (→ `OnExit()`) and `wxEntryCleanupReal()` NEVER RUN** — the app,
  frames, and tools stay alive. *This is the entire purpose of `simulate_infinite_loop=1`.*
- The runtime stays alive purely via the keepalive counter (★). Each rAF tick re-enters wasm
  fresh through `MainLoop.runner → runIter → callUserCallback(ProcessEvents)`
  (`pcbnew.js:11342→11452→10003`) on a **brand-new C stack**. `ProcessEvents` (`evtloop.cpp:19`)
  pumps `ProcessPendingEvents` + `Paint` + every-third `ProcessIdle`, then returns. **No sleep
  in a quiet tick.**

---

## §5. Control flow — the HANG (first tool interaction after startup)

```
rAF tick -> ProcessEvents -> TOOL_MANAGER -> coroutine->Resume()/Call()
   └─ libcontext::jump_fcontext -> emscripten_fiber_swap(old,new)   currData = old+20; start_unwind
        └─ unwind propagates out of ProcessEvents …
             └─ maybeStopUnwind (exportCallStack==0?) -> Fibers.trampoline()
                  └─ finishContextSwitch(new): currData=new+20; start_rewind; doRewind(new)
                       └─ tool body runs … yields/returns … swaps back to caller …
```
Healthy idle ends with `currData == null`. The measured bug state was **`state==Normal` but
`currData != null`** — an unwind happened, its rewind was never issued; the swap parks forever;
all post-idle tool interactivity dies.

**Why the *first post-startup* swap?** Two credible mechanisms, both rooted in §4's `throw
"unwind"` (not mutually exclusive):

1. **Dangling `currData` from the abnormal teardown.** The throw abandons the C stack **without**
   running `stop_unwind/stop_rewind` or resetting the Asyncify globals. If the startup burst left
   an in-flight / half-settled fiber context at the moment `DoRun` threw, `currData` stays
   non-null into idle. The next `emscripten_fiber_swap` enters the `state==Normal` branch and
   **overwrites** `currData` with `old+20`, orphaning the dangling buffer; the orphan can never
   be rewound → hang.
2. **Stuck trampoline guard.** If a swap inside `Fibers.trampoline`'s `do/while` unwound and never
   returned (§3 fragility #1), `trampolineRunning` is stuck `true`, so the first post-startup
   swap's `nextFiber` is scheduled but the trampoline early-returns → hang.

> **Decisive diagnostic (cheap, no rebuild — JS-only):** log `Asyncify.currData`,
> `Asyncify.state`, `Fibers.trampolineRunning` at (a) the last line of `DoRun` *before* the
> throw, (b) the first rAF tick, (c) the entry of the first post-startup `emscripten_fiber_swap`.
> Compare `currData` against `g_main_context`'s buffer and any live coroutine's `fiber+20`. That
> tells you which of #1/#2 (or both) is in play — and whether a `currData` authority alone fixes
> it or de-parking is required.

---

## §6. Control flow — the CRASH (clipboard), for contrast

```
post-load idle -> (wx paste-enable / GetClipboardUTF8) -> wxClipboard::IsSupported(wxDF_TEXT)
   └─ js_clipboardHasText (EM_ASYNC_JS) -> handleSleep: currData=bufA; MainLoop.pause(); start_unwind
        └─ PARKED up to 2 s awaiting readText() (headless => always full timeout)
             ├─ during the wait a modal tears down (EndModal:5100) -> emscripten_fiber_swap
             │      └─ currData = fiberF+20      <-- clobbers bufA in the single slot
             ├─ 2nd/3rd clipboard polls stack up (log: pendingSleeps->3, one ENTER at state=2)
             └─ bufA's Promise resolves -> handleSleep wakeUp: start_rewind(currData=null/F)
                  └─ doRewind(null) -> reads garbage field#8 -> RuntimeError: index out of bounds
```
Same slot, opposite victim: a long-parked **sleep** clobbered by a **fiber swap** (crash) vs.
in §5 a **fiber swap** stranded by a dirtied slot (hang).

---

## §7. "De-parking" in finest detail

**What it means:** change `evtloop.cpp:107` to `emscripten_set_main_loop(ProcessEvents, 0,
/*simulate_infinite_loop=*/0)`. Then `setMainLoop` does **not** throw (`pcbnew.js:11391`
skipped); it **returns normally** into `DoRun`, which returns up the C++ stack. Asyncify globals
are left in the clean state ordinary C++ returns produce — removing mechanism §5#1 at the source.

**The lifecycle trap it creates (why `=1` exists):** if `DoRun` returns, the C++ unwind runs the
teardown the park was hiding:
```
DoRun returns -> OnRun returns -> wxEntryReal:
   ├─ ~CallOnExit() -> wxTheApp->OnExit()                         init.cpp:488
   └─ wxEntry -> wxEntryCleanupReal()                             init.cpp:433
        ├─ wxTheApp->CleanUp()      (deletes ALL top-level windows, pending objects)
        ├─ delete app;             (destroys wxTheApp)            init.cpp:448
        └─ DoCommonPostCleanup()
   => then C main returns => callMain: exitJS(ret, implicit=true)  pcbnew.js:21360
        └─ _proc_exit: keepRuntimeAlive()==true (keepalive ★) => does NOT abort  :1383
   => runtime KEEPS RUNNING, rAF keeps firing ProcessEvents …
        … but wxTheApp + all windows are already FREED => next tick touches freed memory
          (this is also the null-IsModal/windowClosing close crash).
```
So the runtime survives (keepalive), but the app is torn down under the still-firing loop.
**That is precisely the trap `simulate_infinite_loop=1` avoids — not by keeping the runtime
alive (the keepalive counter already does that), but purely by preventing the C++ cleanup from
running.**

**A correct de-park is therefore two coupled changes:**
1. `emscripten_set_main_loop(..., 0)` so `DoRun` returns with clean Asyncify state, **and**
2. **suppress the destructive post-`MainLoop` teardown** so the live app isn't freed. Options:
   - **(2a)** a wasm-specific `OnRun`/event-loop path whose return does *not* fall into
     `~CallOnExit`/`wxEntryCleanupReal`, with real cleanup driven from **`UnloadCallback`**
     (`app.cpp:620`, registered `:694`) on `beforeunload`.
   - **(2b)** keep `wxEntryReal` but guard `wxEntryCleanupReal`/`OnExit` to no-op while the rAF
     loop is registered (a "main loop owns lifetime" flag), deferring real cleanup to unload.
   Either way the rAF loop becomes the sole owner of app lifetime; `ScheduleExit`
   (`evtloop.cpp:40`, `emscripten_cancel_main_loop`) is the one teardown path.

**What de-parking fixes / doesn't:**
- **Fixes:** the dangling-`currData`-at-idle mechanism (§5#1) and the null-`IsModal` close crash.
- **Does not, by itself, fix:** the fundamental slot-sharing — two genuinely overlapping
  suspensions still contend for one `currData`. De-parking removes the *base occupant*; it does
  not make concurrent suspensions compose. The trampoline-guard facet (§5#2) is independent.

**Cost:** `evtloop.cpp` + `app.cpp`/`init.cpp` change → full wx rebuild + relink, touches
shutdown. A prior `CallAfter`-deferral of the call site was tried and reverted — evidence the
problem is the *abandoned-unwind topology*, not the timing of when the loop is installed.

---

## §8. Why we can't just "make the modal not sleep"

`ShowModal()` must hand KiCad a **blocking `int`** (native semantics; rewriting call sites is a
KiCad change, against policy). In a single-threaded browser the only ways to "return later from a
call that hasn't finished" are (a) block the thread — impossible, freezes the tab — or (b)
suspend the stack (Asyncify/fiber). So the modal is **necessarily** a suspension. Re-homing it
onto a fiber buys nothing (fibers are the same `currData` machine). The durable answer is to make
suspensions **compose**, i.e. fix the slot — see [`03-solutions-and-prior-art.md`](03-solutions-and-prior-art.md).
