# 05 — Asyncify.cpp internals and the catch-arm-hoisting fork design

> Based on a direct read of `src/passes/Asyncify.cpp` @ binaryen main (2,030 lines,
> 2026-06-11) and the merged partial-support commit `ad13362b` (+114 lines + 1,139 test
> lines, shipped in v125).

## §1. How the pass works (the 60-second model)

From the header comment (lines 56–97): three states (`__asyncify_state` =
Normal/Unwinding/Rewinding).

- **Unwind:** every instrumented call is followed by
  `if (unwinding) { note call index; save locals; return }` — the stack collapses via
  ordinary early returns, recording a path of call indices into the asyncify buffer.
- **Rewind:** re-enter the function from the top and *fall forward*: every non-call
  statement is wrapped `if (state == Normal)` (skipped while rewinding); every call in
  `if (normal OR call-index-matches)` — control "skips along" to the suspended call and
  re-enters callees the same way. Locals are restored from / spilled to linear memory
  (`AsyncifyLocals`).
- Pipeline (per instrumented function): `flatten` → `dce` → optimizers → `AsyncifyFlow`
  (call-index + skip logic) → [asserts walkers] → `AsyncifyLocals` (spill/restore).

## §2. What the v125 "partial support" actually is

- `AsyncifyFlow` traverses a `Try`'s **body** like any control flow (suspending inside a
  try body works), but **`catchBodies` are skipped wholesale** — line ~1172:
  *"catchBodies are ignored because we assume that pause/resume will not happen inside
  them."* Handler code gets no call indices, no unwind checks, no rewind steering.
- Asserts mode adds `AsyncifyUnwindWalker` (lines ~1358–1420): every call lexically inside
  a catch arm (found via the expression stack: inside a `Try` but not in its `body`) is
  wrapped with `if (state != Normal) unreachable` — a **tripwire, not support**. Without
  asserts, a suspend inside a catch silently corrupts (callee early-returns with
  state=Unwinding; the uninstrumented handler barrels on with a garbage value).
- Dead doc: the header documents `--pass-arg=asyncify-ignore-unwind-from-catch`, but the
  flag is **never consumed** in current main.
- **`TryTable` (standardized exnref EH) is not handled at all** — it would hit
  `WASM_UNREACHABLE("unexpected expression type")` in the flow walker.

## §3. Why catch arms are structurally hard (not just unimplemented)

Rewind steers with plain `if`s and forward motion. A wasm **catch arm cannot be entered by
falling into it** — only the engine's exception dispatch transfers control there. So
"rewind back into the middle of a catch handler" is impossible in this scheme: you would
have to re-throw, which would re-run (or mis-skip) the try body in rewind state. Separately,
the in-flight caught-exception state (what `rethrow` consumes) is not something asyncify
can save to linear memory.

## §4. The fork: catch-arm hoisting (outlining)

Stop needing to re-enter catch arms — make the handler ordinary code. A pre-transform on
structured IR (before `flatten`), applied only to instrumented functions whose catch arms
contain potentially-state-changing calls (the `ModuleAnalyzer` already knows):

```wat
(try (do BODY)
     (catch $__cpp_exception HANDLER))        ;; payload: i32 exception ptr
;; becomes:
(block $done
  (try (do BODY)
       (catch $__cpp_exception                 ;; arm now contains ONLY:
         (local.set $exn (pop i32))            ;;   capture payload
         (local.set $inCatch (i32.const 1))))  ;;   set flag — nothing suspendable
  (if (i32.eqz (local.get $inCatch)) (br $done))
  HANDLER')                                    ;; hoisted: plain straight-line code
```

After this, the existing machinery does everything for free: `HANDLER'` gets call indices,
unwind checks, and rewind steering like any other code; `$exn` is an ordinary i32 local, so
`AsyncifyLocals` spills/restores it across suspension automatically. The upstream invariant
("no pause/resume inside catchBodies") becomes true **by construction**. The `br $done`
guard is state-aware, so during rewind control falls into `HANDLER'` and the call-index
peek steers to the suspended call.

### The rethrow problem and its translation

LLVM's C++ lowering places a `rethrow` in catch arms on the personality **no-match** path
(user-level `throw;` compiles to a `__cxa_rethrow()` *call* — no instruction issue).
`rethrow` is only valid lexically inside a catch, so hoisted code must translate:

```
rethrow $T   →   throw $__cpp_exception (local.get $exn)
```

Sound for the C++ tag because the i32 payload *is* the exception identity; all libc++abi
state is driven by the `__cxa_*` calls, preserved verbatim (`__cxa_begin_catch` is only
called on the matched path, so the no-match translation does not disturb handler counts).
Known observable delta: an exception escaping to JS after such a re-throw is a fresh
`WebAssembly.Exception` (object identity / stack trace) — acceptable, document it.

### Hard limits (kept deliberately)

- Only tags whose payload fully identifies the exception are hoistable
  (`__cpp_exception`'s i32 qualifies). **`catch_all` arms — LLVM cleanup pads
  (destructors-during-unwind) and foreign-exception paths — cannot be hoisted** (no payload
  to re-throw); they keep the asserts tripwire. This is the right boundary for KiCad: all
  85 audited sites are C++ catches; suspending destructors-during-unwind is the case the
  audit expects zero of.
- Make hoisting tag-configurable: `--pass-arg=asyncify-hoist-catch-tags@__cpp_exception`.

### Fiddly-but-tractable engineering list

- Tries with concrete result types: route arm values through a temp local.
- Nested tries inside hoisted handlers: recurse; resolve each `rethrow`'s target Try and
  translate only those referring to hoisted-from tries (payload local per hoisted try).
- `delegate` arms: untouched by arm hoisting (they live on the body side), but must be
  regression-tested.
- Label scoping: hoist to immediately-after-the-try (same enclosing blocks) so every outer
  branch target stays in scope.
- Pipeline placement: run pre-`flatten`, per-function, only where the analyzer says a catch
  arm can change state — keeps the transform off the 99% of tries that never suspend.
- Tests: extend the v125 lit tests (`asyncify_pass-arg=asyncify-eh*.wast`); binaryen's
  fuzzer has asyncify support — use it.

### The new-EH (TryTable) variant, for later

Under `try_table`/exnref the handlers are *already* plain blocks outside the try — the
hoisted shape is the native shape. The hard part there is exnref liveness across
suspension (reference types cannot be stored to linear memory): park the exnref in an
auxiliary exnref table slot, save the slot index in the asyncify buffer, `throw_ref` from
the slot on the cleanup path. Worth doing when Emscripten flips `WASM_LEGACY_EXCEPTIONS`
off by default; until then the legacy hoisting fork is the pragmatic target.

**Reality check from the parked experiment (03 §experiment):** emscripten 4.0.2's
*legacy*-encoding output failed Binaryen parsing outright, so the end-to-end experiment
had to force `WASM_LEGACY_EXCEPTIONS=0` (exnref). Which variant of this design applies is
therefore decided **after the emsdk bump** that fixes the LLVM `br_table` bug: if newer
LLVM emits parseable legacy encoding → the §4 hoisting pre-pass; if exnref remains the
only viable encoding → this §TryTable variant (larger: TryTable traversal in
`AsyncifyFlow` + exnref spill machinery) becomes the required work. Budget accordingly
before committing to either.

## §5. Effort, deployment, upstreaming

**Key deployment insight (2026-06-11): this is a PRE-pass, not a fork of Asyncify.cpp.**
The hoisting is a standalone, semantics-preserving wasm→wasm rewrite on standard EH
constructs. Run it before stock `--asyncify` and the stock pass's assumption ("no
pause/resume inside catchBodies") holds by construction — zero changes to the asyncify
pass itself. It can even share one invocation (`wasm-opt --hoist-cpp-catches --asyncify
--pass-arg=… -O2` — passes run in listed order), avoiding an extra 111 MB roundtrip.

Three deployment grades:

1. **Zero-fork:** standalone native tool in our repo linking *stock* libbinaryen (C/C++
   API has full EH expression support). Costs one extra parse/write roundtrip per app.
   (`binaryen.js` is not viable — wasm32 4 GB ceiling vs our module sizes.)
2. **Additive build (recommended):** one new file `src/passes/HoistCppCatches.cpp` + two
   registration lines; no existing binaryen code modified → rebases trivially.
   `get-wasm-opt.sh` already has the path: `BINARYEN_BUILD_FROM_SOURCE=1` clones a tag and
   builds wasm-opt (cached in `build-wasm/tools/`) — pointing the clone at our branch is a
   one-line change.
3. **Upstream (end state):** because nothing in `Asyncify.cpp` changes, this is a pure
   addition — file the design on binaryen #4470 first; if accepted, grade 2 collapses
   into stock wasm-opt.

Notes:
- **Size/effort:** ~400–800 lines + lit tests. **1–2 weeks** for someone comfortable in
  Binaryen IR (Builder, branch-utils), plus fuzzing time.
- **Binaryen ≥ v125 is required for the `--asyncify` step regardless** (partial EH
  support); emsdk bundles v121. Already-solved infra: `BINARYEN_VERSION=130` makes
  `get-wasm-opt.sh` download the official release — v130 output was previously validated
  by the full e2e suite (adopted for the v121 -O2 slowness fix). Heed the script's
  version-skew warning: re-validate e2e after any bump.
- **Mechanics:** preserve the names section (`-g`) if hoisting runs as a separate
  invocation (ASYNCIFY_REMOVE matches by name); verify EH feature flags ride the binary's
  `target_features`; start with hoist-all-cpp-catches (no call-graph analysis needed,
  `-O2` cleans up), keep selective hoisting (suspendable-closure only) as a refinement.
- **Payoff coupling:** with this pass, the wasm-EH migration needs **no KiCad refactor**
  (04), and the measured −44% download / −35% module (02) becomes reachable with: binaryen
  bump + this pass + uniform flag flip + dropping `env.invoke_*` from
  `apply-asyncify.sh:33`.
