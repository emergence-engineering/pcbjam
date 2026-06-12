# Research dossier: Asyncify `currData` contention in KiCad-WASM — the crash *and* the hang

> **This is a research/understanding document, not an implementation plan.** Its job is to
> make the whole machine legible: what suspends ("sleeps"), what doesn't, who owns the one
> global Asyncify slot, why the main loop is "parked," and exactly what "de-parking" would
> change. Fix options are listed at the very end as *options*, not steps.

All line numbers are against the currently-built artifacts:
`tests/apps/kicad/pcbnew.js` (generated JS runtime), `wxwidgets/src/wasm/*.cpp`,
`kicad/thirdparty/libcontext/libcontext.cpp`, `kicad/include/tool/coroutine.h`,
`wxwidgets/src/common/init.cpp`.

---

## 0. The one-paragraph model

Emscripten Asyncify has **two global registers**: `Asyncify.state`
(`Normal=0 / Unwinding=1 / Rewinding=2`) and `Asyncify.currData` (a pointer to *the* save
buffer). They describe **"the single suspension currently in flight."** The runtime assumes
**at most one** suspension is live and that it **fully rewinds before the next begins.**
KiCad-WASM breaks that assumption because **three independent subsystems drive those same
two registers**: tool coroutines (libcontext → `emscripten_fiber_swap`), modal dialogs +
clipboard (`EM_ASYNC_JS` → `handleSleep`), and the parked main loop. When any two overlap on
the single slot, one of them reads a buffer that no longer belongs to it. Depending on *who
clobbers whom*, you get either a **crash** (`doRewind` on a null/garbage buffer →
`index out of bounds`) or a **hang** (a swap unwinds, but its rewind is never issued, so the
target never runs). The clipboard bug and the tool-open hang are the **same disease**.

---

## 1. Vocabulary: what "sleeps" and what does not

"Sleep" here = an **Asyncify suspension**: the wasm stack is *unwound* into a buffer, control
returns to JS, JS does work, then the stack is *rewound* and execution resumes exactly where
it left off. The three primitives `_asyncify_start_unwind / stop_unwind / start_rewind /
stop_rewind` (`pcbnew.js:15532-15538`) are the only wasm exports involved; **all scheduling
is done by JS glue.** C++ never writes `currData`/`state` — it only spills/restores locals
when the JS-driven state says to.

| Call | Sleeps? | Mechanism | Where |
|---|---|---|---|
| `emscripten_fiber_swap` (tool coroutine swap) | **YES** | unwind source fiber + rewind target fiber | `pcbnew.js:11557` |
| `startModal` (`wxDialog::ShowModal`) | **YES** | `EM_ASYNC_JS` → `handleSleep`, awaits a Promise | `dialog.cpp:201` |
| `js_clipboardHasText` (old `IsSupported`) | **YES** | `EM_ASYNC_JS`, `readText()` raced vs 2 s timeout | `clipbrd.cpp:118` |
| `js_readTextFromClipboard` (paste) | **YES** | `EM_ASYNC_JS`, only on user gesture | `clipbrd.cpp` GetData |
| `js_enumerateFonts` | **YES** | `EM_ASYNC_JS` | `fontenum.cpp` |
| `js_isClipboardAPIAvailable` | **NO** | synchronous `EM_JS` capability probe | `clipbrd.cpp:29` |
| `ProcessEvents` (one main-loop tick) | **NO** by itself | plain C call on a fresh stack; only sleeps if something *inside* it does | `evtloop.cpp:19` |
| the rAF main-loop tick | **NO** | `requestAnimationFrame`/`setTimeout` re-enters wasm fresh each frame | `pcbnew.js:11342` |
| `emscripten_set_main_loop(...,1)` "infinite loop" | **NO** (not a sleep!) | `throw "unwind"` — a *plain JS exception*, not Asyncify | `pcbnew.js:11392` |

**The single most important correction:** the main loop's "park" is **not** an Asyncify
suspension. It is a thrown JS string. This matters enormously (§5).

---

## 2. The three suspension producers, in detail

### 2a. Tool coroutines = libcontext = emscripten fibers
KiCad runs interactive tools as coroutines (`COROUTINE` in `kicad/include/tool/coroutine.h`).
`Call`/`Resume`/`KiYield` switch stacks via `libcontext::jump_fcontext` (`coroutine.h:530`,
`:548`). On wasm, libcontext is **not** native assembly — it is a shim over emscripten fibers
(`libcontext.cpp`): `make_fcontext` → `emscripten_fiber_init` (`:271`); `jump_fcontext` →
`emscripten_fiber_swap` (`:320`). So **"a tool fiber swap" is literally `emscripten_fiber_swap`,
which drives `Asyncify.currData`/`state`.** libcontext keeps its own `g_current_context`,
per-context `resume_epoch` (to detect "ghost resumes" where a swap returns without anyone
swapping back, `:323`), and a `[[noreturn]]` trampoline `wasm_fcontext_entry` (`:228`) that
loops forever so a finished coroutine swaps back instead of returning (a returning fiber would
end the whole program). `KICAD_DIAG_COROUTINE` (`kicad/include/kicad_wasm_diag.h`) logs every
`jump-enter / save-slot / jump-swap / jump-resume / jump-ghost / entry-call / trampoline-swap`
— this is the trace the prior session read.

### 2b. Modal dialogs (and the old clipboard) = EM_ASYNC_JS = handleSleep
`wxDialog::ShowModal` (`dialog.cpp:245`) must *block and return an `int`* (native semantics —
hundreds of KiCad sites do `if( dlg.ShowModal()==wxID_OK )`). A browser main thread cannot
block, so `startModal` (`dialog.cpp:201`) is an `EM_ASYNC_JS` that: suspends the C++ stack via
Asyncify, runs a `setTimeout(17ms)` loop that calls `ProcessEvents` so the UI stays live, and
resolves when `EndModal` (`dialog.cpp:286`) fires `Module._endModal(code)`. **The modal is,
structurally, a coroutine implemented on `handleSleep`.** The old clipboard
`IsSupported` (`clipbrd.cpp:288`) used the same `handleSleep` road via `js_clipboardHasText`.

### 2c. The main loop "park"
`wxGUIEventLoop::DoRun` (`evtloop.cpp:85`) ends with
`emscripten_set_main_loop(ProcessEvents, 0, /*simulate_infinite_loop=*/1)` (`:107`).
Dissected fully in §4–§5.

---

## 3. The Asyncify engine (the JS glue), exactly

### handleSleep — the EM_ASYNC_JS / sleep road (`pcbnew.js:10160`)
- First entry, `state==Normal`: call `startAsync(wakeUp)`. If `wakeUp` is **not** called
  synchronously, a real suspend begins (`:10219`):
  `state=Unwinding; currData = allocateData(); MainLoop.pause(); start_unwind()`.
  → the C stack unwinds; locals spill into `currData`'s buffer.
- Promise resolves → `wakeUp(result)` (`:10169`):
  `state=Rewinding; start_rewind(currData); MainLoop.resume(); doRewind(currData)`.
  `doRewind` reads **field #8 of the buffer** to learn *which exported function to re-enter*
  (`getDataRewindFuncName`, `:10143`). **If `currData` is wrong or null here → reads garbage →
  `RuntimeError: index out of bounds`.**
- Re-entry at `state==Rewinding` (`:10229`): `state=Normal; stop_rewind(); free(currData);
  currData=null`. The slot is released.

> Note the **asymmetry**: the sleep road pauses/resumes `MainLoop` (`:10225`,`:10180`). The
> fiber road (below) does **not** touch `MainLoop`.

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
which is invoked from **`maybeStopUnwind`** (`:10097`) once the unwind reaches the bottom
(`exportCallStack.length===0`, `:10098`) — note `maybeStopUnwind` also does
`runtimeKeepalivePush()` (`:10105`) "so a rewind can be done later":
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
**Two fragilities live here:**
1. `finishContextSwitch` re-enters wasm (`doRewind`/`dynCall_vi`). If that re-entered code
   itself unwinds before returning, the `do/while` is abandoned with
   `Fibers.trampolineRunning === true` (the `:11533` reset never runs). **Every future
   `Fibers.trampoline()` then fails the guard and returns immediately** → pending `nextFiber`
   never processed → **hang.** (This is the precise facet the pasted `try/finally`
   "self-heal" addresses — it forces the guard back to `false`.)
2. fiber buffers come from `emscripten_fiber_init`, **not** `Asyncify.allocateData`, so the
   `handlesleep.js` shim (§3a) is **blind to them**.

### The #9153 shim — what `handlesleep.js` actually is (`scripts/common/shims/handlesleep.js`)
`pcbnew.js` is **generated** (emscripten link output, then post-processed; it is committed but
overwritten by every build). The handleSleep override is **not** Emscripten's — it is our
shim, **source of truth `scripts/common/shims/handlesleep.js`**, injected verbatim into
`pcbnew.js` by `scripts/common/inject-dyncall-shims.sh` (`cat "$SHIM_DIR/handlesleep.js" >>`)
right after the `_emscripten_fiber_swap.isAsync = true;` marker (lands ~`pcbnew.js:11579`).
Build order (`docker/build.sh:123-156`): **link → inject-dyncall-shims.sh → apply-finalize.sh
→ apply-asyncify.sh.** `inject-dyncall-shims.sh` injects, in order: (1) per-signature
`dynCall_*` bindings, (2) six inline empty-callback fixes, (3) `handlesleep.js`, (4) optional
`diagnostics.js` (only with `SHIM_DIAGNOSTICS=1` — the source of the `[CLIP-DIAG]`/`[DIAG_SLEEP]`
log lines). **The trampoline self-heal is not present today.**

What the shim does: tag each `handleSleep` with the buffer it allocated, and in `wakeUp`
restore `Asyncify.currData = thatBuffer` right before `start_rewind`/`doRewind` — so a fiber
swap that clobbered the slot during the await doesn't make the sleep rewind the wrong buffer.
**It fixes exactly one level of nesting** and only for sleeps (not fibers).

---

## 4. CONTROL FLOW — startup, and how the loop becomes "parked"

```
run() ─► doRun() ─► callMain()                                   pcbnew.js:21346
  └─ entryFunction(argc,argv)  == wasmExports["__main_argc_argv"]   (C main)
       └─ wxEntry ─► wxEntryReal()                                 init.cpp:464
            ├─ wxTheApp->CallOnInit()           (build UI, frames, tools…)
            │    └─ [STARTUP BURST: tool coroutines Call/Yield/Resume run here.
            │        Each is an emscripten_fiber_swap → currData churns Normal↔set↔null.
            │        These WORK because main's real C stack is on exportCallStack,
            │        so each unwind reaches bottom, trampoline fires, target rewinds.]
            ├─ class CallOnExit { ~CallOnExit(){ wxTheApp->OnExit(); } } callOnExit;  init.cpp:488
            └─ return wxTheApp->OnRun()
                 └─ MainLoop() ─► wxGUIEventLoop::DoRun()           evtloop.cpp:85
                      └─ emscripten_set_main_loop(ProcessEvents,0,1) evtloop.cpp:107
                           └─ setMainLoop(...)                       pcbnew.js:11324
                                ├─ _emscripten_set_main_loop_timing(1,1)  :11387
                                │     └─ runtimeKeepalivePush(); MainLoop.running=true  :11270
                                │        (★ runtime now stays alive even if main "exits")
                                ├─ MainLoop.scheduler()  → schedules first rAF tick
                                └─ if (simulateInfiniteLoop) throw "unwind";  :11392  ◄── THE PARK
```
The `throw "unwind"` propagates **as a plain JS exception** out through every wasm frame of
`OnRun/DoRun/...` (they are abandoned, *not* asyncify-saved, *no* C++ destructors run) up to:
```
callMain catch(e) ─► handleException(e)                          pcbnew.js:21362,1391
   └─ e == "unwind" → return EXITSTATUS   (swallowed silently)   :1397
```
**Result of the park:**
- The native C stack of `main()` (and `wxEntryReal`, `OnRun`, `DoRun`) is **gone**.
- **`CallOnExit::~CallOnExit()` (→ `OnExit()`) and `wxEntryCleanupReal()` NEVER RUN** — the
  app, frames, and tools stay alive. *This is the entire purpose of `simulate_infinite_loop=1`.*
- The runtime stays alive purely via the keepalive counter (★). Each rAF tick now re-enters
  wasm fresh through `MainLoop.runner → runIter → callUserCallback(ProcessEvents)`
  (`pcbnew.js:11342→11452→10003`) on a **brand-new C stack**. `ProcessEvents` (`evtloop.cpp:19`)
  pumps `ProcessPendingEvents` + `Paint` + every-third `ProcessIdle`, then returns; the tick
  ends; next rAF scheduled. **No sleep is involved in a quiet tick.**

---

## 5. CONTROL FLOW — the HANG (first tool interaction after startup)

A user gesture (the programmatic File→Open, or a `w` keystroke) makes `ProcessEvents` dispatch
into `TOOL_MANAGER`, which `Resume()`s a tool coroutine:
```
rAF tick ─► ProcessEvents ─► TOOL_MANAGER ─► coroutine->Resume()/Call()
   └─ libcontext::jump_fcontext ─► emscripten_fiber_swap(old,new)   currData = old+20; start_unwind
        └─ unwind propagates out of ProcessEvents …
             └─ maybeStopUnwind (exportCallStack==0?) ─► Fibers.trampoline()
                  └─ finishContextSwitch(new): currData=new+20; start_rewind; doRewind(new)
                       └─ tool body runs … yields/returns … swaps back to caller …
```
In a *healthy* world this round-trips and `currData` ends `null`. The empirical bug state the
prior session **measured at idle was `Asyncify.state==Normal` but `Asyncify.currData != null`**
— i.e. an unwind happened and **its rewind was never issued.** The swap "parks" forever; the
open never renders; *all* post-idle tool interactivity is dead (reproduced even on the
fileless `/p/mytest/eeschema` route by a `w` keystroke — so it is general, not open-specific).

**Why the *first post-startup* swap, specifically?** The two credible mechanisms (not mutually
exclusive), both rooted in §4's `throw "unwind"`:

1. **Dangling `currData` from the abnormal teardown.** The park abandons the C stack via a JS
   throw **without** running `stop_unwind/stop_rewind` or resetting the Asyncify globals. If
   the startup burst left an in-flight or half-settled fiber context at the moment `DoRun`
   threw, `currData` stays non-null into idle. The next `emscripten_fiber_swap` enters the
   `state==Normal` branch and **overwrites** `currData` with `old+20`, orphaning the dangling
   buffer; when control later needs the orphaned context, its rewind can never be issued → hang.

2. **Stuck trampoline guard.** If any swap inside `Fibers.trampoline`'s `do/while` unwound and
   never returned (§3, fragility #1), `trampolineRunning` is stuck `true`, so the first
   post-startup swap's `nextFiber` is scheduled but the trampoline early-returns and never
   rewinds it → hang.

> **Diagnostic that would disambiguate (cheap, no rebuild):** log `Asyncify.currData`,
> `Asyncify.state`, and `Fibers.trampolineRunning` (a) at the last line of `DoRun` *before* the
> throw, (b) on the first rAF tick, (c) at the entry of the first post-startup
> `emscripten_fiber_swap`. Compare `currData` against `g_main_context`'s buffer and against any
> live coroutine's `fiber+20`. That tells you which of #1/#2 (or both) is in play.

---

## 6. CONTROL FLOW — the CRASH (clipboard), for contrast

```
post-load idle ─► (wx paste-enable / GetClipboardUTF8) ─► wxClipboard::IsSupported(wxDF_TEXT)
   └─ js_clipboardHasText  (EM_ASYNC_JS) ─► handleSleep: currData=bufA; MainLoop.pause(); start_unwind
        └─ PARKED up to 2 s awaiting readText() (headless ⇒ always full timeout)
             ├─ during the wait a modal tears down (EndModal:5100) ─► emscripten_fiber_swap
             │      └─ currData = fiberF+20      ◄── clobbers bufA in the single slot
             ├─ 2nd/3rd clipboard polls stack up (log: pendingSleeps→3, one ENTER at state=2)
             └─ bufA's Promise resolves ─► handleSleep wakeUp: start_rewind(currData=null/F)
                  └─ doRewind(null) ─► reads garbage field#8 ─► RuntimeError: index out of bounds
```
Same slot, opposite victim: here a long-parked **sleep** is clobbered by a **fiber swap**
(crash); in §5 a **fiber swap** is stranded by a dangling slot left by the **park** (hang).

---

## 7. "De-parking" in finest detail — the option you hadn't seen

**What "de-park" means:** change `evtloop.cpp:107` to
`emscripten_set_main_loop(ProcessEvents, 0, /*simulate_infinite_loop=*/0)`. Then `setMainLoop`
does **not** throw (`pcbnew.js:11391` skipped); it **returns normally** into `DoRun`, which
returns up the C++ stack. The Asyncify globals are left in the clean state ordinary C++ returns
produce (no abandoned unwind), which removes mechanism §5#1 at the source.

**The lifecycle problem it creates (and why `=1` exists):** if `DoRun` returns, the unwind of
the C++ stack runs the very teardown the park was hiding:
```
DoRun returns ─► OnRun returns ─► wxEntryReal:
   ├─ ~CallOnExit() ─► wxTheApp->OnExit()                         init.cpp:488
   └─ wxEntry ─► wxEntryCleanupReal()                             init.cpp:433
        ├─ wxTheApp->CleanUp()      (deletes ALL top-level windows, pending objects)
        ├─ delete app;             (destroys wxTheApp)            init.cpp:448
        └─ DoCommonPostCleanup()
   ⇒ then C main returns ⇒ callMain: exitJS(ret, implicit=true)   pcbnew.js:21360
        └─ _proc_exit: keepRuntimeAlive()==true (keepalive ★) ⇒ does NOT abort  :1383
   ⇒ runtime KEEPS RUNNING, rAF keeps firing ProcessEvents …
        … but wxTheApp + all windows are already FREED ⇒ next tick touches freed memory
          (this is also the null-`IsModal`/`windowClosing` close-path crash).
```
So the runtime survives (keepalive), but the app is torn down underneath the still-firing main
loop. **That is precisely the trap `simulate_infinite_loop=1` avoids** — not by keeping the
runtime alive (the keepalive counter already does that), but **purely by preventing the C++
cleanup from running.**

**Therefore a correct de-park is two coupled changes, not one:**
1. `emscripten_set_main_loop(..., 0)` so `DoRun` returns with clean Asyncify state, **and**
2. **suppress the destructive post-`MainLoop` teardown** so the live app isn't freed. Options
   for (2), in ascending invasiveness:
   - **(2a)** In the wasm `wxApp`/event-loop path, make the `OnRun`→`DoRun` return *not* fall
     into `~CallOnExit`/`wxEntryCleanupReal` (e.g. a wasm-specific `OnRun` that returns through
     a path which skips cleanup), and instead run cleanup from **`UnloadCallback`**
     (`app.cpp:620`, registered `:694`) on `beforeunload`. This keeps teardown for real page
     exit and removes it from the steady state.
   - **(2b)** Keep `wxEntryReal` as-is but guard `wxEntryCleanupReal` / `OnExit` to be no-ops
     while the rAF loop is still registered (a "main loop owns lifetime" flag), deferring the
     real cleanup to unload.
   - Either way, **the rAF loop must remain the sole owner of app lifetime**; `ScheduleExit`
     (`evtloop.cpp:40`, `emscripten_cancel_main_loop`) becomes the one path that tears down.

**What de-parking does and does NOT fix:**
- **Fixes:** the dangling-`currData`-at-idle mechanism (§5#1) and the
  null-`IsModal` close crash (the teardown no longer fires under the live loop).
- **Does not, by itself, fix:** the *fundamental* slot-sharing. Two genuinely overlapping
  suspensions (a 2 s clipboard sleep crossed by a fiber swap; a modal whose nested
  `ProcessEvents` drives a tool coroutine) still contend for one `currData`. De-parking removes
  the *base occupant*; it does not make concurrent suspensions compose. The trampoline guard
  facet (§5#2) is also independent — addressed by the self-heal, not by de-parking.

**Cost:** `evtloop.cpp` + `app.cpp`/`init.cpp` lifecycle change → **full wx rebuild + relink**
(~10–15 min), and it touches app shutdown, so it needs the test matrix (§9) as a safety net.
The prior session tried a `CallAfter`-deferral of the call site first and reverted it — which
is useful evidence: deferring the *call site* didn't help, implying the problem is the
*parked-stack/abandoned-unwind topology*, not the timing of when the loop is installed.

---

## 8. Why we can't just "make the modal not sleep"

The modal must hand KiCad a **blocking `int ShowModal()`** (native semantics; rewriting the
call sites is a KiCad change, against policy). In a single-threaded browser the only ways to
"return later from a call that hasn't finished" are (a) block the thread — impossible, freezes
the tab — or (b) suspend the stack (Asyncify/fiber). So the modal is **necessarily** a
suspension. Re-homing it onto a fiber instead of `handleSleep` buys nothing (fibers are the
same `currData` machine). The only durable answer is to make suspensions **compose**, i.e. fix
the slot, not the modal.

---

## 9. How to enumerate "every possible case" as tests

A strong harness already exists: `tests/apps/standalone/coroutine*/` (nine probes:
`main/nested/nested_ex/embind/mainloop/gl/gl_pt/vcall/wxpt`) built by
`scripts/build-wasm-test.sh` via `tests/apps/Makefile.wasm` (each links with
`-sASYNCIFY=1 -sASYNCIFY_IMPORTS=['emscripten_fiber_swap']` then the same
`inject-dyncall-shims.sh`), plus `tests/e2e/coroutine-nested.spec.ts` (8 modal×fiber
scenarios) and `coroutine-pthread.spec.ts`, all asserting **no `index out of bounds`** and
polling a `SUMMARY total/passed/failed` line. Gaps: it doesn't systematically cover
*out-of-order* and *long-parked* overlaps, and it asserts crash-freedom but **not liveness**
(so it would not catch a hang).

Make it a **generated combinatorial product** and assert three outcomes per cell:

- **Primitives (cells):** `S1`=EM_ASYNC_JS sleep (modal/clipboard/font), `S2`=fiber swap (tool
  coroutine), `S3`=parked main loop, `S4`=pthread boundary.
- **Overlap shape:** none / nested-LIFO / **interleaved out-of-order** / **long-parked outer**
  (the 2 s clipboard shape). The last two are the under-tested ones.
- **Host context:** direct / rAF main-loop tick / embind dispatch / WebGL2 frame / deep stack /
  `-fexceptions` invoke wrappers.
- **Resume target:** continuation / **virtual call** (`invoke_vi→dynCall_vi`, the `vcall_repro`
  smoking gun).
- **Assert per cell:** (1) no `index out of bounds` / `indirect call to null` / `unwind`
  rejection (no crash); (2) **completes within a timeout** (no hang — the missing assertion
  today); (3) returned value correct (no silent wrong-buffer rewind).
- **Two must-add named scenarios** that pin our exact bugs deterministically:
  `long_parked_sleep_clobbered_by_swap` (the clipboard crash) and
  `fiber_swap_after_main_park` (the §5 hang — requires the harness to actually install a
  `simulate_infinite_loop=1` main loop, then swap a fiber post-park).

---

## 10. Fix options (reference only — not a plan)

Same disease, four independent levers; they compose:
- **Stage 0 — synchronous clipboard `IsSupported`** (`clipbrd.cpp`): deletes the longest-lived
  sleep (the 2 s idle read). Kills the **crash** class. Low risk, wx-layer.
- **Stage 1 — trampoline self-heal** (`try/finally` in `inject-dyncall-shims.sh`): forces
  `Fibers.trampolineRunning=false` even when a swap unwinds mid-loop. De-wedges the **guard
  facet** of the hang (§5#2). Cheap, JS-shim-only. Band-aid, not cure.
- **Stage 2 — de-park `main()`** (`evtloop.cpp` + `app.cpp`/`init.cpp`, §7): removes the
  dangling-slot base occupant (§5#1) and the close crash. The structural cure for the hang.
  Bigger; wx rebuild + lifecycle care.
- **Stage 3 — per-context `currData`** (generalize `handlesleep.js` into a real context stack
  that also tracks fiber buffers): makes overlapping suspensions compose regardless of order.
  Highest correctness/risk; only if the §9 matrix still shows overlap failures after 0–2.
- **Stage 4 — the combinatorial matrix (§9):** gates the riskier fixes.

---

## Open questions to resolve before any implementation
1. Run the §5 diagnostic — is the idle `currData` the orphaned-from-park buffer (#1), or is the
   trampoline guard stuck (#2), or both? This decides whether Stage 1 alone meaningfully helps.
2. For Stage 2, which suppression shape (2a UnloadCallback-driven cleanup vs 2b guarded
   `wxEntryCleanupReal`) is least invasive given our `wxApp`/`init.cpp` fork delta? (Check
   `scripts/kicad-diff-stats.sh` and the current wx fork divergence first.)
3. Does Stage 0 (clipboard) by itself make the load-pcb route stop hanging, or only stop
   crashing? (If the open hangs even with clipboard synchronous, Stage 2 is required, not
   optional.)