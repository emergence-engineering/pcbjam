# Research: KiCad WASM Coroutine Architecture & Nested Asyncify Bug

## TL;DR

**The bug**: `RuntimeError: index out of bounds` when a startup wizard modal closes. Happens because **`Asyncify.currData` is a single-slot global**. Our fiber-swap shim overwrites it when a tool activates inside the modal's event loop. The modal's subsequent rewind then follows a stale/mismatched call chain and crashes.

**The fix**: ~10 lines in `scripts/common/inject-dyncall-shims.sh` to wrap `Asyncify.handleSleep` so it saves its own `asyncifyData` before unwind and restores it before `doRewind`.

**Upstream status**: Documented as Emscripten [Issue #9153](https://github.com/emscripten-core/emscripten/issues/9153), marked **wontfix**. We must work around it.

---

## Conceptual Foundations

### Coroutine vs subroutine

A **subroutine** has a single entry and a single exit — runs to completion. A **coroutine** is a subroutine that can be **paused** at arbitrary points and **resumed** later.

Two flavors:

- **Stackless**: the compiler transforms the function into a state machine. Saves only locals at designated suspension points (`co_await`, `await`). Can only pause at those points, not inside arbitrary callees. C++20 coroutines, JavaScript `async`/`await`.
- **Stackful**: the coroutine owns a separate call stack. Can pause from ANY depth — even from inside library functions. Python greenlets, Boost.Context, Lua coroutines, KiCad's `COROUTINE`.

KiCad needs stackful because `WaitForClick()` is called many frames deep inside tool logic; stackless would require rewriting every tool.

### Fiber

A runtime primitive for stackful coroutines: owns its own stack, cooperatively scheduled (unlike threads which are preemptively scheduled by the OS). Native fibers swap CPU registers and the stack pointer — ~20 assembly instructions per platform.

WASM has no register access and no direct call-stack manipulation. Emscripten provides `emscripten_fiber_t` emulated on top of Asyncify.

### Asyncify

A **binary transformation** pass (Binaryen's `wasm-opt --asyncify`). It rewrites every WASM function in the module to add:

- A prelude: `if (state == REWINDING) { pop_locals(); jump to saved call site }`
- Wrapped call sites: `normal_call(); if (state == UNWINDING) { push_locals(); save_call_index(); return; }`

Three globals drive everything:
- `__asyncify_state`: 0=Normal, 1=Unwinding, 2=Rewinding
- `__asyncify_data`: pointer to current buffer
- JS-side `Asyncify.currData`: **a single-slot pointer to the currently-active async operation's buffer**

**The structural fault**: `Asyncify.currData` is a global. Emscripten assumes ONE async operation active at a time. When two overlap (EM_ASYNC_JS modal + fiber swap during its event loop), they fight over this slot.

### Layering in KiCad WASM

```
KiCad tool code (C++)
  └─ uses COROUTINE<int, TOOL_EVENT&>         [kicad/include/tool/coroutine.h]
      └─ uses libcontext::jump_fcontext        [kicad/thirdparty/libcontext/libcontext.cpp]
          └─ WASM backend: emscripten_fiber_swap
              └─ emscripten/fiber.h            [tools/emsdk/.../fiber.h]
                  └─ uses Asyncify             [wasm-opt transform]

wxWidgets uses EM_ASYNC_JS (parallel Asyncify channel):
wxDialog::ShowModal
  └─ startModal() EM_ASYNC_JS                  [wxwidgets/src/wasm/dialog.cpp]
      └─ Asyncify.handleSleep
          └─ uses the SAME Asyncify.currData
```

Two independent channels share one global. Collision guaranteed.

---

## All 8 Suspension Patterns

### Pattern 1 — Tool First Activation
Trigger: `TOOL_MANAGER::dispatchInternal()` finds a matching `Go()` transition; calls `cofunc->Call(event)`.
Mechanism: `make_fcontext(callerStub)` → `jump_fcontext` → `emscripten_fiber_swap` → (first time) `dynCall_vi(entryPoint, userData)` → `wasm_fcontext_entry(ctx)` → `callerStub` → tool method.
Status per runtime logs: **working** (multiple successful first-entries).

### Pattern 2 — RunMainStack (dialog from tool)
Tool coroutine calls `RunMainStack([&]() { dlg.ShowModal(); })` → `CALL_CONTEXT::RunMainStack` → `jump_fcontext` back to main with `CONTINUE_AFTER_ROOT` → main runs the lambda → lambda's `ShowModal` uses EM_ASYNC_JS → returns → main calls `doResume()` with `FROM_ROOT` → coroutine resumes.
The canonical "nested Asyncify" pattern at the tool level. Not yet reached in current test runs (blocked by Pattern 4 failure first).

### Pattern 3 — Tool Wait/Resume cycle
Inside a tool method:
```cpp
while (TOOL_EVENT* evt = Wait()) { process(evt); }
```
`Wait()` → `TOOL_MANAGER::ScheduleWait()` → sets `pendingWait`, calls `cofunc->KiYield()` → `jumpOut()` → `jump_fcontext` → fiber swap to main. Later, matching event → `cofunc->Resume()` → swap back. Each Wait/Resume is 2 fiber swaps (4 asyncify operations).
Status per logs: **working**.

### Pattern 4 — Standalone Modal (EM_ASYNC_JS)
`wxDialog::ShowModal()` on main stack → `startModal()` EM_ASYNC_JS → Asyncify unwinds main into global `currData` buffer → setTimeout event loop polls `ProcessEvents` every 17ms → `EndModal(code)` resolves Promise → Asyncify rewinds main → result returned.
Status: **works alone; fails when fibers run during its event loop**. This is where the current bug manifests.

### Pattern 5 — Clipboard (EM_ASYNC_JS)
`js_writeTextToClipboard`, `js_readTextFromClipboard`, etc. Async browser APIs wrapped in EM_ASYNC_JS. Same single-slot collision hazard as Pattern 4 if called while a fiber is mid-suspension.

### Pattern 6 — Font enumeration (EM_ASYNC_JS)
`js_enumerateFonts()` using Local Font Access API. Fires once at app init, typically before fibers exist. Probably safe.

### Pattern 7 — Nested/stacked tools
Two mechanisms:
- **Push/Pop**: `TOOL_MANAGER` pushes old coroutine onto stack when a new tool activates; pops back when new tool finishes.
- **FROM_ROUTINE calls**: `child.Call(parentCoroutine, value)` — no CALL_CONTEXT, no root bounce; parent resumes child, child yields back to parent directly.

Status per logs: **working**.

### Pattern 8 — Selection tool at startup
Not the blocker I originally claimed. PCB_SELECTION_TOOL is the first coroutine, but it Call/Yield/Resume cycles correctly per logs. The startup DOES progress through this pattern without stalling.

---

## The Actual Bug — Full Trace Against Source

### Step-by-step (verified against `tools/emsdk/upstream/emscripten/src/lib/libasync.js`):

```
1. JS calls wasmExports["_ZN8wxDialog9ShowModalEv"]()
   │  exportCallStack = ["_ZN8wxDialog9ShowModalEv"]
   │  Asyncify.state = Normal, currData = null
   ↓
2. WASM: startModal() is EM_ASYNC_JS
   │  compiles to: Asyncify.handleAsync(startAsync)
   │  which calls: Asyncify.handleSleep((wakeUp) => startAsync().then(wakeUp))
   │
   │  handleSleep:
   │    • allocateData() → malloc's BLOCK_A (~12 byte header + stack space)
   │    • setDataRewindFunc(BLOCK_A):
   │        bottomOfCallStack = exportCallStack[0] = "_ZN8wxDialog9ShowModalEv"
   │        rewindId = Asyncify.getCallStackId(bottomOfCallStack)
   │        HEAP32[(BLOCK_A + 8) >> 2] = rewindId   ← modal's re-entry pinned
   │    • Asyncify.currData = BLOCK_A               ← the MODAL's buffer
   │    • _asyncify_start_unwind(BLOCK_A)
   │    • WASM unwinds fully. exportCallStack → []
   │    • Asyncify.state = Normal (unwind complete, awaiting Promise)
   ↓
3. JS event loop. setTimeout(runEventLoop, 17ms) fires.
   │  ccall('ProcessEvents') pushes "ProcessEvents" to exportCallStack.
   │  WASM: ProcessEvents dispatches queued events.
   │  One of them: tool activation → cofunc->Call(event).
   │  That calls jump_fcontext → our _emscripten_fiber_swap override fires.
   ↓
4. ★★★ THE FAULT ★★★ — inject-dyncall-shims.sh line ~215:
   │
   │   if (Asyncify.state === Asyncify.State.Normal) {
   │     Asyncify.state = Asyncify.State.Unwinding;
   │     var asyncifyData = oldFiber + 20;  ← fiber's embedded asyncify_data
   │     // ... sets up __fiber_rewind_<oldFiber> stable rewind target ...
   │     Asyncify.setDataRewindFunc(asyncifyData, "__fiber_rewind_<oldFiber>");
   │     Asyncify.currData = asyncifyData;  ◄◄◄ OVERWRITES BLOCK_A
   │     _asyncify_start_unwind(asyncifyData);
   │     ...
   │   }
   │
   │  At this moment: BLOCK_A's pointer is LOST from Asyncify's view.
   │  BLOCK_A is still malloc'd; the fiber just changed the "current" slot.
   ↓
5. Fiber runs tool body, eventually swaps back. Each fiber swap again writes
   Asyncify.currData = some_fiber_buffer. Multiple fiber swaps may occur
   during the modal's event loop.
   │
   │  Asyncify.currData is now ANY of these fiber buffers, NEVER restored to BLOCK_A.
   ↓
6. User action in modal resolves it. wxDialog::EndModal(5100) is called,
   which invokes Module._endModal(5100).
   │  The Promise stored by startModal's setTimeout resolves with 5100.
   │
   │  .then(wakeUp) runs from pure JS:
   │    handleSleep's wakeUp(5100):
   │      runtimeKeepalivePop();
   │      handleSleepReturnValue = 5100;
   │      Asyncify.state = Rewinding;
   │      _asyncify_start_rewind(Asyncify.currData);   ← NOT BLOCK_A!
   │      Asyncify.doRewind(Asyncify.currData);         ← rewinds wrong buffer
   ↓
7. ★★★ THE CRASH ★★★
   │  Asyncify.currData is some fiber's buffer.
   │  rewind_id at (that fiber + 20 + 8) → name "__fiber_rewind_<fiber>"
   │  doRewind calls wasmExports["__fiber_rewind_<fiber>"]()
   │  That wrapper calls wasmExports[entryKey] = __fiber_entry_<fiber>
   │  __fiber_entry_<fiber> calls dynCall_vi(entryPoint, userData)
   │  entryPoint was set to 0 when fiber first entered (Emscripten clears it)
   │  dynCall_vi(0, ...) → getWasmTableEntry(0) → wasmTable.get(0)
   │  Binaryen's rewind then tries to replay a saved call-index chain
   │  serialized during the fiber's last unwind — but we're now inside the
   │  modal's expected context. Call indices point to wrong table entries.
   │  → RuntimeError: index out of bounds
```

### Matching evidence in log files

From `tests/logs/kicad/pcbnew/pcbnew-spec-ts-pcbnew-wasm-select-draw-lines-and-draw-on-the-board.log`:

```
[DIAG_MODAL] Modal started (Module._endModal appeared) asyncifyState=0
... (many successful fiber operations inside the modal event loop) ...
[DIAG_REWIND_FUNC] ... modalActive=true callStack=["ProcessEvents",...]
... 
EndModal: 5100
[DIAG_MODAL] EndModal called with code=5100 asyncifyState=0
[DIAG_STARTMODAL] endModal called, code=5100
[DIAG_STARTMODAL] promise resolved, result=5100
🔥 RuntimeError: index out of bounds at pcbnew.wasm:144634078
  at dynCall_vi (pcbnew.js:6525)   ← our shim
  at dynCall_vi (pcbnew.js:27816)  ← our fiber entry wrapper
  at wrapper (pcbnew.js:17788)     ← Emscripten callUserCallback
  at safeSetTimeout                ← modal's event loop
```

The double `dynCall_vi` at lines 6525 and 27816 is explained:
- Line 27816 = injected shim (bottom of `pcbnew.js`)
- Line 6525 = `Fibers.entryWrapperByFiber[fiber]` = `function() { return dynCall_vi(entryPoint, userData); }` (a fiber-specific wrapper)

Rewind enters the fiber wrapper → calls dynCall_vi with `entryPoint=0` → crash.

---

## Why The First Pass Missed This

1. **Didn't read runtime logs.** The investigation docs described "startup stalls / toolbars empty" — outdated. Current logs show the app progresses through the wizard and crashes on close. Ground truth was one file away.

2. **Treated QEMU's pattern as universal.** QEMU's while(true) trampoline fixes entry-function-returns — but `wasm_fcontext_entry`'s return path is never reached in KiCad because `callerStub` always swaps via `jumpOut`. The fix addresses a problem that doesn't occur.

3. **Didn't audit `inject-dyncall-shims.sh`.** The 350-line script contains the actual bug site (~80 lines of fiber stabilization). Without reading it carefully, couldn't see the `Asyncify.currData` overwrite without save/restore.

4. **Didn't search Emscripten issues.** Issue #9153 is a wontfix matching our failure exactly. A two-minute search would have located it.

5. **Confused historical symptom with current symptom.** Investigation docs were written before dynCall shim fixes existed. Those fixes changed the symptom from "startup stall" to "crash on modal close". Docs weren't updated.

---

## The Shim's Fiber Stabilization Layer (auditor's notes)

### Part 1: Per-signature dynCall shims
For each `dynCall_*` signature, generate a JS wrapper that:
1. Looks up the function in the WASM table
2. Pushes a per-call key (`__dyn_SIG_<funcPtr>`) onto `Asyncify.exportCallStack`
3. Calls the function
4. On return, pops the key and calls `maybeStopUnwind`

### Part 2: Empty-callback patches (6 patterns)
Emscripten 4.x generates `(a1 => {})` no-op stubs when DYNCALLS=0. Six of these are actually called:
- HTML5 event callbacks
- pthread entry
- Signal handlers
- Timer callbacks
- Main loop iterator
- **Fiber entry callback** ← critical

Each is replaced with the appropriate `dynCall_*` invocation.

### Part 3: Fiber rewind stabilization (THE BUG SITE)
Overrides three functions:
- `Asyncify.setDataRewindFunc(ptr, forcedBottomOfCallStack)` — writes a specific fiber-owned rewind ID when forced
- `Fibers.finishContextSwitch(newFiber)` — on first entry, registers `__fiber_entry_<fiber>` as a synthetic wasmExport
- `_emscripten_fiber_swap(oldFiber, newFiber)` — **this is where `Asyncify.currData` gets clobbered**

Data structures created but **never cleaned up**:
- `Fibers.rewindTargetByFiber[fiberPtr]`
- `Fibers.rewindWrapperByFiber[fiberPtr]`
- `Fibers.entryWrapperByFiber[fiberPtr]`
- `Fibers.entryKeyByFiber[fiberPtr]`
- `wasmExports["__fiber_entry_<fiberPtr>"]`, `wasmExports["__fiber_rewind_<fiberPtr>"]`

Plus `Asyncify.callStackNameToId` / `callStackIdToName` grow by one entry per unique fiber pointer.

### Secondary hazards (not causing the current crash but loaded footguns)
- **Pointer reuse collisions**: When a C++ fiber is freed and memory reused for a new fiber, the new fiber's synthetic exports overwrite the old ones at the same key. Stale references become dangling.
- **exportCallStack imbalance on ABORT**: `finally` blocks skip `pop()` when `ABORT` is set. Recoverable errors leave the stack corrupted.
- **ID map unbounded growth**: one ID per unique string forever. Long session = thousands of entries.

---

## The Fix

### Root-cause fix: wrap `Asyncify.handleSleep`

Add to `scripts/common/inject-dyncall-shims.sh`, within the fiber stabilization block:

```javascript
// Save/restore Asyncify.currData around handleSleep to survive
// fiber swaps that happen during the sleep's Promise await.
// Fixes Emscripten Issue #9153 (wontfix).
if (typeof Asyncify !== "undefined" && Asyncify.handleSleep) {
  var __originalHandleSleep = Asyncify.handleSleep.bind(Asyncify);
  Asyncify.handleSleep = function(startAsync) {
    return __originalHandleSleep(function(wakeUp) {
      // This function runs inside handleSleep AFTER allocateData and
      // setDataRewindFunc have set Asyncify.currData to THIS sleep's buffer.
      var myAsyncifyData = Asyncify.currData;
      return startAsync(function(result) {
        // wakeUp runs from pure JS with an empty exportCallStack.
        // Asyncify.currData may have been clobbered by fiber swaps that
        // ran during our Promise await. Restore our own data before
        // handleSleep proceeds to doRewind.
        Asyncify.currData = myAsyncifyData;
        return wakeUp(result);
      });
    });
  };
}
```

**Why this works**: `handleSleep` pairs `allocateData` (sets currData) with `doRewind` (reads currData). Between those, the Promise awaits. If anything overwrites currData during the await, the rewind uses the wrong buffer. By capturing our own data pointer after `allocateData` and restoring it before `wakeUp` triggers `doRewind`, we guarantee the rewind uses the correct buffer regardless of what fiber swaps did.

**Why it's safe**: The capture happens synchronously after `handleSleep` sets currData for this sleep; the restore happens in the Promise resolution path before handleSleep's rewind logic runs. Never runs concurrently with the sleep's own rewind.

### Alternative considered: save/restore in fiber swap

Could alternatively push/pop `Asyncify.currData` inside `_emscripten_fiber_swap`, but this requires knowing when the outer context is "done" using its currData — handleSleep already knows this (at wakeUp time), so wrapping handleSleep is simpler and more robust.

### Workaround (if fix is delayed): block tool activation during modal

In `TOOL_MANAGER::dispatchInternal`, check `wxTheApp->GetTopWindow()->IsModal()` or similar. Queue events; drain on modal close. Doesn't fix the architectural issue but unblocks startup.

### Hygiene cleanups (separate follow-up PR)

Independent of the bug fix, these improve `kicad/thirdparty/libcontext/libcontext.cpp`:

1. Replace `wasm_fcontext_entry` with QEMU-style `while(true)` trampoline — never returns, safer if the entry function's return path were ever accidentally reached
2. Remove `emscripten_unwind_to_js_event_loop()` from `wasm_fcontext_entry` and `jump_fcontext` — these would terminate all WASM execution but are never called in practice
3. Remove `parking_fiber` / `active_fiber()` / `ensure_parking_context()` — dead code paths related to the entry-returns problem

Additional shim cleanups:
4. Add `Fibers.destroyFiber(fiberPtr)` called from `release_fcontext` via EM_ASM; clears `rewindTargetByFiber`, `rewindWrapperByFiber`, `entryWrapperByFiber`, `entryKeyByFiber`, and `delete wasmExports["__fiber_*_<fiberPtr>"]`
5. Balance `exportCallStack` even on ABORT (pop if top matches expected key)

These don't fix the bug but eliminate several loaded footguns.

---

## Test Plan

### New standalone: `tests/apps/standalone/coroutine-nested/nested_test.cpp`

Same pattern as `coroutine_test.cpp`. Reuses `kicad_coroutine_harness.h`.

**Shared helper `AutoClosingDialog`**:
- On `wxEVT_SHOW`, starts `wxTimer::StartOnce(delayMs)` → `EndModal(wxID_OK)` on fire
- Optional external-close hook for scenarios that need to interleave fiber ops before closing

**Asyncify state logging macro**:
```cpp
#define LOG_ASYNCIFY(tag) EM_ASM({
    console.log('[COROUTINE_TEST] ASYNCIFY ' + UTF8ToString($0) +
        ' state=' + Asyncify.state +
        ' stackLen=' + Asyncify.exportCallStack.length +
        ' currData=' + (Asyncify.currData || 'null') +
        ' tableLen=' + wasmTable.length);
}, tag)
```

The `currData` value in these traces is the smoking gun.

### The 8 scenarios

| # | Name | Proves |
|---|---|---|
| 1 | `baseline_modal_alone` | Build and EM_ASYNC_JS work |
| 2 | `baseline_fiber_alone` | Fiber swap works |
| 3 | `fiber_create_run_destroy_inside_modal` | **TARGET REPRODUCER** |
| 4 | `fiber_multi_swap_inside_modal` | Multiple swaps under modal |
| 5 | `fiber_yield_across_modal_close` | Dormant fiber across modal boundary |
| 6 | `fiber_deep_yield_loop_inside_modal` | Deep stack + many yields under modal |
| 7 | `modal_fiber_modal_sequence` | Modal A → fiber → Modal B |
| 8 | `nested_fibers_inside_modal` | Fiber-to-fiber (FROM_ROUTINE) under modal |

### Diagnostic matrix

| Hypothesis | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Build/infra broken | FAIL | — | — | — | — | — | — | — |
| Fiber port broken | — | FAIL | — | — | — | — | — | — |
| Any fiber-under-modal | pass | pass | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL |
| Multi-swap only | pass | pass | pass | FAIL | pass | FAIL | maybe | FAIL |
| Dormant fiber pin | pass | pass | pass | pass | FAIL | pass | pass | pass |
| Consecutive-modal leak | pass | pass | pass | pass | pass | pass | FAIL | pass |
| Nested fiber-to-fiber | pass | pass | pass | pass | pass | pass | pass | FAIL |

**Current build expectation**: Baselines pass; Scenario 3 crashes with `RuntimeError: index out of bounds`.
**After fix expectation**: All 8 pass.

### Build integration

Add to `tests/apps/Makefile.wasm`:
```makefile
$(S)/coroutine-nested/nested_test.o: $(S)/coroutine-nested/nested_test.cpp \
        $(S)/coroutine/kicad_coroutine_harness.h
	$(CXX) -c $(CXXFLAGS) -I$(KICAD_ROOT)/thirdparty/libcontext \
        -I$(S)/coroutine $< -o $@

$(S)/coroutine-nested/nested_test.html: \
        $(S)/coroutine-nested/nested_test.o \
        $(S)/coroutine/libcontext.o $(WX_CORE_LIB)
	$(CXX) $^ $(LDFLAGS_COROUTINE) --pre-js $(JS) --shell-file $(HTML) -o $@
	../../scripts/common/inject-dyncall-shims.sh $(basename $@).js

coroutine-nested: $(S)/coroutine-nested/nested_test.html
```

Reuses `LDFLAGS_COROUTINE` (already has `startModal` and `emscripten_fiber_swap` in `ASYNCIFY_IMPORTS`).

### E2E spec: `tests/e2e/coroutine-nested.spec.ts`

Three tests mirroring `coroutine.spec.ts`:
1. "loads and reports case inventory" — all 8 `CASE` lines present
2. "reports zero failures" — SUMMARY parseable, total=8, failed=0, no pageerror
3. "per-scenario status (diagnostic)" — `expect.soft` per case for triage view

---

## Implementation Sequence

1. Scaffold: dir, stub `.cpp`, Makefile rule, verify build succeeds
2. Implement Baselines 1 and 2 — confirm test infra works
3. Implement Scenario 3 — expect crash (successful reproduction)
4. Implement Scenarios 4–8 — fill diagnostic matrix
5. Apply `handleSleep` save/restore fix
6. Re-run nested suite — all 8 pass
7. Re-run existing `coroutine` suite — no regression
8. Full KiCad E2E — wizard closes cleanly, toolbars populate, Draw Line works
9. Separate PR: libcontext.cpp hygiene (while(true), remove unwind, remove parking)

---

## File Inventory

| File | Role |
|---|---|
| `tests/apps/standalone/coroutine-nested/nested_test.cpp` | NEW — 8-case reproducer |
| `tests/apps/Makefile.wasm` | Add `coroutine-nested` target |
| `tests/e2e/coroutine-nested.spec.ts` | NEW — E2E for reproducer |
| `scripts/common/inject-dyncall-shims.sh` | FIX — add `handleSleep` wrapper |
| `kicad/thirdparty/libcontext/libcontext.cpp` | Hygiene follow-up — while(true), remove unwind |
| `kicad/include/tool/coroutine.h` | Reference only |
| `kicad/common/tool/tool_manager.cpp` | Reference only |
| `wxwidgets/src/wasm/dialog.cpp` | Reference only — site of EM_ASYNC_JS startModal |

---

## References

- [Emscripten Issue #9153](https://github.com/emscripten-core/emscripten/issues/9153) — "Asyncify: Nested pause function calls does not work" (WONTFIX). Matches our failure exactly.
- [Emscripten Issue #13302](https://github.com/emscripten-core/emscripten/issues/13302) — fiber swap return value bug (same single-slot design root)
- [Emscripten Issue #12270](https://github.com/emscripten-core/emscripten/issues/12270) — fibers + embind return undefined (WONTFIX)
- [Emscripten Issue #12239](https://github.com/emscripten-core/emscripten/issues/12239) — `start is not a function` in doRewind (empty exportCallStack variant)
- [Emscripten PR #9859](https://github.com/emscripten-core/emscripten/pull/9859) — fiber API introduction, design discussion
- [Asyncify blog post](https://kripken.github.io/blog/wasm/2019/07/16/asyncify.html) — the transformation explained
- [QEMU coroutine-wasm.c](https://github.com/qemu/qemu/blob/master/util/coroutine-wasm.c) — reference implementation (solves a different subset of problems)
- Local: `tools/emsdk/upstream/emscripten/src/lib/libasync.js` — ground truth for Asyncify JS runtime
- Local: `tools/emsdk/upstream/emscripten/system/include/emscripten/fiber.h` — fiber API
