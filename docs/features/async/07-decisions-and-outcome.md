# 07 — Decisions and outcome (2026-06-12)

> **STATUS (2026-06-23):** **D4 (kept the throw-based main-loop park) has been reversed.** Native wasm-EH made the `throw "unwind"` fatal (its catch_all cleanup destroys the main frame), so the top loop is now the Asyncify **de-park** ([`../wasm-exceptions/09`](../wasm-exceptions/09-event-loop-deparking-plan.md)). That de-park regressed the coroutine suite — the red scenario D3 said the arbiter lacked — so **Design B is now being built** ([`12`](12-design-b-asyncify-implementation-plan.md) + [`13`](13-design-b-engineering-spec.md)). The D1–D5 outcomes below were correct for the JS-EH / throw world.

> The dossier (01–06) ended with designs and open questions. This file records what was
> actually decided, built, and deliberately NOT built — and the trigger conditions for
> revisiting each road not taken. Working artifacts: `docs/features/asyncify-arbiter/`
> (baseline.md, redgreen.md), harness in `tests/apps/standalone/asyncify-races/` +
> `tests/asyncify/`, runnable via `npm run test:asyncify:firefox`.

## D1 — Root cause: the dossier's two hang mechanisms were ONE mechanism

The §5 (doc 02) question "orphaned currData vs stuck trampoline guard" was settled by code
trace, then pinned by a deterministic test. At the `emscripten_set_main_loop(...,1)`
`throw "unwind"` park, Asyncify state is clean — but **any OnInit-era fiber swap means
main() is, from then on, executing inside `Fibers.trampoline()`'s `do/while`** (resumed via
`finishContextSwitch → doRewind`). The throw tears through that live frame; the
`trampolineRunning = false` reset is skipped; the guard wedges forever; the first post-idle
swap strands. "Orphaned currData" is structurally impossible (the throw only executes from
straight-line Normal-state code). Corollary: when main's *last* pre-park suspension was a
**sleep**, the same throw instead escapes through that sleep's wakeUp promise reaction —
that was the long-standing `uncaught exception: unwind` rejection family.

Consequence: the trampoline self-heal (`inject-dyncall-shims.sh` §3c, commit `18a9de0`)
is the **structural cure** for the hang, not a band-aid (doc 04 had it demoted), and
**de-parking (02 §7) is not needed for correctness.**

## D2 — Red-green doctrine governed everything

Rule applied throughout: *no fix lands before a test has been observed failing for the
exact disease, and the failing run is recorded* (`asyncify-arbiter/redgreen.md`). Two red
flavors: **natural red** (bug unfixed today) and **ablation red** (fix exists; rebuild the
harness with `SHIM_DISABLE_TRAMPOLINE_HEAL=1` / `SHIM_DISABLE_HANDLESLEEP=1` to prove the
test detects the disease the fix prevents — mutation-testing style). The ablation flags are
permanent injector features; the diseases stay reproducible on demand.

## D3 — Decision: the full Design-A arbiter was NOT built

Doc 05's arbiter (central context registry + deferred-wakeup queue + single-owner
transitions) was the plan. It was dropped because **no scenario could be made red that it
would fix**: at production asyncify semantics (`-sASSERTIONS=0`), the pre-existing
per-sleep capture in `scripts/common/shims/handlesleep.js` (commit `a4ad694`) already
implements Design A's core invariant — *`Asyncify.currData` is a transient register; every
parked context owns its buffer pointer elsewhere* (fibers: in the `wasm_fcontext` struct;
sleeps: in per-sleep closures, restored immediately before that sleep's own rewind). The
scenarios predicted to need the arbiter (`wakeup_during_transition`,
`out_of_order_sleep_resolution`, `sleep_inside_fiber_inside_modal`) are green under the
existing shim and are kept as regression pins.

Why the residual race is structurally hard to hit: promise resolvers only queue
microtasks; microtasks run only at JS-stack-empty; every transition (unwind chain,
trampoline loop, rewind chain) completes synchronously within one task. The only mechanism
that splits a transition across tasks is an `await` inside the chain — the async-ccall
pumps — which are exactly what was hardened (D5).

**Trigger to revisit:** any reappearance of a wakeup-during-transition signature in
`tests/logs/` (e.g. handleSleep entered at `state=2`, `invalid state` aborts), or any new
red the existing shims can't turn green. The arbiter design in doc 05 remains the blueprint;
the deferred-wakeup queue alone is a ~50-line `handlesleep.js` extension.

## D4 — Decision: keep the park throw (+ heal + sentinel catch); defer the asyncify-park

The alternative discussed ("Option C": park main in a never-resolving `EM_ASYNC_JS` sleep
instead of the throw — clean unwind, no exceptional control flow, explicit teardown owner,
natural step one of Design B) was deliberately **deferred**. With the heal (§3c) covering
the fiber face and the `handlesleep.js` sentinel catch covering the sleep face, both damage
classes of the throw are individually fixed and pinned; the asyncify-park would have landed
green-on-green. Costs it would incur now: wx lifecycle change + rebuild, `MainLoop.pause()`
interplay (handleSleep auto-pauses the loop), a permanently-parked buffer, divergence from
stock emscripten idiom.

**Trigger to revisit:** recurring `"unwind"`-leak variants that the sentinel catch doesn't
cover, or starting Design B (fiber-first runtime) in earnest.

## D5 — wx-layer fixes (the bugs that were wx's, not the shim's)

1. **`dialog.cpp` — modal resolver is a LIFO stack.** `Module._endModal` was a single slot
   that deleted itself after use; with 3+ nested modals the middle `EndModal` resolved
   nothing and its `ShowModal` parked forever. Found by the new `modal_in_modal_in_modal`
   scenario — a previously unknown product bug (KiCad nests dialogs routinely). Now:
   stable `Module._endModal` dispatcher popping `Module._wxModalResolvers` (LIFO — matches
   wx modal discipline and c27's `_wxNestedLoopExit` convention). If programmatic
   out-of-order EndModal ever matters, key the dispatcher per-dialog (small change, needs
   its own red test first).
2. **Pumps must never stop without resolving.** Both `startModal` (modal pump) and
   `wxWasmRunNestedLoop` (c27 quasi-modal pump) caught ProcessEvents rejections and
   silently stopped, leaving the suspended C++ stack parked forever. Now both resolve on
   error, loudly (`console.error`): the modal cancels with `wxID_CANCEL` (passed in from
   C++), the nested loop exits. Self-cancel paths splice their own resolver out of the
   stack (they may not be topmost).
3. **`clipbrd.cpp` — `IsSupported` is synchronous again.** It called the 2 s
   permission-gated `js_clipboardHasText` EM_ASYNC_JS from a synchronous-by-contract
   predicate on the idle path — creating the long-parked sleeps behind the
   `index out of bounds` family. Now answers optimistically from the sync
   `js_isClipboardAPIAvailable` probe; the real read stays in `GetData()` (user-gesture
   gated).

## D6 — Harness design decisions (tests/apps/standalone/asyncify-races/)

- **KiCad-faithful topology is the point:** ≥1 fiber swap in `OnInit` so main is
  trampoline-resumed at park time — the precondition `coroutine-nested` lacked, which is
  why it never reproduced the hang. `#mode=sleep-park` flips the last pre-park suspension
  to a sleep for the rejection face.
- **`-sASSERTIONS=0` (LDFLAGS_RACES):** emscripten's debug assert ("cannot start an async
  operation when one is already in flight") forbids the very multi-parked-sleep states the
  production shims exist to handle; the harness must match production semantics.
- **Params travel in the URL hash:** `npx serve`'s cleanUrls redirect for `*.html` drops
  query strings.
- **EM_JS bodies use C parameter NAMES** (`aToken`), not `$0` — that is EM_ASM syntax.
- **To make a pump fail, throw from a PENDING EVENT** (`CallAfter` → ProcessPendingEvents
  inside the pump's awaited ccall). wx timers fire via
  `emscripten_async_call`/`callUserCallback` and bypass pumps entirely.
- **Quiescence probe** (state==Normal, currData==null, nextFiber==0) is checked
  synchronously between scenarios; `trampolineRunning` is deliberately excluded from the
  sync check (code resumed via a fiber legitimately runs inside the trampoline do/while) —
  a genuinely stuck guard is caught by the per-scenario JS watchdogs instead.
- Wedge-prone scenarios run as `#only=` singles on separate page loads; the chained battery
  holds only scenarios that can't kill the chain.

## D7 — Attribution ledger (who fixed what, when)

Pre-existing (earlier sessions): per-sleep buffer capture/restore in `handlesleep.js`
(`a4ad694`); trampoline self-heal §3c (`18a9de0`); per-fiber buffers (stock emscripten +
libcontext). This session's code: the 13-line `"unwind"` sentinel catch in
`handlesleep.js`; the three wx fixes (D5); `SHIM_DISABLE_*` ablation flags; the harness +
specs + config; spec tightening (D8). This session's *proof*: before it, the shim and heal
were unverified folklore — nothing failed if you deleted them. Now their diseases reproduce
on demand and their absence fails tests.

## D8 — Acceptance bar moved into the specs

`'uncaught exception: unwind'` tolerance filters DELETED from `pcbnew.spec.ts` /
`eeschema.spec.ts`; `load-pcb.spec.ts` gained a hard clean-console gate over five
signatures (`index out of bounds`, `indirect call to null`, `uncaught exception: unwind`,
`invalid state`, `is not a function`) covering before AND after board render.

## Outcome (final verification)

- Harness: 7/7 green (battery of 4 + three singles); both ablation builds still reproduce
  their diseases. wx e2e 291 passed / 1 skipped / 0 failed; coroutine 13/13.
- KiCad e2e after rebuilding **all six apps**: 40 passed / 2 skipped / 0 failed / 0 flaky,
  and a sweep of every `tests/logs/kicad/` log finds **zero** corruption signatures and
  **zero** `.errors.log` files (baseline had load-pcb `index out of bounds` and
  calculator/gerbview `uncaught exception: unwind`).
- Upstream (researched): Fibers/Asyncify JS runtime unchanged since 2020; the single-slot
  limitation family is WONTFIX (#9153, #12270, #13302, #16291, #18412). The §3c
  try/finally heal is a good candidate for an upstream PR.

## Roads not taken, with triggers

| Option | Status | Revisit when |
|---|---|---|
| Full Design-A arbiter (registry + wakeup queue) | not built | any wakeup-during-transition signature in logs, or a red the shims can't fix |
| Park-via-unresolved-sleep (no throw) | deferred | recurring unwind-leak variants, or Design B work starts |
| De-parking (02 §7, lifecycle surgery) | rejected | only as part of Design B |
| Design B (fiber-first runtime) | long-term option | architectural appetite, not correctness need |
| Per-dialog-keyed modal resolvers | not needed | a real out-of-order EndModal use case (write the red first) |
