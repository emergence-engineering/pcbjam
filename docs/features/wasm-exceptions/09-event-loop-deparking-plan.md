# 09 — Event-loop de-parking: one EH-agnostic main loop (plan + verification) (2026-06-23)

> Plan to replace the wx top-level event loop's stack-abandoning `throw "unwind"` with an
> **Asyncify de-park**, written **in C++ (`evtloop.cpp`), not as a post-link shim**, so a **single
> code path works under both `-fexceptions` (JS-EH) and `-fwasm-exceptions` (native EH)**.
> Companion to [`08-wx-app-render-rootcause.md`](08-wx-app-render-rootcause.md) (root cause) and to
> the async dossier's de-park analysis (`docs/features/async/`). Ends with the **old-vs-new
> test+screenshot verification matrix**.

## Decision (verdict up front)

The top-level `wxGUIEventLoop::DoRun` will stop using `emscripten_set_main_loop(..., simulate_infinite_loop=1)` (which `throw "unwind"`s to abandon the C++ stack). Instead:

```cpp
// top-level DoRun:
wxWasmParkMainLoop();   // suspend the C++ stack + drive ProcessEvents from an rAF loop
                        // that calls it via the ASYNC ccall (Asyncify-aware).
                        // NOT emscripten_set_main_loop — see the Correction note below.
```

- **No `throw`** → nothing for native wasm-EH's `catch_all` cleanup pads to catch → the main frame is not destroyed (the 08 bug).
- **No `throw`** under JS-EH either → behaves exactly like today minus the (JS-EH-harmless) throw.
- **One source, both models** — no `#ifdef WX_NATIVE_EH`, no shim, no `--js-library`. Lives in the wx wasm port where the loop already lives.
- **Keeps `requestAnimationFrame`** — `wxWasmParkMainLoop` drives `ProcessEvents` from an rAF loop (not `setTimeout`), vsync-aligned like the original. (Option A used `setTimeout`; this supersedes it.)

## Background (recap of the 08 bug)

`emscripten_set_main_loop(ProcessEvents, 0, 1)` registers the rAF loop and then `throw "unwind"` to abandon the C++ stack (so the code after it never runs and the browser drives `ProcessEvents`). Under `-fwasm-exceptions`, the compiler emits real `catch_all` cleanup landing pads; as the foreign `"unwind"` JS exception propagates out of `main`, those pads **catch it and run destructors**, tearing down `wxTopLevelWindows.front()` (the main frame) before first paint → blank render. Under JS-EH the same throw is harmless because legacy `-fexceptions` landing pads fire *unreliably* and `noExitRuntime=true` means the throw is swallowed by `handleException` with no destructors run.

## The mechanism in detail

The throw bundles two jobs: (1) register the rAF loop, (2) abandon the stack. `simulate_infinite_loop` is a parameter, so we split them: pass `0` (register + return, no throw), then keep the stack alive ourselves with a **bare park**.

`wxWasmParkMainLoop` is `wxWasmRunNestedLoop` **minus its `setTimeout` pump** — because here `emscripten_set_main_loop`'s rAF already drives `ProcessEvents`, so a pump would double-drive it. It only `await`s a Promise registered on the existing `Module._wxNestedLoopExit` LIFO:

```cpp
EM_ASYNC_JS(void, wxWasmParkMainLoop, (), {
    Module._wxNestedLoopExit = Module._wxNestedLoopExit || [];
    await new Promise(function (resolve) {
        var finish = function () {
            var idx = Module._wxNestedLoopExit.indexOf(finish);
            if (idx !== -1) Module._wxNestedLoopExit.splice(idx, 1);
            resolve();
        };
        Module._wxNestedLoopExit.push(finish);
        // no pump: emscripten_set_main_loop's rAF drives ProcessEvents
    });
});
```

`DoRun` becomes:
```cpp
int wxGUIEventLoop::DoRun() {
    bool topLevel = (s_wxRunDepth++ == 0);
    if (topLevel) {
        // initial sizing as today
        ...SetSize/Refresh on wxTopLevelWindows.front()...
        emscripten_set_main_loop(ProcessEvents, 0, 0);  // rAF, no throw
        wxWasmParkMainLoop();                           // suspend until exit
    } else {
        wxWasmRunNestedLoop();                          // nested: unchanged (setTimeout pump)
    }
    --s_wxRunDepth;
    return 0;
}
```

`ScheduleExit` cancels rAF for the top level before resolving (so no stray rAF tick calls `ProcessEvents` on the app being torn down), then resolves the innermost loop:
```cpp
void wxGUIEventLoop::ScheduleExit(int) {
    m_shouldExit = true;
    if (s_wxRunDepth == 1) emscripten_cancel_main_loop();  // top-level: stop rAF
    wxWasmExitNestedLoop();                                 // resolve park (top) or pump (nested)
}
```

**Nested/modal loops are unchanged** — they still use `wxWasmRunNestedLoop` (rAF isn't available while nested). Only the top level changes, and only from "abandon-via-throw" to "register-rAF + suspend-via-park."

## Correction: rAF pump, not `emscripten_set_main_loop`

The first implementation used `emscripten_set_main_loop(ProcessEvents, 0, 0)` to register rAF + a *bare* park (as "The mechanism in detail" above describes). **It renders white/blank.** `set_main_loop`'s rAF callback (`MainLoop.runIter`) calls `ProcessEvents` **synchronously**, and a synchronous call cannot drive the runtime while `main` is Asyncify-**parked** — the loop stalls after ~6 frames (measured: rafCount **6** vs **~348** for a live loop), so the window never gets its first `Paint` and stays browser-white. (Clicks still work via direct DOM→wx handlers; the first modal's `setTimeout` pump then paints, which masked it in shots 02-05.)

**Fix — the form now in `evtloop.cpp`:** `wxWasmParkMainLoop` is a hand-rolled `requestAnimationFrame` pump that calls `ProcessEvents` via the **async** `ccall(..., {async:true})` (Asyncify-aware → works on the parked runtime). `DoRun` calls only `wxWasmParkMainLoop()` (no `set_main_loop`); `ScheduleExit` is only `wxWasmExitNestedLoop()` (the pump's `finish()` sets `stopped=true`, stopping it before teardown). It differs from `wxWasmRunNestedLoop` only in rAF vs `setTimeout`.

```cpp
EM_ASYNC_JS(void, wxWasmParkMainLoop, (), {
    var stopped = false, finish = null;
    var pump = function () {
        if (stopped) return;
        requestAnimationFrame(async function () {
            if (stopped) return;
            try { await ccall('ProcessEvents', 'void', [], [], { async: true }); }
            catch (e) { if (finish) finish(); return; }
            if (!stopped) pump();
        });
    };
    Module._wxNestedLoopExit = Module._wxNestedLoopExit || [];
    await new Promise(function (resolve) {
        finish = function () { stopped = true; /* splice from LIFO */ resolve(); };
        Module._wxNestedLoopExit.push(finish);
        pump();
    });
});
```

Confirmed (native-EH): rafCount 348 (continuous), `dialog-01-loaded` **byte-identical** to baseline, all 5 dialog tests pass incl. modals.

## Relationship to the async dossier

The agent review (`docs/features/async/`) classifies this precisely: it is the dossier's **"de-parking (Option C — park main in an unresolved `EM_ASYNC_JS` sleep)"** (`02-asyncify-internals.md:265`, `07-decisions-and-outcome.md:60`), the "natural step one of Design B." The dossier **deferred/rejected** de-parking (`07/D4`) because, under `-fexceptions`, the throw provably "runs no destructors" (`10-resolution-menubar-uaf.md:63`, `08-dom-port-regression.md:305-317`) — so there was no reason to take it on. **That premise is exactly what `-fwasm-exceptions` inverts** (catch_all pads now *do* run destructors), and the dossier never considered native EH (grep-confirmed: zero mentions). So we are adopting the dossier's own deferred design, now made *necessary* by the toolchain change — consistent with its long-term direction (Design B), against its near-term decision (D4), for a reason D4 didn't know about.

## Teardown on exit — correct, not a bug

The old throw *abandons* the stack, so `wxEntryCleanupReal` (delete app + all TLWs) **never runs** — leaked on exit. The park lets `DoRun` resume on exit and return into that cleanup, which is correct (and frees the leak). No use-after-free: `ScheduleExit` cancels rAF first, and the park's resolver runs before `DoRun` resumes, so nothing calls `ProcessEvents` on freed state. (The dossier's general de-park warning is about the `simulate_infinite_loop=0`-and-*return* form where a still-registered rAF fires on the freed app; our suspend-then-cancel form avoids it.) Residual: a pre-existing wx window-close crash (`async/01:92-94`) could surface only if a real clean exit is triggered — rare in a browser; pre-existing, not introduced here.

## Remaining caveat (the real one to verify)

This makes the top-level an **always-live Asyncify-suspended context** for the app's lifetime. The known nesting wall (`async/11-asyncify-nesting-raytracer.md`: `emscripten_sleep` can't nest on an unwinding context) is the thing to watch — at KiCad scale, especially the 3D viewer. Reasoning suggests it's *not* worsened (the park is a dormant, separate saved stack, not in the active modal→sleep chain; ProcessEvents runs fresh from rAF), but that's analysis, not measurement. Since this is now one path for both EH models, the JS-EH build gets the park too, so the scale check covers both.

## Verification matrix (the old-vs-new test + screenshot proof)

Goal: prove (a) native EH renders correctly, and (b) JS-EH has **no regression**, by comparing the full wx e2e screenshots against the committed baselines (which were generated from the **old JS-EH** build). `scripts/compare-screenshots.sh` does byte-exact `cmp` of `tests/test-results/` vs `tests/baseline-screenshots/`.

| # | Config | EH model | `evtloop.cpp` | Purpose | Expected |
|---|---|---|---|---|---|
| 1 | **OLD** | JS-EH (`-fexceptions`) | original (throw) | reference / baseline-is-current sanity | matches committed baseline |
| 2 | **NEW-native** | native (`-fwasm-exceptions`) | de-park (this plan) | migration target | matches baseline |
| 3 | **NEW-js** | JS-EH (`-fexceptions`) | de-park (this plan) | no-regression | matches baseline |

- **Scope:** the full wx app suite (`menu, clipboard, filedialog, layout, aui, toolbar, grid, dialog, timer, tree`), all their `*-NN-*.png` shots.
- **Pass bar:** configs 2 and 3 produce screenshots **byte-identical** (or trivially-different, e.g. caret-blink) to the baseline, same set config 1 produces.
- **Browsers:** byte-compare is **chromium** (baselines are chromium). Firefox + WebKit are run for **pass/render** confirmation (their pixels won't byte-match a chromium baseline), per the all-three-engines policy.
- **Build order (minimize clean rebuilds; only EH-model switches need `--clean`):** start from current (native-EH + interim option-A) → implement de-park → **(2)** native-EH de-park (incremental) → **(3)** JS-EH de-park (clean EH switch) → **(1)** JS-EH original (revert `evtloop.cpp`, incremental).

### Results (to fill in)

| # | Config | identical / different / fail | notes |
|---|---|---|---|
| 1 | OLD JS-EH | suite: **316 pass / 0 fail** / 1 skip | **Baseline is STALE** — OLD JS-EH itself differs 1–8% from the committed baseline on many main-app shots (03-after-load…aui…calendar…clipboard), so byte-compare *vs baseline* is unreliable; use config-vs-config. **0 failures here ⇒ config 2's 21 ARE regressions** from native-EH and/or de-park (not pre-existing). |
| 2 | NEW native | suite: 295 pass / 21 fail / 1 skip. dialog standalone 3 identical + 2 caret. Apps render (main-app snapshot OK). Fails: main-app assertions (boot/wxwidgets/dialogs-tab/grid-tab, 10) + coroutine/threading/raytracer (11) | old-baseline (config 1) pending to classify the 21 as pre-existing vs regression |
| 3 | NEW JS-EH | suite: **310 pass / 6 fail** / 1 skip — all 6 are **coroutine** (`coroutine`, `coroutine-nested`, `coroutine-pthread`) | de-park renders **identically** to config 1 (config1-vs-config3 byte-diffs = event-log timestamps + caret only; verified pixel-identical on 04-controls-tab) |

### Isolation (the verdict)

| failures | config 1 (no de-park) | config 3 (de-park, JS-EH) | config 2 (de-park, native-EH) | attribution |
|---|---|---|---|---|
| coroutine / coroutine-nested / coroutine-pthread (6) | pass | **FAIL** | FAIL | **the de-park** (top-level Asyncify park × coroutine fibers — the doc-11 nesting wall, now real) |
| coroutine-raytrace (5) + main tabbed app: boot/wxwidgets/dialogs-tab/grid-tab (10) | pass | pass | **FAIL** | **native-EH** (migration coverage gaps; the "scale unproven" caveat) |

**Key conclusions:**
1. The de-park is **visually clean** — no rendering change (config1≡config3 modulo timestamps), standalone apps all pass, dialog byte-identical.
2. **The de-park regresses the 6 coroutine/threading tests under BOTH EH models.** Under JS-EH this is a **net loss** (the original `throw` form passes them) — so "one de-park for both" is not free: it costs JS-EH its coroutines. This is exactly the Asyncify-nesting hazard `async/11` + the async dossier flagged; the dossier's answer is **Design B** (fiber/arbiter runtime), of which de-park is "step one."
3. native-EH independently breaks 15 more (raytracer + the big app) — broader migration work, separate from the loop change.
4. The **committed screenshot baseline is stale** (old JS-EH itself is 1–8% off); and byte-compare is unreliable here anyway (event-log timestamps). A perceptual diff + a baseline refresh are needed for a real screenshot gate.

**Open decision:** (a) gate the de-park to native-EH only (JS-EH keeps `throw` + coroutines; not "one solution", needs `#ifdef`); (b) do Design B so de-park coexists with coroutines (bigger); (c) ship de-park for both now, coroutine-nesting as tracked follow-up.

## Status

Plan agreed. Implementing the `evtloop.cpp` de-park, then running the matrix above. The interim `option-A` edit (top-level via `wxWasmRunNestedLoop`'s `setTimeout` pump — loses rAF) is **superseded** by this and will be reverted in favor of the `set_main_loop(0)` + `wxWasmParkMainLoop` form.
