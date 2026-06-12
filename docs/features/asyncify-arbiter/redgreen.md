# Asyncify red-green ledger

Harness: `tests/apps/standalone/asyncify-races/` (3 build variants: full shims /
`SHIM_DISABLE_TRAMPOLINE_HEAL=1` / `SHIM_DISABLE_HANDLESLEEP=1`), specs in
`tests/asyncify/asyncify-races.spec.ts`, run via `npm run test:asyncify:firefox`.
Built with `-sASSERTIONS=0` to match production asyncify semantics (the debug
assert "We cannot start an async operation when one is already flight" forbids
the multi-parked-sleep states the production shims are designed to handle).

The harness reproduces KiCad's real startup topology: a fiber swap during OnInit
means main() is resumed via Fibers.trampoline() when the
emscripten_set_main_loop(...,1) `throw "unwind"` park fires — the precondition
for the trampoline-guard wedge (this is what coroutine-nested never modeled).

## Board after the initial red run (2026-06-12, all pre-fix)

| Spec | State | Recorded failure mode |
|---|---|---|
| battery: post_park_fiber_swap | GREEN | §3c trampoline heal works (pinned by ablation below) |
| battery: sleep_inside_fiber_inside_modal | GREEN | 3 concurrent buffers (modal+fiber+sleep) survive under handlesleep.js |
| battery: out_of_order_sleep_resolution | GREEN | FIFO resolution of 2 parked sleeps survives (shim associates per-sleep buffers) |
| battery: long_parked_sleep_clobbered_by_swap | GREEN | 1.2s parked sleep + 2 fiber-swap cycles survives (pinned by ablation below) |
| wakeup_during_transition | GREEN | modal teardown from fresh stack over 2 parked sleeps survives current shims |
| **modal_in_modal_in_modal** | **RED** | watchdog timeout, all-quiet state: wx `dialog.cpp` keeps the modal resolver in a single slot (`Module._endModal = fn`, `delete` after use) — the middle EndModal(102) resolves nothing, its ShowModal parks forever. NEW product bug found by the harness (KiCad nests dialogs). Fix: Stage-3 LIFO resolver stack. |
| **nested_quasi_modal_pump_error** | **RED** | watchdog timeout with `currData=1390336` left parked — c27fe8bf's `wxWasmRunNestedLoop` pump catches the ProcessEvents rejection and stops WITHOUT resolving; nested DoRun leaks forever. Fix: Stage-3 resolve-on-error. |
| **sleep-park: unwind_through_promise** | **RED** | `uncaught exception: unwind` at `handleSleep/< ... promise callback*handleAsync` — the park throw escapes through the last pre-park sleep's wakeUp promise reaction. Fix: Stage-2 shim catches the `"unwind"` sentinel in the wakeUp path (the same class pcbnew.spec.ts/eeschema.spec.ts currently FILTER OUT with `'uncaught exception: unwind'`). |
| ablation noheal: post_park swap hangs | GREEN (reproduces) | watchdog: `state=0 currData!=0 trampolineRunning=true nextFiber=0`, suite never completes — the exact traced mechanism: the park throw tears through the live trampoline do/while, `trampolineRunning=false` reset skipped, guard wedged forever. Pins §3c (`18a9de0`). |
| ablation nosleepfix: parked sleep clobbered | GREEN (reproduces) | `RuntimeError: index out of bounds` (the KiCad clipboard crash signature) — fiber swap clobbers `Asyncify.currData` while a sleep is parked; wakeUp rewinds garbage. Pins `handlesleep.js`. |

## Notes

- out_of_order_sleep_resolution and wakeup_during_transition could not be made
  red under the current shims at production semantics — the existing
  handlesleep.js per-sleep buffer capture handles them. They stay as regression
  pins. The KiCad-side "ENTER at state=2" diagnostic remains the only evidence
  for a residual wakeup race; the Stage-4 KiCad e2e run (clean-console
  assertions) is the judge of whether more shim work (deferred wakeups) is needed.
- Earlier harness iterations hit two environment gotchas worth remembering:
  `EM_JS` bodies take C parameter NAMES (not `$0` — that's EM_ASM), and
  `npx serve`'s cleanUrls redirect DROPS query strings — harness params travel
  in the URL hash.

## Green transitions (2026-06-12, same day — suite 7/7 green in 21.7s)

- [x] sleep-park unwind_through_promise → GREEN via `scripts/common/shims/handlesleep.js`:
      the wakeUp wrapper catches the `"unwind"` sentinel (the main-loop park
      escaping through a sleep's promise reaction) and swallows it exactly like
      callMain does on the direct path. Shim-only; no rebuild of wx needed.
- [x] modal_in_modal_in_modal → GREEN via `wxwidgets/src/wasm/dialog.cpp`:
      `Module._endModal` is now a stable LIFO dispatcher over
      `Module._wxModalResolvers` (was: single slot + delete). Also: the modal
      pump now CANCELS the modal (resolves `wxID_CANCEL`) on a ProcessEvents
      rejection instead of silently stopping with the stack parked.
- [x] nested_quasi_modal_pump_error → GREEN via `wxwidgets/src/wasm/evtloop.cpp`:
      `wxWasmRunNestedLoop`'s pump resolves (exits the nested loop, loudly) on a
      ProcessEvents rejection instead of stopping with the nested DoRun parked.
- [also] `wxwidgets/src/wasm/clipbrd.cpp` `IsSupported`: no longer calls the 2 s
      `js_clipboardHasText` EM_ASYNC_JS — answers from the sync capability
      probe. Its red lives at the KiCad level (CLIP-DIAG unwind/OOB lines in
      tests/logs/kicad/load-pcb); verified by the Stage-4 clean-console runs.

Harness learning recorded for posterity: to make the *pump* fail you must throw
from a PENDING EVENT (ProcessEvents -> ProcessPendingEvents); wx timers on wasm
fire via emscripten_async_call/callUserCallback and bypass the pump's awaited
ccall entirely.
