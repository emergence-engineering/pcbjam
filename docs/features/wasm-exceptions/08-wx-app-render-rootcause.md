# 08 — Native wasm-EH: the wx application (Phase 2) — render-failure root cause & fix (2026-06-22)

> Phase 2 of the plan in [`07-spike-results-and-opinion.md`](07-spike-results-and-opinion.md):
> flip a real wx standalone app (the `dialog` test) to `-fwasm-exceptions` end-to-end and see if
> it runs. It builds and links clean, but rendered **blank**. This documents the deep-debug that
> found *why*, the one-line-of-reasoning root cause, the fix, and an **honest account of what is
> proven vs. still open** — including a render/screenshot discrepancy that is not yet resolved.

## Status (read this first)

- **Proven, C++-level:** the app was **destroying its own main window during startup** under
  native wasm-EH. Root cause identified with certainty (instrumented build), and the fix makes
  the destruction **stop** (the `~wxNonOwnedWindow` destructor no longer fires). That specific bug
  is fixed, and the *why* is understood and re-derivable.
- **Proven, in my checks:** after the fix, a headless-Chromium load of `dialog_test.html` showed a
  full render — `#canvas` present and visible, **5 buttons**, the description text, the event-log
  control, the status bar; `canvases=1`, `traps=0`; and the screenshot I captured showed the
  complete dialog UI.
- **OPEN / unresolved:** the screenshot is reported **empty** on inspection. My headless ad-hoc
  check and that observation **disagree**, and I have not reconciled them. **Do not treat the app
  as "verified rendering" yet.** See [§Open: the empty-screenshot discrepancy](#open-the-empty-screenshot-discrepancy).
- **Not yet done:** the real e2e spec in all three browsers; modal dialogs (which now nest Asyncify
  one level deeper); the rest of the wx suite; cleanup/commit of the Phase-2 changes.

## The symptom

`dialog` built and linked under `-fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=1` (libwx + app, with
the post-link hoist+asyncify pipeline). At runtime: boots, prints its startup logs, **no JS error,
no wasm trap, main thread responsive** — but `#window-container` empty, no visible canvas, the
e2e `waitForApp` (waits for a visible `#canvas`) would time out. A silent non-render.

## How it was found (the debug chain)

Each step ruled out a hypothesis and narrowed the next. All via injected logging in the built
glue + instrumented libwx rebuilds (the browser symbolizes wasm frames only as `wasm-function[N]`,
so callstack mapping was a dead end on a release build — direct source instrumentation was the
reliable tool).

1. **It's not a trap or asyncify/indirect-call corruption.** Calling a wasm export (`ProcessEvents`)
   from JS post-boot returns cleanly. The "table index out of bounds" seen earlier was an artifact
   of my own `Module.Asyncify` probe, not the app.
2. **`main` "throws `unwind`"** — but that is **normal**: it's `emscripten_exit_with_live_runtime`'s
   sentinel, caught and swallowed by `handleException` (glue line ~5066). A red herring on its own.
3. **The main window is created, then destroyed.** `createWindow(id=-1 → cssId 0)` runs in the frame
   ctor; then `destroyWindow(0)` runs — the DOM window is torn down. `wxNonOwnedWindow::~wxNonOwnedWindow`
   is the caller (it `EM_ASM`s `destroyWindow(m_cssId)`). So **the frame's own destructor runs during
   startup**, leaving the app with no window.
4. **The destruction is deliberate, not an exception unwind.** Instrumented `~wxNonOwnedWindow` to log
   `std::uncaught_exceptions()` → **0**. So no C++ exception is in flight; this is a normal destructor
   call. (This momentarily looked like it ruled out the landing-pad hazard — it didn't; see root cause.)
5. **It happens *after* `OnInit` fully completes.** Logged `OnInit`: "frame created" → "Show done,
   returning true" both print *before* the destructor. So the teardown is in **`OnRun`**, not OnInit.
6. **It happens *inside* `emscripten_set_main_loop`.** Bracketed `wxGUIEventLoop::DoRun`'s
   `SetSize`/`Refresh`/`set_main_loop` with logs. Order: "before set_main_loop" → **then** the
   `~wxNonOwnedWindow`. So the frame dies *during* the `emscripten_set_main_loop(ProcessEvents, 0, 1)`
   call.

## Root cause (one paragraph)

`emscripten_set_main_loop(fn, fps, simulate_infinite_loop=1)` implements "loop forever" by **throwing
a JS `"unwind"` exception to abandon the C++ stack** — the code after it never runs; the browser drives
`fn` thereafter. That `"unwind"` propagates out through every C++ frame between `set_main_loop` and
`callMain`. Under **native wasm-EH**, the compiler emits `catch_all` **cleanup** landing pads (for
destructors/RAII) that **reliably catch any in-flight exception — including a foreign JS one** — run
their cleanup, and rethrow. As the `"unwind"` passes back through `wxEntry`/`OnRun`, those cleanup pads
fire and **destroy `wxTopLevelWindows.front()` — the main frame** — before the browser ever calls
`ProcessEvents` to paint it. `uncaught_exceptions()==0` is consistent: the `"unwind"` is a *JS*
exception, invisible to the C++ exception machinery, so the cleanup-pad destructors see no C++ unwind
in progress.

This is the **inverse** of the documented hazard
[`asyncify-eh-unwind-landing-pads-unreliable`]: under legacy `-fexceptions` the cleanup landing pads
fire **unreliably**, and that *accidentally* spared the frame (the destroy that should run, didn't).
Native wasm-EH makes them reliable — so the latent "abandon-the-stack vs. run-the-cleanup" conflict
finally bites. The JS-EH build never rendered-correctly-by-design here; it rendered correctly **by a
landing-pad bug canceling a stack-abandon assumption.**

## The fix

> **Superseded form (2026-06-23):** the fix described in this section is the *interim* **option A** (`wxWasmRunNestedLoop` / `setTimeout` pump). The final form is the **rAF pump** `wxWasmParkMainLoop` (keeps `requestAnimationFrame`, drops `emscripten_set_main_loop` entirely) — see [`09`](09-event-loop-deparking-plan.md). Both share the root insight (suspend, don't `throw`); the **root cause above is unchanged**. Note the de-park **regresses the coroutine suite** (Asyncify-nesting wall), fixed by [`../async/12`](../async/12-design-b-asyncify-implementation-plan.md) + [`../async/13`](../async/13-design-b-engineering-spec.md).

Drive the **top-level** event loop via **Asyncify** instead of `set_main_loop`'s
abandon-the-stack `"unwind"` — i.e. the **same mechanism the nested/quasi-modal loops already use**
(`wxWasmRunNestedLoop`, an `EM_ASYNC_JS` that suspends via Asyncify and pumps `ProcessEvents` from a
`setTimeout` loop). Asyncify suspends with a **return-based** unwind that **saves** the stack rather
than abandoning it: no `"unwind"` JS exception is thrown, so no `catch_all` cleanup pad fires, so the
frame survives. `ProcessEvents` is then driven by the JS `setTimeout(17ms)` pump instead of
`requestAnimationFrame`.

`src/wasm/evtloop.cpp`:
- `wxGUIEventLoop::DoRun` — the first (top-level) `DoRun` no longer falls through to
  `emscripten_set_main_loop(ProcessEvents, 0, 1)`; it does the initial top-window `SetSize`/`Refresh`
  and then calls `wxWasmRunNestedLoop()`, exactly like a nested loop. Both levels now share one path.
- `wxGUIEventLoop::ScheduleExit` — always `wxWasmExitNestedLoop()` (resolve the innermost pump);
  dropped the top-level `emscripten_cancel_main_loop()` branch (there is no `set_main_loop` to cancel).

### Why this fix and not the alternatives

- **`simulate_infinite_loop=0`** (don't throw): then `DoRun` *returns*, `OnRun` returns, and `wxEntry`
  runs its **normal** teardown (deletes the TLWs) and exits — same dead frame, plus the app exits.
  Doesn't help.
- **Suppress/avoid the cleanup pads:** they're compiler-generated; you can't selectively disable the
  one that catches `"unwind"`. Not actionable.
- **Asyncify the top loop:** it's the existing, tested suspension primitive in this codebase, it
  *saves* the stack (no abandon → no foreign-exception propagation through cleanup pads), and it
  unifies top-level and nested loops on one mechanism. This is the minimal, principled change, and it
  lives in the wasm port layer (`src/wasm/`), per the "fix in the wasm layer" policy.

## Evidence

- **Before fix:** `~wxNonOwnedWindow cssId=0 uncaught=0` fires right after "before set_main_loop";
  `#window-container` empty.
- **After fix:** `~wxNonOwnedWindow` **no longer fires** at startup (definitive C++-level signal the
  frame survives); headless load reports `canvas:true, canvasVisible:true, buttons:5`, body text =
  "wxDialog and wxMessageBox Test…", `canvases=1`, `traps=0`; rebuilt clean (debug logging removed)
  and re-checked → same.

## Open: the empty-screenshot discrepancy

**My headless-Chromium screenshot showed the full dialog; on inspection the screenshot is reported
empty. These disagree and I have not reconciled them.** Until resolved, the app is **not** confirmed
rendering. Candidate explanations, to check in order:

1. **Stale image** — an earlier (pre-fix) empty capture vs. the post-fix one. Cheapest to rule out.
2. **Headless vs. headed / real engine** — my check was headless Chromium; a real/headed browser
   (esp. WebKit/Firefox) may differ. The whole point of project policy is **all three engines**;
   I only spot-checked one, headless.
3. **Ad-hoc load vs. the real e2e spec** — my load waits a fixed 6 s; the spec has its own
   `waitForApp`/timing and asserts against **tracked baseline screenshots**. The spec is the
   authoritative render check and I have **not** run it yet.
4. **A separate, still-present rendering issue** — the frame-destruction fix is proven, but a
   *different* paint/canvas problem could remain (e.g. the canvas drawing path, or DOM-widget vs.
   canvas content). The C++ signal (destructor no longer firing) proves the *frame* lives; it does
   **not** prove every pixel paints.

**Immediate next step:** run `tests/.../dialog` through the real e2e spec in **Firefox + Chrome +
Safari (WebKit)** and compare to the baseline screenshots — that reconciles the discrepancy and is
the real Phase-2 acceptance gate.

## Build-system decisions made for Phase 2 (for review)

All gated so the default (JS-EH) build is unchanged; native EH is opt-in via `WX_NATIVE_EH=1`.

- **`scripts/build-wx-wasm.sh`** — `WX_NATIVE_EH=1` swaps `-fexceptions` for
  `-fwasm-exceptions -sSUPPORT_LONGJMP=wasm -sWASM_LEGACY_EXCEPTIONS=1` in C/CXXFLAGS. (The whole
  libwx + every app must share one EH model — EH ABI is all-or-nothing.)
- **`tests/apps/Makefile.wasm`** — `WX_NATIVE_EH` adds the same EH flags + `-sDYNCALLS=1` to app
  CXXFLAGS/LDFLAGS.
- **`scripts/build-wasm-test.sh`** — under `WX_NATIVE_EH`, **stubs the emsdk-bundled `wasm-opt`**
  (v121 crashes asyncifying wasm-EH) so the in-link Asyncify no-ops, then post-link runs the real
  pipeline on Binaryen v130 over each freshly-linked app + injects the dyncall shims.
- **`scripts/common/hoist-and-asyncify.sh`** (new) — the post-link pipeline:
  `--hoist-cpp-catches` (our fork pass) → `--asyncify` → `-O2`, all on v130. `HOIST_KEEP_NAMES=1`
  preserves the names section through `-O2` (added for the callstack debugging here).
- **`src/wasm/evtloop.cpp`** — the loop fix above (the only behavioral wx-port change).

## Implications beyond `dialog`

- **Modals now nest Asyncify two levels deep.** Previously: top = `set_main_loop` (no Asyncify
  suspend on the main stack), modal = Asyncify (1 level). Now: top = Asyncify, modal = Asyncify
  (2 levels). This leans harder on the nested-`currData` save/restore in `handlesleep.js`
  ([`asyncify-park-throw-root-cause`]). **Must be tested** (open the Custom/Input dialogs).
- **KiCad uses the same `evtloop.cpp`.** If this fix holds for wx apps, it's the same fix KiCad
  needs under native EH — and it means the `set_main_loop`-`"unwind"` conflict is a **general**
  wasm-EH×wx-DOM-port interaction, not a `dialog`-specific quirk. This is exactly the kind of
  "scale hazard" 07 §6 flagged ("unwind-time landing-pad reliability … might *change* under wasm-EH")
  — it changed, and here's the concrete consequence + remedy.

## Honest verdict

The deep-debug **succeeded at the hard part**: a silent blank-render is now a fully understood,
evidence-backed root cause with a minimal, principled fix, and the specific bug (frame self-destruct)
is provably gone. But Phase 2's acceptance bar — *the app verifiably renders and is interactive in all
three browsers via the e2e spec* — is **not met yet**, and the empty-screenshot observation is an
unresolved flag against it. Next action is reconciliation via the real spec, not more root-causing.
