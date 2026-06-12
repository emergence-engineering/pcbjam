# Asyncify `currData` contention in KiCad-WASM — research dossier

> **Status:** research / understanding only. No implementation has been chosen.
> Authored 2026-06. All line numbers are against the artifacts current at that time
> (`tests/apps/kicad/pcbnew.js`, `wxwidgets/src/wasm/*.cpp`,
> `kicad/thirdparty/libcontext/libcontext.cpp`, `wxwidgets/src/common/init.cpp`).

## Why this exists

While bringing up `tests/kicad/load-pcb.spec.ts` (load a real `.kicad_pcb` through
File→Open), three distinct errors surfaced. One is fixed; two remain and turned out to be
**the same underlying disease**: Emscripten Asyncify has a single global suspension register
(`Asyncify.currData` + `Asyncify.state`), but KiCad-WASM has **three independent subsystems**
that all drive it (tool coroutines, modal/clipboard sleeps, and the parked main loop). When any
two overlap, one reads a buffer that no longer belongs to it → **crash** (`index out of bounds`)
or **hang** (a swap unwinds but is never rewound).

## TL;DR

- **The single slot is not a WebAssembly/Binaryen law — it's a choice in Emscripten's JS
  runtime.** The Binaryen Asyncify pass is multi-buffer by design; `asyncify_start_unwind`/
  `asyncify_start_rewind` take the buffer pointer as an argument.
- **"Give each context its own buffer" is the standard, supported solution** — it's literally
  what Emscripten *fibers* are, and what QEMU/TinyGo/Pyodide do. We already do it for tool
  coroutines (each `wasm_fcontext` owns a buffer). The bug is that the **fiber path and the
  `handleSleep` path both blindly overwrite the one global `currData` register.**
- **We are not switching to JSPI.** The fix stays within Asyncify, in the wasm/shim layer.
- **The achievable universal fix** is a single cooperative scheduler that owns `currData` (and
  the fiber trampoline) and treats every suspendable thing — coroutines, modals, clipboard,
  fonts, and the main loop itself — as a registered context with its own buffer.

## Document index

| File | Contents |
|---|---|
| [`01-background-and-findings.md`](01-background-and-findings.md) | The originating session, the e2e test + logs, and the three concrete bugs (rtree=fixed; clipboard crash; tool-open hang). |
| [`02-asyncify-internals.md`](02-asyncify-internals.md) | The machine, in detail: what "sleeps", the single `currData`/`state`, the three producers, `handleSleep`/`fiber_swap`/trampoline, the #9153 shim, and full control-flow walkthroughs (startup→park, the hang, the crash, **de-parking** down to the JS line). |
| [`03-solutions-and-prior-art.md`](03-solutions-and-prior-art.md) | Is there a real solution? Per-context buffers, who has done it, why we're not switching to JSPI, and the unified-authority recipe with failure modes. Sources/URLs included. |
| [`04-decisions-tests-open-questions.md`](04-decisions-tests-open-questions.md) | How the fix options relate (what's subsumed vs. genuinely separate), the one diagnostic that decides scope, the combinatorial test matrix, and open questions. |
| [`05-design-a-js-asyncify-arbiter.md`](05-design-a-js-asyncify-arbiter.md) | Incremental design: keep current `EM_ASYNC_JS` sleeps and fibers, but put one JS arbiter in charge of `currData`, transition queueing, and the trampoline. Includes concept explanations. |
| [`06-design-b-fiber-first-runtime.md`](06-design-b-fiber-first-runtime.md) | Cleaner long-term design: make modals, clipboard, fonts, nested loops, and tools all scheduler-owned fiber-like contexts. Explains how this relates to de-parking and app lifetime. |

## The single decisive next step

Before designing anything, **measure whether `Asyncify.currData` is clean (null) at the moment
`wxGUIEventLoop::DoRun()` throws `"unwind"`** (and at the first rAF tick, and at the first
post-startup `emscripten_fiber_swap`). That one fact determines whether the universal fix must
also reshape the main loop ("de-parking") or whether a per-context `currData` authority alone
suffices. Details in [`04-decisions-tests-open-questions.md`](04-decisions-tests-open-questions.md).
