# 02 — Measurements: our controlled experiment + published benchmarks

## §1. Our experiment (pcbnew, 2026-06-10)

**Question:** how much of the asyncify size tax is invoke-driven (i.e., would vanish under
wasm-EH)?

**Method:** take the saved pre-asyncify artifact `output/pcbnew.finalized.wasm` (111 MB,
post-link, post-finalize, pre-asyncify) and run the production post-link pipeline
(`apply-asyncify.sh`: `wasm-opt --asyncify` + `wasm-opt -O2`, Binaryen v121) three ways,
into `output/measure/` (originals untouched):

1. **O2-only** (no asyncify) — the floor; *not a shippable config* (the app needs asyncify).
2. **Asyncify, `env.invoke_*` dropped** from the imports list — the wasm-EH proxy.
3. **Asyncify, full imports** — the shipped configuration (control).

Control sanity check: variant 3 reproduced the production `pcbnew.wasm` size exactly
(187 MB), so the pipeline replication is faithful.

**Results:**

| Variant | Raw | gzip -9 |
|---|---|---|
| O2-only floor | 77.6 MB | 19.8 MB |
| Asyncify w/o invokes (wasm-EH proxy) | 122.1 MB | 36.0 MB |
| Asyncify full (shipped) | 187.3 MB | 64.5 MB |

**Decomposition:**

- Total asyncify tax today: **+109.7 MB raw = +141% over floor** (+44.7 MB gzip). That is
  ~2× the worst-case figures in the published literature — KiCad is an extreme asyncify
  case, and the invoke graph is why.
- **Invoke-driven share of the tax: 59% raw (65.2 MB), 64% gzip (28.5 MB).** This is the
  part wasm-EH eliminates.
- The remaining no-invoke tax (+44.5 MB, +57% over floor) is the legitimate cost of the
  real suspend chains (fibers + modal/clipboard sleeps) — in line with the published ~50% —
  and is kept under any design.

**Headline:** wasm-EH ≈ **download 64.5 → 36.0 MB (−44%), module 187 → 122 MB (−35%)**,
before counting runtime. The real wasm-EH build differs from the proxy in both directions:
it also deletes the invoke wrappers + JS-EH glue outright (smaller still) while adding
wasm-EH's own try/catch instructions (~+4% per published prototype data).

**Caveats:** (a) the no-invoke proxy is **semantically unsound under `-fexceptions`** —
with invokes present in JS but uninstrumented in wasm, the first suspension crossing a try
frame corrupts state; measurement artifact only, never ship. (b) The finalized input is a
May 26 snapshot while today's apps are newer — irrelevant for the *relative* comparison
(same input, same tool, only the imports list varies). (c) Runtime gain is not directly
measurable from these artifacts; the size-tracks-speed heuristic (Zakai) plus the published
reports below are the basis for the runtime estimate.

## §2. Published benchmarks and field reports (researched 2026-06-10)

No clean head-to-head JS-EH vs wasm-EH benchmark of a large C++ app exists; triangulate:

**Asyncify instrumentation tax (the thing our invoke graph inflates):**

| Source | Workload | Numbers |
|---|---|---|
| Alon Zakai, "Pause and Resume… Asyncify" (2019, canonical) | multiple benchmarks | size ~**+50%** typical, ≤2× worst; speed tracks size; **22%** Fannkuch; **5×** pathological when one huge function dominates (SQLite 150→300 KB) |
| wa-sqlite (production, measured) | SQLite wasm | default asyncify **+70.6%** → **+35.3%** after narrowing instrumentation to the ~6 actually-async entry points (auto-detection had instrumented 700+ functions) |
| Wasmer PHP/WordPress (production) | PHP setjmp/longjmp via asyncify | **1.5× size, 2× slower**; replacing with wasm-EH SjLj: **2×** faster cold start (120→60 ms), separately **4×** (100→25 ms) |
| WordPress Playground | auto-detected asyncify list | ~70,000 functions instrumented, startup +4.5 s, fixed by manual list |

**JS-EH (`invoke_*`) tax:**

| Source | Workload | Numbers |
|---|---|---|
| OpenCascade.js (CAD kernel — closest cousin to KiCad's code character) | STEP file load | global JS-EH **~10 min → ~2 min (~5×)** with narrowed EH; "performance degradation and file size impact is currently massive" |
| emscripten discussion #17526 | JS-EH → wasm-EH | "not just 2× faster, but an order of magnitude" (anecdote) |
| Emscripten docs (Box2D) | `-fno-rtti -fno-exceptions` | −15% size (RTTI+EH combined; only weak isolation) |

**wasm-EH's own cost (what we'd pay instead):**

| Source | Numbers |
|---|---|
| Heejin Ahn, TPAC slides (prototype) | **+4%** whole-module instructions, **+11%** in exception-using functions |
| V8 / Emscripten docs | non-throwing path **~zero cost** by design |

**Most transferable to us:** wa-sqlite's 70.6→35.3 (the narrowing effect — ours measured
59–64%) and OpenCascade's ~5× (exception-dense C++ file loading — our `LoadBoard` path).
Triangulated runtime expectation for KiCad: **1.5–3× on load/parse/geometry paths**, more
on exception-dense I/O paths.

## §3. Reproducing

```sh
# control (uses the project script unmodified):
./scripts/common/apply-asyncify.sh output/pcbnew.finalized.wasm output/measure/pcbnew.asyncify-full.wasm
# proxy: same script with ASYNCIFY_IMPORTS="env.__asyncjs__*,env.emscripten_fiber_swap"
# floor: $(scripts/common/get-wasm-opt.sh | tail -1) -O2 in.wasm -o out.wasm
# then: ls -l + gzip -9c | wc -c
```
