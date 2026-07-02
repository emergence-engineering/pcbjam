# 3D viewer raytracer — the camera-move worker deadlock, and the fix

> **Status:** fixed on the `3d-raytracer` branch (2026-07-01). The 3D viewer's CPU raytracer
> froze the tab (deadlock) on any interaction — move the model, drag the viewer frame, resize it.
> Root cause is an on-demand Web Worker boot deadlock; the fix is a build-flag change
> (`PTHREAD_POOL_SIZE`) plus a wxwidgets wasm-layer defer, with **zero KiCad-submodule changes**.
>
> Related reading: [`shared-pool-vs-raw-threads.md`](shared-pool-vs-raw-threads.md) (upstream's two
> threading patterns, the Worker ledger behind `2N+8`, and the upstream-able structural fix),
> [`../threading/README.md`](../threading/README.md) (the three-layer thread model
> + the deadlock mechanics), [`../async/11-asyncify-nesting-raytracer.md`](../async),
> [`../wasm-exceptions/`](../wasm-exceptions) (native-EH pthreads), and
> [`kicad-3d-viewer-route-c`] (the viewer is a CPU raytracer blitted via a WebGL2 quad).
>
> Artifacts referenced (line numbers against the branch at fix time):
> `kicad/3d-viewer/3d_rendering/raytracing/render_3d_raytrace_base.cpp`,
> `kicad/common/thread_pool.cpp`, `scripts/kicad/build-kicad-target.sh`,
> `wxwidgets/src/wasm/app.cpp`, `wxwidgets/src/wasm/toplevel.cpp`,
> `wasm/shims/nanosleep_yield.c`.

## 1. Symptom

Open pcbnew, load a board, open the 3D viewer (View → 3D Viewer / Alt+3). The viewer opens and
renders the board fine. Then **interact with it** — rotate the model (left-drag on the 3D canvas),
drag the viewer frame, or resize it — and the **whole tab freezes** (the wasm main thread is stuck;
no further UI, no console progress). Occasionally it surfaces as `Aborted(invalid state: N)` instead
of a hard freeze.

A previous fix (`wxwidgets` `93d07af586`, "don't synchronously raytrace on 3D-viewer resize") cured
the *resize* case by not running a synchronous repaint of a GL-hosting window. That was one instance
of a broader bug; **camera moves and other interactions still deadlocked.**

## 2. The threading model (why this is fragile)

See [`../threading/README.md`](../threading/README.md) for the full picture. The essentials:

- The WASM build has **no `-sPROXY_TO_PTHREAD`** — `main()`, the wx UI, and the raytracer's
  thread **join all run on the browser main thread**.
- `-sPTHREAD_POOL_SIZE` pre-warms a bag of Web Workers at startup; `-sPTHREAD_POOL_SIZE_STRICT=0`
  means an empty bag falls back to **on-demand `new Worker()`**.
- KiCad's shared `BS::thread_pool` (`common/thread_pool.cpp`, sized to `hardware_concurrency()`)
  creates its long-lived threads at startup and thereby **consumes the entire pre-warmed pool**.
- The raytracer's *preview* and *post-process* passes (`render_3d_raytrace_base.cpp` `renderPreview`,
  `postProcessShading`, `postProcessBlurFinish`) spawn their **own** set of raw `std::thread`s and
  then **busy-wait-join on the main thread** (`while (threadsFinished < N) std::this_thread::sleep_for(10ms)`).
- The `nanosleep_yield.c` shim turns that main-thread `sleep_for`/`nanosleep` into an
  `emscripten_sleep` (an Asyncify unwind) so the event loop *can* be pumped during the join.

## 3. Root cause — the on-demand Worker boot deadlock

Because KiCad's thread pool already drained the pre-warmed pool, when a camera move kicks a raytrace,
the raytracer's raw `std::thread`s have **no ready Workers** and must create them on demand. On-demand
creation is asynchronous: `new Worker()` → the Worker posts a *"loaded"* message → **the main thread's
message handler must run to post `{cmd:'run'}`** before the thread actually starts.

But the main thread is **blocked in the render's busy-wait join** waiting for those very threads to
finish. Circular wait:

```
main thread: busy-wait join  ── waits for ──▶  raytrace worker thread to run
raytrace worker: not booted  ── needs ──▶  main thread back in the event loop to finish new Worker() boot
main thread: won't get there ── because ──▶  it's in the busy-wait join
```

→ **hard freeze** (the join never completes), or — when the nested `emscripten_sleep` can't unwind in
the paint context — `Aborted(invalid state)`.

The `nanosleep_yield` shim is supposed to break this by yielding, and it does in the isolated
`coroutine-pthread-ondemand` harness — but **not** reliably in the real viewer's paint call chain, so
it cannot be relied on here.

## 4. Why the earlier remedies were not enough

- **The resize fix (`wx_window_resize`)** and the analogous **mouse-button `Paint()` defer** (below)
  only change *where* the raytrace runs (synchronous DOM callback → the yielding per-frame pump). But
  the pump raytrace **still deadlocks** if it needs an on-demand boot: a diagnostic that rotates the
  camera then polls liveness with **no further interaction** froze ~2–4 s later. Deferring is
  necessary-adjacent (avoids jank, mirrors the resize fix) but **insufficient alone**.
- The real lever is to make sure the raytracer's threads **never need an on-demand boot**.

## 5. The fix (zero KiCad changes)

Two parts, both outside the `kicad` submodule (KiCad's native multithreading is used as-is):

### 5a. Primary — pre-warm enough Workers (`scripts/kicad/build-kicad-target.sh`)

A 3D-viewer session needs KiCad's pool (`N = hardwareConcurrency`) **plus** the raytracer's own
raw-thread pass (`N`) alive at the same time — i.e. ~`2N` Workers. Pre-warm that many so on-demand
creation never happens:

```sh
# Only 3D-viewer builds pay the extra startup Workers; other apps keep one set.
if [ "${BUILD_3D_VIEWER:-OFF}" = "ON" ]; then
    PTHREAD_POOL_EXPR='navigator.hardwareConcurrency*2+8'
else
    PTHREAD_POOL_EXPR='navigator.hardwareConcurrency'
fi
# ... -sPTHREAD_POOL_SIZE='${PTHREAD_POOL_EXPR}' ...
```

`PTHREAD_POOL_SIZE` is a JS-side pre-warm count baked into the app's `.js` (`var pthreadPoolSize = …`),
so the change is verifiable by inspecting the generated `pcbnew.js` — no wasm change is involved.

### 5b. Defense + jank — defer the GL-window mouse-button repaint (`wxwidgets/src/wasm/`)

`wxApp::HandleMouseEvent` forces a **synchronous `wxTheApp->Paint()` after every mouse button
down/up** (for immediate modal-dialog feedback). On the 3D viewer that repaints the GL canvas and runs
the raytracer *nested in the DOM mouse callback*. `wxApp::Paint(bool deferGLCanvasWindows)` now skips
the synchronous repaint of any **non-main** `wxGLCanvas`-hosting window on that path (the 3D viewer, or
a dialog with a 3D preview), deferring it to the yielding per-frame pump — exactly like the resize fix.
`ProcessPendingEvents()` still runs synchronously, so click/selection *logic* stays immediate; only the
GL pixel repaint waits one pump frame.

- `include/wx/wasm/app.h` — `void Paint(bool deferGLCanvasWindows = false)`.
- `src/wasm/app.cpp` — the guard in `Paint()` (`!IsMainFrame() && wxWasmWindowHostsGLCanvas(win)`),
  and `HandleMouseEvent` calls `Paint(/*deferGLCanvasWindows=*/true)`.
- `src/wasm/toplevel.cpp` — `wxWasmWindowHostsGLCanvas()` made non-static (moved out of the
  `extern "C"` block so it keeps **C++ linkage**) and shared with `app.cpp`.

> This part alone does **not** fix the deadlock (see §4). It is kept because it removes a
> multi-hundred-ms synchronous raytrace from the mouse callback (jank) and is a defense-in-depth match
> to the merged resize fix. It also covers dialog-hosted 3D previews (footprint 3D-models tab).

## 6. The regression test

`tests/kicad/3d-viewer-deadlock.spec.ts` — an **isolated** spec (own file → own Playwright worker →
own browser process). It:

1. Boots pcbnew, loads `pic_programmer`, opens the 3D viewer.
2. Does **two camera-rotate drags** on the GL canvas (mirroring "move the model … move it again"),
   each followed by a **settle** (polls the canvas pixel signature until it stops changing) so
   successive renders don't overlap.
3. After each step asserts **(a) the wasm main thread stays responsive** — a `page.waitForFunction`
   liveness probe that times out when the main thread is frozen — and **(b) nothing aborted**
   (`Aborted(` / `invalid state` / Asyncify-unwind signatures in the console).
4. Validity guard: the render must actually change after a move (proves the synthetic mouse reached
   the canvas), and the board must still render many colours at the end.

Detection detail: the glcanvas client area is `pointer-events:none`, so a `page.mouse` drag over it
**falls through to the main `#canvas`**, whose Emscripten mousedown/up callback dispatches into
`wxApp::HandleMouseEvent` — the deadlock path. WebGL pixels are read via `drawImage → 2D → getImageData`
(needs `preserveDrawingBuffer=true`), since a CDP screenshot of a WebGL canvas is blank on swiftshader.

### Why isolated in its own file

The pre-warmed pool is ~`2N` Workers **per pcbnew load**. Running several heavy 3D-viewer loads in one
browser process (a serial `describe`) accumulates enough Workers that a *later* load's pool is short
and the raytracer deadlocks anyway — so this test flakes as the last of many loads and, because a
serial-group retry re-runs the whole group, retries don't rescue it. A dedicated file → dedicated
worker → a **single** heavy load → reliably first-try green. The four sibling tests
(`tests/kicad/3d-viewer.spec.ts`: open/render, z-index, frame drag/close, edge-resize) stay in their
own file; shared helpers live in `tests/kicad/utils/threed-viewer.ts`. Both specs are routed to
`chromium-ci` via `PCBNEW_FAMILY_SPECS` in `tests/playwright-kicad.config.ts` (pcbnew's ~190 MB wasm
OOMs Firefox's x86 CI engine).

## 7. Reproduce / verify

Build a 3D-viewer-enabled pcbnew (`BUILD_3D_VIEWER=ON` is the default in `docker/build.sh`):

```sh
BINARYEN_OPT_LEVEL=-O1 ./docker/build.sh pcbnew    # first build in a fresh worktree: add --build-deps
```

Run just the deadlock test (from `tests/`, own worker → reliable):

```sh
npm run setup:kicad
npx playwright test --config=playwright-kicad.config.ts --project=firefox kicad/3d-viewer-deadlock.spec.ts
```

- **Pre-fix** (revert §5a): the test freezes/aborts — "camera-rotate drag froze the wasm main thread".
- **Post-fix**: green (both camera moves stay live, board keeps rendering).

Manual test in the real editor: `cd web && pnpm dev` (or `pnpm --filter @pcbjam/standalone dev`) →
open http://localhost:3048 → "open a local folder" → `kicad/demos/pic_programmer/` → open the
`.kicad_pcb` → View → 3D Viewer → rotate / drag / resize. The editor symlinks `/wasm` →
`tests/apps/kicad`, so it serves the locally built (fixed) artifacts.

## 8. Notes / follow-ups

- The `2N+8` pool costs extra startup Workers **only for 3D-viewer builds**; real users open the
  viewer in a single page load, so there is no accumulation for them (the accumulation only bit the
  5-loads-in-one-process test suite, addressed by isolating the test — §6).
- A cleaner long-term fix would make the raytracer's preview/post-process passes reuse KiCad's shared
  thread pool instead of spawning their own raw `std::thread`s (no second thread set → the `1x` pool
  suffices), but that is an upstream-KiCad change and was deliberately avoided here to keep the fork
  close to upstream. **See [`shared-pool-vs-raw-threads.md`](shared-pool-vs-raw-threads.md)** for the
  full story: upstream's two threading patterns (the main `renderTracing` pass *already* uses the
  shared pool — only the preview/post-process/scene-build passes are raw), the `2N+8` Worker ledger,
  why the June-30 threading revert didn't cover this, and the sketch of the upstream port that would
  make the deadlock class impossible by construction.
