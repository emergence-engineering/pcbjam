# 03 — Toolchain compatibility status (verified 2026-06-10/11)

## The compatibility matrix

| Combination | Status |
|---|---|
| `ASYNCIFY=1` + `-fexceptions` (ours today) | Supported; the expensive-but-working baseline |
| `ASYNCIFY=1` + `-fwasm-exceptions` | emcc emits a **warning, not an error** ("Parts of the program that mix ASYNCIFY and exceptions will not compile"); Binaryen support is **partial** — everything except unwinding from inside a catch arm (see 05) |
| `SUPPORT_LONGJMP=emscripten` + `-fwasm-exceptions` | **Hard error** in emcc; wasm-EH pairs with `SUPPORT_LONGJMP=wasm` (automatic default) |
| JSPI (`-sJSPI`) + `-fwasm-exceptions` | Compatible (JSPI doesn't transform the wasm) — **but fibers do not exist under JSPI** (`Asyncify.setDataHeader is not a function`, emscripten #18180), and KiCad tools are fibers → JSPI stays closed for us |
| Mixing `-fexceptions` and `-fwasm-exceptions` objects at link | Not supported; produces inconsistent internal state (emscripten #20165, #18500) — flag flip must be uniform across wx + kicad + test apps |

## Binaryen history (the part that moved since our earlier research)

- **Partial asyncify+wasm-EH support merged upstream 2025-11-19**, commit `ad13362b`
  "Add partial support for -fwasm-exceptions in Asyncify (#5343) (#5475)" — these are the
  caiiiycuk PRs from 2022/2023 (the author previously maintained the
  `caiiiycuk/binaryen-fwasm-exceptions` fork). Shipped in **binaryen v125**
  (released the same day). Upstream is at **v130** (2026-06-01).
- The merge is **+114 lines** in `src/passes/Asyncify.cpp` plus 1,139 lines of lit tests
  (`asyncify_pass-arg=asyncify-eh*.wast`): Try-body traversal + an asserts-mode tripwire.
  Details and the remaining hole in [`05-asyncify-fork-design.md`](05-asyncify-fork-design.md).
- Notable gaps in current main: the documented `asyncify-ignore-unwind-from-catch` pass-arg
  is **not consumed anywhere in the code** (dead docs); **`TryTable` (standardized
  exnref EH encoding) is entirely unsupported** by the pass; tail calls remain fatal.
- Tracking issue for full support: **WebAssembly/binaryen #4470** (open).

## Our local toolchain

- emsdk-bundled `wasm-opt`: **v121** (`version_121-72-g7353da707`) — verified **612 commits
  behind** the EH merge. We do not have even the partial support locally.
- This only matters for the **post-link step**: `scripts/common/apply-asyncify.sh` resolves
  its binary via `scripts/common/get-wasm-opt.sh`, so a newer/patched wasm-opt can be
  slotted in for asyncify alone, without touching the emsdk compiler side.
  (`apply-finalize.sh` keeps using the emsdk `wasm-emscripten-finalize`; cross-version
  binary compatibility at the .wasm level is fine.)
- The compiler side (LLVM emitting wasm-EH instructions) has been mature for years; the
  emcc warning about ASYNCIFY=1 is expected and survivable once the Binaryen side is fixed.

## setjmp/longjmp inventory (often raised as a blocker — it is not)

- KiCad: **zero** direct `setjmp`/libpng usage outside `thirdparty/` (and `thirdparty/`
  does not bundle libpng). All image I/O goes through `wxImage`.
- wxWidgets bundles `png`, `jpeg`, `tiff`, `zlib`. Both libpng's `pngerror.c` and wx's own
  PNG handler use the classic pattern (`src/common/imagpng.cpp:319/:527` `setjmp`, `:204`
  `longjmp`); libjpeg's error manager likewise.
- Today this rides JS-based SjLj (default `SUPPORT_LONGJMP=emscripten`, invoke machinery).
  Under wasm-EH it becomes `SUPPORT_LONGJMP=wasm` automatically, **no source changes**.
  Constraints don't bite: setjmp is not called from C++ catch clauses there, and the
  PNG/JPEG decode paths never suspend (pure computation → never asyncify-instrumented →
  the unwind-from-catch limitation cannot arise in them).

## The parked end-to-end experiment (2026-06-11) — what it taught us

A parallel session actually built pcbnew with wasm-EH end-to-end
(`docs/wasm-exceptions-experiment.md`; full plumbing patch in its appendix, gated behind
`KICAD_WASM_EH=1`). Findings that supersede/extend the matrix above:

- Working flag set: `-fwasm-exceptions -sSUPPORT_LONGJMP=wasm -sWASM_LEGACY_EXCEPTIONS=0`,
  uniformly on **every compile and link** (deps incl. boost/cairo/harfbuzz, wx, kicad).
- Result: links clean, **raw pcbnew 92 MB** (vs 338 MB post-asyncify pre-O2 today), zero
  `invoke_*`/`dynCall` — corroborates this dossier's measurements from the compiler side.
- **Blocker #1 (before the catch issue ever arises): emscripten 4.0.2's LLVM emits an
  invalid `br_table`** (label arity mismatch) in OpenCASCADE
  (`ShapeUpgrade_SplitSurface::Build`) under wasm-EH — module malformed at the source; no
  Binaryen can fix it. Resume = emsdk bump (5.0.7+), then full clean rebuild (~2.5–3 h).
- **Encoding wrinkle:** 4.0.2's *legacy* encoding output failed Binaryen parsing
  (`popping from empty stack`), forcing `WASM_LEGACY_EXCEPTIONS=0` (exnref). But the
  asyncify pass has **zero `TryTable` support** (05 §2) — so after the emsdk bump, the
  encoding decision forks the asyncify work: legacy → v125 partial support + the
  catch-arm-hoisting pre-pass; exnref → TryTable support + exnref spilling (05 §new-EH).
- Ops gotchas recorded there: deps scripts skip-if-stamped (flag changes don't trigger
  rebuilds — `undefined symbol: emscripten_longjmp` from stale `libcairo.a`); CI already
  self-builds Binaryen v130 for the post-link chain; build-time payoff is also large (the
  ~52 min `-O2` pass shrinks with the module).

## Browser support notes

wasm-EH (legacy encoding) is supported across modern Chrome/Firefox/Safari. One watch item
from research: a Safari 26.0 regression crashing `-fwasm-exceptions` apps at startup was
reported September 2025 (emscripten #25365) — re-check status at migration time.
