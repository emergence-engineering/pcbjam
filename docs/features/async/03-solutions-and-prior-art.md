# 03 — Is there a real solution? Per-context buffers and prior art

## §1. Yes — one data buffer per context

**The single global slot is NOT a WebAssembly or Binaryen law. It is a choice in Emscripten's
high-level JS runtime.** "Store one for each place; each unwind/rewind pair has its own data
slot" is the standard, supported solution.

- **The Binaryen Asyncify pass is multi-buffer by design.** `asyncify_start_unwind(dataPtr)` and
  `asyncify_start_rewind(dataPtr)` *take the buffer pointer as an argument* — the pass has no
  global "current buffer." Alon Zakai's Asyncify writeup: *"In this example we have just one such
  structure … to implement something like coroutines **you would use one data structure for
  each.**"*
- **The single slot lives in Emscripten's `libasync.js`**, as global `Asyncify.currData` plus the
  guard in `whenDone()`: `assert(!Asyncify.asyncPromiseHandlers, 'cannot have multiple async
  operations in flight at once')`. The docs state the rule plainly: *"It is not safe to start an
  async operation while another is already running."* That guard, not the wasm, is what we trip.

**We already implement per-context buffers — for fibers.** Each tool coroutine is a
`wasm_fcontext` embedding its **own** asyncify buffer (`libcontext.cpp:98`,
`char asyncify_stack[64*1024]`); `emscripten_fiber_t` itself carries an `asyncify_data` per
fiber. So the coroutine half is *already* "one slot per place." **The bug is not missing buffers
— two subsystems blindly write the one global `currData`:** fiber swaps set `currData = fiber+20`
(`pcbnew.js:11549/11565`); `handleSleep` sets `currData = allocateData()` (a fresh malloc,
`:10223`). When a fiber swap happens *inside* a sleep's await (modal `startModal` pumps
`ProcessEvents`, which yields a tool coroutine), the swap overwrites the sleep's buffer pointer →
crash; or a parked context's pointer is lost → hang. **`handlesleep.js` is a one-level patch of
exactly this.**

**The hard rule that makes the fix tractable:** with Asyncify only **one** context may be
*actively* unwinding/rewinding at any instant (the Normal/Unwinding/Rewinding state machine is
per-module-instance), but **N contexts may be PARKED simultaneously**, each frozen in its own
buffer, resumable in any order. Single-threaded cooperative scheduling means one-active-at-a-time
is all we ever need. The cure is **never losing a parked context's buffer pointer.** Fibers do
that by storing the pointer in the fiber struct; the fix is to give the sleep side the same
discipline under one authority.

**Why raw nested `handleSleep` can never work (Emscripten #9153, WONTFIX):** a `start_unwind`
serializes the *entire* live C stack from that point to the top into *one* buffer. You cannot
unwind inner frame `g` while keeping outer frame `f` alive — one live C stack per instance. To
make `f` and `g` independently suspendable they must live on **separate fibers (separate C stacks
+ separate buffers).** This is the architectural reason the modal (a `handleSleep` over the whole
stack) and the tool coroutine inside it (its own fiber) are the colliding pair.

## §2. Prior art — who has built "many suspended stacks" on Asyncify

- **Emscripten Fibers** (PR #9859, by *Akaricchi*, merged by *kripken*, 2020) — the official
  mechanism: one `asyncify_data` per fiber; `Asyncify.currData` is the transient "which fiber is
  moving this microsecond" pointer. Docs: fibers "supersede the legacy coroutine API" and are "a
  building block for asynchronous control flow constructs, such as coroutines."
- **QEMU wasm port** — `CoroutineEmscripten` allocates its own `asyncify_stack` per coroutine and
  delegates switching to `emscripten_fiber_swap`. In production for virtio/block I/O.
- **TinyGo** — goroutines on wasm via Asyncify, one buffer per goroutine, a JS scheduler
  trampoline that rewinds the next ready goroutine.
- **Pyodide / CPython** — used Asyncify for `run_sync` and hit the single-operation reentrancy
  wall (keyboard-interrupt-during-await left the promise pending forever, #2141).

So "store one per place" is the textbook answer, shipped by several serious C/C++ runtimes.

## §3. We are not switching to JSPI

JSPI (the browser-native stack-switching alternative to Asyncify) is **out of scope** — we are
staying on Asyncify. In short, it does not fit this codebase: it cannot replace the *intra-wasm*
`emscripten_fiber_swap` tool coroutines (they cross no JS boundary), it is incompatible with
`emscripten_set_main_loop` (our entire architecture), and combining it with our
pthreads/`PROXY_TO_PTHREAD` build is unsupported. A prior session reached the same conclusion in
`research/threading_2.md`. The fix therefore stays entirely within Asyncify, in the wasm/shim
layer.

## §4. The achievable fix for us — a unified per-context `currData` authority

This generalizes `handlesleep.js`. It fits our fibers + parked-main-loop architecture, is
supported by the current toolchain, and stays entirely in the **wasm/shim layer** (no KiCad
changes).

**Maintain one registry of suspension contexts**, each entry = `{ dataPtr, rewindId, kind:
fiber|sleep, status }`. Make that registry the *single authority* that owns `Asyncify.currData`:
at every unwind/rewind transition, set `currData` from the context being resumed — never let a
raw `fiber_swap` or `handleSleep` write it blindly.

**Two hook points (already identified in our tree):**
- **Fiber-swap path:** `_emscripten_fiber_swap` (`pcbnew.js:11557`, source `libcontext.cpp:321`).
  Each coroutine already owns its buffer (`wasm_fcontext::asyncify_stack`), so here the job is to
  *register/track*, not allocate.
- **handleSleep path:** `Asyncify.handleSleep`/`allocateData` (`pcbnew.js:10121-10241`). The 6
  EM_ASYNC_JS sleep sites that funnel through it: `dialog.cpp:201` (`startModal`),
  `clipbrd.cpp:38/76/118/145`, `fontenum.cpp:33`.

**Failure modes the authority must respect (from QEMU/TinyGo/Pyodide experience):**
1. **Wrong buffer/entry on rewind** → always `doRewind` via the buffer's interned `rewind_id`,
   never a hardcoded export.
2. **Use-after-free** → never free a context's buffer while it is still parked; only on
   completion/cancel. (Today `handleSleep` `_free`s at `pcbnew.js:10233`; a unified owner must not
   free a buffer another context still references.)
3. **Buffer too small** → traps with `unreachable`; sizes are 64 KB (fiber) / `StackSize` (sleep)
   — keep generous.
4. **Out-of-order resolution + shared globals** → buffers are independent, but the C heap/wasm
   globals are shared; resuming in a different order than parked can violate invariants (ordinary
   coroutine reentrancy hazard, not asyncify-specific).
5. **`wakeUp` re-entering wasm mid-rewind** → fire resumptions from a clean JS stack
   (`setTimeout(wakeUp,0)`) so a Promise `.then` can't start a rewind while another is in flight.

How this composes with de-parking and the clipboard fix is in
[`04-decisions-tests-open-questions.md`](04-decisions-tests-open-questions.md).

---

## Sources

**Asyncify internals / fibers / prior art**
- Kripken: Pause and Resume WebAssembly with Binaryen's Asyncify — https://kripken.github.io/blog/wasm/2019/07/16/asyncify.html
- Binaryen Asyncify.cpp — https://github.com/WebAssembly/binaryen/blob/main/src/passes/Asyncify.cpp
- Emscripten fiber.h — https://github.com/emscripten-core/emscripten/blob/main/system/include/emscripten/fiber.h , docs https://emscripten.org/docs/api_reference/fiber.h.html
- Emscripten PR #9859 (Fibers API) — https://github.com/emscripten-core/emscripten/pull/9859
- Issue #9153 (nested asyncify, WONTFIX) — https://github.com/emscripten-core/emscripten/issues/9153
- Issue #16291 / #18412 ("cannot have multiple async operations in flight") — https://github.com/emscripten-core/emscripten/issues/16291
- QEMU wasm coroutine backend — https://www.mail-archive.com/qemu-devel@nongnu.org/msg1113010.html
- TinyGo goroutines — https://aykevl.nl/2019/02/tinygo-goroutines
- Pyodide issue #2141 (run_sync reentrancy wall) — https://github.com/pyodide/pyodide/issues/2141
- Emscripten async docs — https://emscripten.org/docs/porting/asyncify.html

**In-repo**
- `research/threading_2.md` — prior async/threading research.
