# Debugging guide — KiCad / wxWidgets WASM

A practical reference for debugging this project: the kinds of issues WASM +
Asyncify + browser builds throw at you, the tools that actually work here, and
the gotchas of our specific build pipeline. It is **not** a writeup of any one
bug — for a concrete worked example see [§6](#6-a-worked-example) and the
project memory.

If you're new to this codebase, read [§5 (project gotchas)](#5-project-specific-gotchas)
first — most wasted hours come from not knowing how the split build and the
shim layer behave.

---

## 1. Classes of issue we hit here

- **Engine-specific intolerance** — the same `pcbnew.wasm` runs in Firefox but
  not Chrome (or vice versa). Usually a V8-vs-SpiderMonkey difference in how an
  Asyncify-instrumented or very large function is handled.
- **Silent stalls vs. hard crashes** — execution stops making progress with *no*
  exception, trap, or crash report. Distinguishing "crashed" from "hung" from
  "stalled" is half the battle (§2.6).
- **Asyncify state problems** — unwind/rewind not completing, instrumentation on
  a function that shouldn't have it, or a function too large once instrumented.
- **Shim/codegen coupling** — `inject-dyncall-shims.sh` patches Emscripten output
  by pattern; a flag change that alters codegen can silently break those patches.
- **Tooling blind spots** — async console delivery, stripped name sections,
  Playwright hiding the renderer's stderr (§4).

---

## 2. Tools & techniques

### 2.1 Stub-bisection  *(the workhorse)*
Comment out / early-`return` a suspect call, rebuild, and observe a **binary
survives-or-fails** outcome. This is the most reliable signal we have because it
does **not** depend on reading logs (which lag — see §4). Narrow by halving:
disable half the suspects, see which half flips the outcome.
- *When:* you can localize a failure to "before/after some call."
- *Caveat:* at `-O2`, dead-code elimination removes more around an early `return`
  than you intend — keep this in mind when a stub "fixes" too much.

### 2.2 `SHIM_DIAGNOSTICS=1` fast loop  *(skip the rebuild)*
The only host-side JS step is `inject-dyncall-shims.sh`. Re-run it on a pristine
`pcbnew.js` while keeping the already-finalized/asyncified `pcbnew.wasm` — JS-only
changes go from a multi-minute rebuild to seconds:
```bash
cp output/pcbnew.pristine.js output/pcbnew.js
SHIM_DIAGNOSTICS=1 ./scripts/common/inject-dyncall-shims.sh output/pcbnew.js
cd tests && npm run setup:kicad
```
See the `wasm-build-fast-iteration` project memory.

### 2.3 Logging-only diagnostics module (`scripts/common/shims/diagnostics.js`)
Injected **only** when `SHIM_DIAGNOSTICS=1` (off by default, safe to leave in
tree). Provides hooks that need no rebuild:
- Asyncify lifecycle: `doRewind`, `handleSleep` (unwind/rewind markers).
- Modal lifecycle.
- A **WebGL call tracer** (did any GL call happen before the failure?).
- A **dynCall tracer**: wraps the shim-bound `dynCall_ii`/`dynCall_vi` to log
  `ptr`, `getWasmTableEntry(ptr).name` (the function index), and a JS stack for
  rare/large table indices. Arm it at the main rewind to bound log volume.
- Periodic asyncify-state monitor (catch "JS task queue stopped pumping").

Output is at `console.log` level (not error/warn). This is the JS-side tracer; the
C++ source diagnostics are separate and flag-gated — see §2.9.

### 2.4 Symbolizing wasm function indices
The loaded (post-asyncify) wasm has **no `name` section**, so V8/Firefox report
bare function indices (`func[20736]`). The Asyncify pass **preserves function
indices**, so a symbol map taken from the *pre-asyncify* wasm is still valid:
```bash
# the in-container wasm-opt is a STUB; use the real one
/emsdk/upstream/bin/wasm-opt.real <pre-asyncify pcbnew.wasm> --symbolmap=/tmp/syms.map
# then look up the index, e.g. 20736 -> PCB_EDIT_FRAME::setupUIConditions()
```
Generate the map from a build that still has names (the debug build's
pre-asyncify wasm). See §5 on names/DWARF.

### 2.5 Cross-engine comparison
Run the **same** diagnostics build in Firefox and Chrome and compare state at the
**same dispatch point** (e.g. asyncify `state`/`currData` at the suspect
`dynCall`). If both reach a point with identical state but only one proceeds, you
have isolated an engine-specific bug and can stop looking for a logic error.

### 2.6 Crash vs. hang vs. stall
A failure with no exception is not necessarily a crash. Find the renderer PID and
inspect it:
```bash
ps -axo pid,%cpu,%mem,command | grep -i 'Google Chrome'
sample <rendererPID> 3        # what is the main thread doing?
```
- **Idle in `CFRunLoop`/`mach_msg2_trap`, ~0% CPU** → a *stall* (event loop alive,
  but nothing scheduled to run). Not a deadlock.
- **Blocked on a futex / `Atomics.wait`** → a pthread/lock issue.
- **Spinning at 100%** → an infinite loop.
- **Gone + a `.ips` report** → a real signal crash.

To see the **renderer's own stderr** and a real crash reason, launch system
Chrome **outside Playwright** (Playwright forces `--disable-breakpad` and only
pipes the *browser* process stderr): serve `tests/apps` with the COOP/COEP headers
(`tests/serve.json`) and open the page in a normal Chrome with crash reporting on.
On-load failures need no interaction to reproduce.

### 2.7 Build-flag diagnostics
- `-sASSERTIONS=2` turns silent UB into named errors. **But** it changes
  Emscripten codegen and can break `inject-dyncall-shims.sh`'s `sed` patterns
  (causing a *different*, red-herring failure), and it implicitly enables
  `STACK_OVERFLOW_CHECK`, whose `___set_stack_limits` our host Asyncify pass
  strips → pair it with `-sSTACK_OVERFLOW_CHECK=0`. Prefer the §2.3 dynCall
  tracer on a normal build when you can.
- `--pass-arg=asyncify-asserts` (added to the `wasm-opt --asyncify` invocation in
  `apply-asyncify.sh`) adds Asyncify state-machine runtime checks — use it to
  validate the removelist (a wrongly-excluded function that *does* unwind is
  otherwise silent corruption).

### 2.8 Isolated standalone probes
`tests/apps/standalone/coroutine-pthread/` builds minimal C++ probes with the
*real* libcontext + Asyncify + pthreads + DYNCALLS + the shim, run via
`tests/e2e/coroutine-pthread.spec.ts`. Use these to reproduce a mechanism in
isolation. **Reality check:** an isolated probe often *won't* reproduce a bug
that needs the full app runtime — don't over-trust a green probe.

### 2.9 Source diagnostic logging flags (`--diag=`)
The KiCad C++ source carries built-in diagnostic logging, **off by default**,
enabled per category at build time:
```bash
./docker/build.sh --debug --diag=gal,coroutine,ctor    # or: --diag=all
```
| `--diag=` value | covers |
|---|---|
| `gal` | `[DIAG_GAL]` — GAL/WebGL pipeline (paint, context create/lock, init) |
| `coroutine` | `[WASM_FCONTEXT]` fiber switches + `[DIAG_TOOL]`/`[DIAG_DISP]` tool dispatch |
| `ctor` | `[DIAG_CTOR]` — `PCB_EDIT_FRAME` startup milestones |

- Each value maps to a `-DKICAD_DIAG_*` define that gates the `KI_DIAG_*` macros
  in `kicad/include/kicad_wasm_diag.h`. All output goes to **stdout** → it shows
  as `[KICAD_OUT]` logs, never `[KICAD_ERR]` errors.
- **Compile-time:** changing `--diag` changes `CMAKE_CXX_FLAGS`, so it forces a
  recompile (slow once per flag combo, then ccache-cached). Works with `--debug`
  or `--release`.
- Separate from the JS shim tracer (§2.3), which stays `SHIM_DIAGNOSTICS`-gated.

---

## 3. Principles

1. **Reproduce cleanly first** — a stable engine-X-fails / engine-Y-passes
   baseline before changing anything.
2. **Fix the build infra before iterating** — a flaky build wastes every
   subsequent experiment.
3. **Narrow by bisection**, with binary outcomes, not by staring at logs.
4. **Turn silent failures into named ones** (assertions, asyncify-asserts) or
   into a state comparison across engines.
5. **Know the tooling's blind spots** (§4) before trusting what it shows you.

---

## 4. Tooling blind spots (read before trusting output)

- **Console is async** — `printf`/`console.*` from WASM reaches Playwright via
  CDP asynchronously; the *last delivered* line can lag the real failure point.
  Use stub-bisection for ground truth, not "the last log line."
- **No name section** in the shipped wasm → bare indices (§2.4).
- **Asyncify shifts code offsets** — DWARF line info is generated before the host
  Asyncify pass rewrites the code, so source-line mapping on the *shipped* wasm is
  stale. Asyncify *does* preserve function indices and names.
- **Playwright hides the renderer** — forces `--disable-breakpad`, pipes only the
  browser process stderr (§2.6).
- **macOS `sample`/`.ips`** see wasm frames as numeric offsets, not C++ names.

---

## 5. Project-specific gotchas

- **Split build.** `docker/build.sh` compiles + links inside Docker, but the
  in-container `wasm-opt` and `wasm-emscripten-finalize` are **stubbed** (they OOM
  on the large wasm). The real `wasm-emscripten-finalize` and
  `wasm-opt --asyncify` run **on the host** afterward (`apply-finalize.sh`,
  `apply-asyncify.sh`). Real binary: `…/upstream/bin/wasm-opt.real`.
- **Per-branch Docker volumes.** The compose project name is derived from the git
  branch, so each branch has its own build-cache volume/container. Switching
  optimization level (`-O1`↔`-O2`) busts ccache and forces a full recompile.
- **COOP/COEP.** SharedArrayBuffer/pthreads need cross-origin isolation headers;
  serve `tests/apps` with `tests/serve.json` (`npx serve apps -c ../serve.json`).
- **The shim layer.** `inject-dyncall-shims.sh` binds bare `dynCall_<sig>` to the
  real `DYNCALLS=1` exports and patches several Emscripten empty-stub callbacks by
  `sed` pattern — so codegen-changing flags can silently break it.
- **Names / DWARF, concretely.** Neither build keeps a `name` section in the
  *runtime* wasm (it carries only `external_debug_info` + `target_features`). The
  **debug** build (`-O1 -g -gseparate-dwarf`) puts full DWARF in a ~1.5 GB
  `pcbnew.wasm.debug.wasm` sidecar (loaded on demand by DevTools' C/C++ extension);
  the **release** build (`-O2`, no `-g`) has neither names nor DWARF. So readable
  symbols come from the debug build's DWARF / the §2.4 symbol map, not from the
  shipped binary.

---

## 6. A worked example

The **Chrome-only startup stall** (May 2026): V8 could not run the
Asyncify-*instrumented* `PCB_EDIT_FRAME::setupUIConditions()` (a huge function
that never actually unwinds) when it was invoked from the Asyncify-rewound
constructor stack — a silent stall, not a crash; Firefox ran the identical wasm
fine. Found with stub-bisection (§2.1) + the dynCall tracer (§2.3) + symbol map
(§2.4) + cross-engine state comparison (§2.5) + `sample` (§2.6).

A **second instance** of the same family (May 28, 2026) hit the line-drawing
coroutine: V8 stalled at the first instruction of the asyncify-instrumented
`libcontext::wasm_fcontext_entry` trampoline when a new fiber for
`pcbnew.InteractiveDrawing.line` was entered.  The `[DIAG_TOOL]` log showed
the activate dispatching and `[WASM_FCONTEXT]` showed `jump-swap` completing,
but `entry-call` (logged on the new fiber's first statement) never fired —
the tool's button visually never toggled, and tests on headed Chrome **could
not reproduce** it (same wasm, different cumulative asyncify state).  Trying
to add the trampoline / `COROUTINE::callerStub` to `ASYNCIFY_REMOVE` broke
runtime because both functions sit ON the suspend chain (their callees
`emscripten_fiber_swap` / suspendable tool bodies), so removing them from
instrumentation orphans the rewind — `null function` / `ASM_CONSTS` errors.

The systemic fix (see [§7](#7-debug-vs-production-builds)) is now **committed
default**: run `wasm-opt -O2` as a separate pass after `--asyncify` in
`scripts/common/apply-asyncify.sh`.  This shrinks every instrumented function
back under V8's threshold, including the coroutine trampolines that can't be
removelist'd.  The legacy `ASYNCIFY_REMOVE` entries (`setupUIConditions`
etc.) are kept as a redundant safety net — under `-O2` they're no longer
required but are harmless.

Details: the `chrome-asyncify-rewind-crash` and `bundle-size-asyncify-optimization`
project memories, and git history of `apply-asyncify.sh`.

---

## 7. Debug vs. production builds

The committed default is the **debug** build (compiled `-g -gseparate-dwarf`,
DWARF sidecar) with `apply-asyncify.sh` running `wasm-opt --asyncify` followed
by `wasm-opt -O2` (May 28, 2026).  Result: ~187 MB wasm / ~65 MB gzip, full
source-level debugging.  Switch to release (`./docker/build.sh` without
`--debug`) for an even smaller shippable build with no DWARF.

### What the knobs do
Two independent knobs:
- **`-g` (debug info)** — whether a source map exists at all. Debug =
  `-g -gseparate-dwarf` (DWARF sidecar); release = none.
- **`-O` (optimization)** — how much the code is rewritten. This is what actually
  fixes the "function too big for V8" class of bug, because Asyncify emits
  deliberately verbose instrumentation (spills every live local) and **relies on
  the optimizer to coalesce it back down**. The Emscripten/Binaryen docs are
  emphatic that you must optimize when using Asyncify.

### How the build flow uses both
1. **Docker compile + link** (`./docker/build.sh [--debug]`) produces an
   un-finalized, un-asyncified wasm.  `--debug` controls only `-g`; the
   `-O2` optimisation level is set unconditionally at compile time.
2. **Host post-processing** (`scripts/common/apply-finalize.sh` then
   `scripts/common/apply-asyncify.sh`):
   - `wasm-opt --asyncify` instruments suspendable functions.
   - `wasm-opt -O2` (added May 28, 2026) shrinks every instrumented
     function back under V8's per-function locals limit, fixing the
     "Chrome-only stall on coroutine entry" class of bug systemically.
     Without this pass, large asyncify-instrumented functions like
     `PCB_EDIT_FRAME::setupUIConditions()` or libcontext's
     `wasm_fcontext_entry` silently stall in Chrome's V8 even though
     Firefox runs them fine.  The two passes are run separately so peak
     RAM stays ~10–15 GB (one heavy `wasm-opt` at a time).
3. **Shim injection** (`scripts/common/inject-dyncall-shims.sh`) adds the
   asyncify-aware dynCall bindings and the nested-asyncify `handleSleep`
   wrapper to `pcbnew.js`.

### The `ASYNCIFY_REMOVE` list (in `apply-asyncify.sh`)
With `-O2` after asyncify, no large function should exceed V8's limit anymore,
so the removelist is mostly a redundant safety net.  Two situations still
warrant adding to it:
- A function whose subtree does **not** asyncify-suspend (so removing it is
  always safe) and that you're confident never needs to participate in
  unwind/rewind.  Example: `setupUIConditions()` — registers handlers, never
  yields.
- **Don't** add functions on the asyncify-suspend chain (coroutine
  trampolines, anything calling `emscripten_fiber_swap` / `EM_ASYNC_JS`):
  removing them orphans the rewind path and you get `null function` /
  `ASM_CONSTS[code] is not a function` at runtime.

### Measured result (May 2026)
| build | raw wasm | gzip | source-level debugging |
|---|---|---|---|
| debug, asyncify only (old default) | 338 MB | 137 MB | full (DWARF sidecar) |
| debug + asyncify + `-O2` (current default) | **187 MB** | **65 MB** | full (DWARF sidecar) |
| release + asyncify + `-O2` | smaller still | — | none |

The optimized build passes Chrome **and** Firefox `select draw lines` e2e,
fixes the user-reported "line tool doesn't toggle in real Chrome" stall, and
makes the test load+run ~2× faster (smaller wasm parses faster).  Tradeoff:
each build now spends an extra ~10 minutes on the `-O2` pass.
