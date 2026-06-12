# 01 — The two exception-handling models, and where ours bleeds into Asyncify

## What we build with today

Every layer is on **`-fexceptions`** = Emscripten's JavaScript-based EH:

- `scripts/build-wxuniversal-wasm.sh:141-142` (wxWidgets CFLAGS/CXXFLAGS)
- `scripts/kicad/build-kicad-target.sh:203/207/211/214` (KiCad, with the comment at `:196`:
  "-fexceptions is required because wxWidgets is built with exceptions enabled")
- `tests/apps/Makefile.wasm` (standalone test apps)

No `SUPPORT_LONGJMP` is set anywhere → default `emscripten` flavor (JS-based setjmp/longjmp
through the same machinery).

## Model 1 — JS-based EH (`-fexceptions`), what actually happens

- A C++ `throw` compiles to a call out to JS (`__cxa_throw`), which throws a **JavaScript
  exception** carrying an i32 pointer (the C++ exception object in linear memory).
- Every call that may need cleanup-during-unwind (anything inside a `try`, or in a function
  with destructors on the unwind path) is routed through an **`invoke_<sig>` wrapper** — a
  JS function that does `stackSave()`, calls back into the wasm table inside a JS
  `try/catch`, and on catch runs `stackRestore(sp)` + `_setThrew(1)` so the wasm side can
  run destructors and re-dispatch. The generated `pcbnew.js` contains **1,049 `invoke_`
  references**.
- Consequence: a "C++ call stack" is really a **wasm→JS→wasm→JS sandwich**, and C++
  exceptions physically travel through JS frames.

## Model 2 — native wasm-EH (`-fwasm-exceptions`)

- `try`/`catch`/`throw` are **wasm instructions** (the exception-handling proposal;
  standardized, supported in all modern browsers — note the legacy encoding vs the newer
  `exnref`/`try_table` encoding, controlled by Emscripten's `WASM_LEGACY_EXCEPTIONS`,
  default legacy as of this writing).
- No `invoke_*` wrappers exist at all. Throws never enter JS. The non-throwing path of a
  `try` is ~zero-cost in modern engines. `SUPPORT_LONGJMP=wasm` rides the same instructions.

## The three concrete couplings into our Asyncify machine

**1. JS-EH is why Asyncify instruments almost everything.**
`scripts/common/apply-asyncify.sh:33`:

```
ASYNCIFY_IMPORTS="env.invoke_*,env.__asyncjs__*,env.emscripten_fiber_swap"
```

`env.invoke_*` is listed because suspensions genuinely flow through invokes (a modal opened
inside a parser's `try`, a tool yielding inside a try-scope). But every invoke is an import
call, so marking them suspension-capable breaks the static call graph at ~1,049 places and
the "can this suspend?" analysis answers *yes* for most of KiCad → near-total
instrumentation. This is the root of: the 338 MB pre-O2 binary, the V8 per-function-locals
silent-stall family (see memory/`chrome-asyncify-rewind-crash`), the `ASYNCIFY_REMOVE`
list, and the mandatory post-asyncify `wasm-opt -O2` pass. Under wasm-EH the imports list
shrinks to `env.__asyncjs__*,env.emscripten_fiber_swap` and instrumentation collapses to
the genuine suspend chains.

**2. JS-EH is why our wasm stacks have JS frames in the middle.**
Every asyncify unwind must early-return through, and every rewind must re-establish, the
invoke sandwich layers. The async dossier's test matrix calls out "`-fexceptions` invoke
wrappers" as a failure axis and `vcall_repro` (`invoke_vi`→`dynCall_vi`) as the smoking
gun. Phases 1–2 of `scripts/common/inject-dyncall-shims.sh` (per-signature dynCall
bindings, empty-callback fixes) exist substantially to keep this machinery alive after
asyncify+O2.

**3. JS-EH is why C++ throws can interact with the asyncify JS runtime at all.**
Under JS-EH a C++ exception *is* a JS exception: it can tear through
`Fibers.trampoline()`'s `do/while` exactly like the `throw "unwind"` park does (the §3c
trampoline self-heal in `inject-dyncall-shims.sh` guards that), and the invoke wrapper's
catch performs `stackRestore(sp)` — a stack-pointer write from a JS frame — while fibers
juggle the same stack pointer. Under wasm-EH this entire interaction class disappears.

## What wasm-EH does NOT change

The Asyncify *correctness* problems (single global `Asyncify.currData`, the crash/hang
family in `docs/features/async/`) are identical under either EH mode. Modals, clipboard, fonts,
and fiber swaps still suspend through the same register. wasm-EH is a de-bloating /
de-fragilizing move, not a concurrency fix. The arbiter is needed either way.
