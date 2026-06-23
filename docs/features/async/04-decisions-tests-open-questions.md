# 04 — How the fixes relate, the test matrix, open questions

> **STATUS (2026-06-23):** the top-level `set_main_loop(...,1)` `throw "unwind"` treated as current here **is gone** — replaced by the Asyncify **de-park** rAF pump (fatal under native wasm-EH; see [`../wasm-exceptions/09`](../wasm-exceptions/09-event-loop-deparking-plan.md)). The de-park regressed the coroutine suite, and **Design B is now being built to fix it** ([`12`](12-design-b-asyncify-implementation-plan.md) + [`13`](13-design-b-engineering-spec.md)). Read below as the pre-de-park analysis.

> The goal is **one universal mechanism**, not patches scattered around. This file classifies the
> candidate fixes by *root cause* so it's clear what is part of the one solution, what is
> subsumed, and what is genuinely separate.

## §1. The candidate levers, by root cause

| Lever | Root cause it addresses | Relationship to the universal fix |
|---|---|---|
| **Sync clipboard `IsSupported`** | A *separate* semantic/UX bug: a cheap predicate doing a 2 s permission-gated async read on the idle path. | **NOT needed for correctness.** A correct per-context authority makes the 2 s sleep *safe* even when overlapped. Keep it only as an independent UX/perf improvement, or drop it. |
| **Trampoline self-heal** (`try/finally` around `Fibers.trampoline`) | A *different register*, `Fibers.trampolineRunning`, getting stuck `true` after a mid-loop unwind. | **Subsumed.** A real authority must own the trampoline anyway; "always reset the guard" becomes one of its invariants, not a standalone bolt-on. |
| **De-park `main()`** (`simulate_infinite_loop=0` + suppress teardown) | The `throw "unwind"` abandoning Asyncify state outside any scheduler's control, plus the null-`IsModal` lifecycle crash. | **Orthogonal** to `currData`. Whether it's required is decided by one measurement (§2). If required, it is *part of* the universal design (the main loop becomes a normal scheduler participant), not a hack. |
| **Per-context `currData` authority** | The single global slot shared by overlapping suspensions. | **The core.** This is the one universal mechanism. |

### Why de-parking doesn't automatically fall out of the authority
The authority governs `currData` during *normal* unwind/rewind transitions. But
`simulate_infinite_loop=1` is a **`throw "unwind"`** (`pcbnew.js:11392`) — a JS exception that
**bypasses all asyncify bookkeeping, including the authority's.** Two orthogonal design axes:

- **D1 — how does `main()` avoid returning into destructive cleanup?** (throw, vs. de-park +
  suppress cleanup)
- **D2 — how is `currData` managed across overlaps?** (single slot, vs. unified authority)

The authority is purely D2; the throw is purely D1. They don't subsume each other. You *can*
build the authority while keeping the throw — its safety then hinges entirely on §2.

## §2. The one measurement that sets the scope

> **Is `Asyncify.currData` clean (null, no context parked) at the instant `wxGUIEventLoop::DoRun()`
> executes the `throw "unwind"`?**

- **If yes** → the throw abandons nothing; the **per-context authority alone is the complete
  universal solution.** No de-parking needed.
- **If no** (a startup coroutine or the main fiber is still parked at the throw) → the throw
  orphans a live buffer *outside the authority's control*. Then the clean answer is to **remove
  the throw** (de-park), so the authority never has to recover from an abnormal teardown. (The
  alternative — "reconcile/reset `currData` at the next tick" — is exactly the kind of paper-over
  we want to avoid.)

**The diagnostic (cheap, JS-only, no full rebuild):** add `console.log`s of
`Asyncify.currData` / `Asyncify.state` / `Fibers.trampolineRunning` at:
1. the last line of `DoRun` *before* `emscripten_set_main_loop(...,1)` (C side, `evtloop.cpp`),
2. the first `MainLoop.runner` rAF tick (`pcbnew.js:11342`),
3. the entry of the first post-startup `_emscripten_fiber_swap` (`pcbnew.js:11557`).
Compare `currData` to `g_main_context`'s buffer (libcontext) and to any live coroutine's
`fiber+20`. This disambiguates §5 mechanism #1 (orphaned buffer) vs. #2 (stuck guard) in
[`02-asyncify-internals.md`](02-asyncify-internals.md), and answers the yes/no above.

**Run this before designing anything.**

## §3. The universal, hack-free framing

The cleanest single design is **one cooperative Asyncify scheduler in which *every* suspendable
thing is a registered context with its own buffer** — tool coroutines, modals, clipboard, fonts,
**and the main loop itself** — where the scheduler is the sole owner of `currData` *and* the
fiber trampoline, and the main loop participates normally instead of being parked via a
state-abandoning `throw`.

In that framing:
- the per-context `currData` authority is the **core** (D2),
- the trampoline self-heal is an **internal invariant** of it,
- making the main loop a normal scheduler participant **is** de-parking (D1) — a consequence of
  "no special-case suspension may abandon state," not a bolt-on,
- the clipboard sync change is **out of scope** — a separate UX fix.

The §2 measurement decides whether the scheduler must own the main loop from the start (cleaner)
or can be scoped to coroutines + sleeps and leave the main loop alone.

## §4. Tests — enumerating "every possible case"

A strong harness already exists: `tests/apps/standalone/coroutine*/` (nine probes:
`main/nested/nested_ex/embind/mainloop/gl/gl_pt/vcall/wxpt`) built by `scripts/build-wasm-test.sh`
via `tests/apps/Makefile.wasm` (each links `-sASYNCIFY=1
-sASYNCIFY_IMPORTS=['emscripten_fiber_swap']` then the same `inject-dyncall-shims.sh`), plus
`tests/e2e/coroutine-nested.spec.ts` (8 modal×fiber scenarios) and `coroutine-pthread.spec.ts`,
all asserting **no `index out of bounds`** and polling a `SUMMARY total/passed/failed` line.

**Gaps:** no systematic coverage of *out-of-order* and *long-parked* overlaps, and it asserts
crash-freedom but **not liveness** (so it would not catch a hang).

Make it a **generated combinatorial product** and assert three outcomes per cell:
- **Primitives (cells):** `S1`=EM_ASYNC_JS sleep (modal/clipboard/font), `S2`=fiber swap (tool
  coroutine), `S3`=parked main loop, `S4`=pthread boundary.
- **Overlap shape:** none / nested-LIFO / **interleaved out-of-order** / **long-parked outer**
  (the 2 s clipboard shape). The last two are under-tested.
- **Host context:** direct / rAF main-loop tick / embind dispatch / WebGL2 frame / deep stack /
  `-fexceptions` invoke wrappers.
- **Resume target:** continuation / **virtual call** (`invoke_vi→dynCall_vi`, the `vcall_repro`
  smoking gun).
- **Assert per cell:** (1) no `index out of bounds` / `indirect call to null` / `unwind`
  rejection (no crash); (2) **completes within a timeout** (no hang — the missing assertion
  today); (3) returned value correct (no silent wrong-buffer rewind).
- **Two must-add named scenarios** that pin our exact bugs deterministically:
  `long_parked_sleep_clobbered_by_swap` (the clipboard crash) and `fiber_swap_after_main_park`
  (the §5 hang — the harness must install a `simulate_infinite_loop=1` main loop, then swap a
  fiber post-park).

## §5. Open questions to resolve before any implementation

1. **Run the §2 diagnostic.** Is idle `currData` the orphaned-from-park buffer (§5#1 in 02), a
   stuck trampoline guard (§5#2), or both? This decides whether the authority alone suffices or
   the main loop must be de-parked, and whether the trampoline self-heal is meaningful on its own.
2. **For de-parking, which suppression shape** (2a UnloadCallback-driven cleanup vs. 2b guarded
   `wxEntryCleanupReal`) is least invasive given our `wxApp`/`init.cpp` fork delta? Check
   `scripts/kicad-diff-stats.sh` and current wx fork divergence first.
3. **Does sync-clipboard alone stop the load-pcb route hanging, or only stop crashing?** If the
   open hangs even with clipboard synchronous, the authority (and likely de-park) is required, not
   optional.

---

## Provenance

This dossier was reconstructed from: Claude session
`3301ab3a-c457-4359-be9a-dcf4dcfc9fbc.jsonl`; the in-repo
`docs/docs/features/fix-asyncify-O2-and-modal-promise-rejection/{rtree,clipboard}-*-findings.md` and
`research/threading_*.md`; direct reading of the generated `tests/apps/kicad/pcbnew.js` runtime,
the `wxwidgets/src/wasm/` and `kicad/thirdparty/libcontext/` sources, and the
`scripts/common/` build pipeline; plus web research into Emscripten/Binaryen Asyncify and fibers
(sources listed in [`03-solutions-and-prior-art.md`](03-solutions-and-prior-art.md)).
