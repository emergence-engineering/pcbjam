# occ-export flake: SwiftShader congestion → GAL recovery cascade (fixed by GL-stack swap)

Status 2026-07-16: fully root-caused with page-level canvas/context telemetry +
temp C++ instrumentation in a local docker rig. **Final remedy: CI Chromium
now runs WebGL on ANGLE → Mesa llvmpipe instead of SwiftShader**
(`tests/playwright.config.ts`, `CHROMIUM_CI_ARGS`) — the same software-GL
stack the Firefox projects use, where none of this ever happened. Four small
product fixes found along the way were kept (below); everything else was
deliberately **not** hardened — the trigger cannot occur outside congested
SwiftShader.

## Symptom

`chromium/occ-export-{dialog,done}.png` bistable on CI only: the board behind
the modal STEP-export dialog flips between runs (~1.2% changedRatio both
directions). Firefox (llvmpipe) never affected.

## The causal chain (every step observed in the rig)

1. **Transient SwiftShader failure at the first post-board-load draw**
   (~10-15% of instances at `REPEAT=40-80 WORKERS=4`): `DoRePaint threw:
   Requested render buffer size is not supported`, plus LRU context evictions
   the moment a 3rd context appears (21/80 runs; the usual victim is a leaked
   hidden 881×159 startup GAL canvas, so the `CONTEXT_LOST_WEBGL` line alone
   was harmless). No flag stops it — `--max-active-webgl-contexts=64`,
   `--force-gpu-mem-available-mb=4096`, `--disable-low-end-device-mode`,
   `--disable-gpu-driver-bug-workarounds` all verified present and useless.

2. **`recoverFromGalError` attempt 1** (`common/draw_panel_gal.cpp:205`)
   destroys + recreates the WebGL GAL (board canvas `glcanvas-2` →
   `glcanvas-3`).

3. **Attempt 1 then always failed** on stale cross-context GL state:
   - static `g_fontTexture` bound on the new context → `INVALID_OPERATION:
     bindTexture: object does not belong to this context` → `checkGlError`
     throw (**fixed — kept**: per-instance `m_fontTexture`,
     `common/gal/webgl/webgl_gal.{cpp,h}`);
   - sticky GL error flags left by the old GAL's teardown (its `LockCtx`
     targets a lost context, so the deletes land on the current one) →
     the fresh GAL's first `checkGlError` ("generating vertices buffer:
     invalid enum") misattributed the leftover and threw (**fixed — kept**:
     drain `glGetError()` before first-frame `init()` in
     `WEBGL_GAL::BeginDrawing`). With both fixes, reinit-on-WebGL succeeds
     (validated: 0 Cairo fallbacks / 60 after, vs 100% of recoveries before).

4. **Attempt 2 = silent permanent Cairo fallback** (`GAL_FALLBACK ==
   GAL_TYPE_CAIRO` on emscripten, dialog suppressed). Cairo renders the board
   through the wx software path — shots LOOK painted but are a different
   engine → subtle whole-board diffs vs the WebGL baseline. **This engine
   flip IS the original "~1.2% changedRatio both directions" flake.**
   `FULLSCREEN_QUAD` (singleton VAOs) is the same static-GL-state disease and
   produced `bindVertexArray: object does not belong` + one wasm abort in
   rare runs — NOT fixed (unreachable once recovery never triggers; noted
   here in case in-app recovery robustness is ever wanted).

5. **wx paint-flag races turned it into a stuck-blank board** (both
   **fixed — kept**, `wxwidgets/src/wasm/window.cpp`):
   - `Invalidate` early-out skipped the upward walk while the sweep can
     strand a window "flags set, ancestors clear" → every later `Refresh()`
     swallowed. Fix: always propagate to the top.
   - `PaintSelf`/`PaintChildren` cleared the dirty flags AFTER dispatching
     paint, so an `Invalidate` issued reentrantly from inside a paint handler
     (canvas recreated mid-frame, board-load refresh mid-sweep) was clobbered
     with nothing re-issuing it. Fix: `DoPaint` snapshots + clears both flags
     BEFORE dispatching. (Pre-fix rigs showed stuck half-painted toolbars —
     this is a real production-reachable bug, not a CI artifact.)

   One rare mode ("grid-mode": board data loaded, UI painted, canvas alive,
   items never drawn, zoom-to-fit doesn't help; VIEW had all 464 items and
   the same Clear/DisplayBoard ordering as healthy runs) was still being
   diagnosed when the GL-stack swap made it — and everything above —
   unobservable: **80/80 runs clean on llvmpipe**, all dialog shots pixel-
   identical (single 55.65% ratio value across all 80; SwiftShader scattered
   over 55.5–56.8%).

## The fix that ships

`CHROMIUM_CI_ARGS` = `--use-gl=angle --use-angle=gl --ignore-gpu-blocklist`
(CI-gated). Requirements, all already present on CI: an X display
(`xvfb-run -a` wraps the whole e2e step) and Mesa (installed by
`playwright install --with-deps`). `--ignore-gpu-blocklist` is mandatory —
llvmpipe is on Chromium's software-GL blocklist and WebGL silently reports
unavailable without it (the exact analog of the Firefox projects'
`webgl.force-enabled`). Headless works; headed is NOT needed.
Renderer-string ground truth (Chrome falls back silently — always verify):
`gl.getExtension('WEBGL_debug_renderer_info')` must report
`ANGLE (Mesa, llvmpipe …)`, not SwiftShader.

Consequence: chromium renders shift slightly → the chromium baseline set
must be re-promoted once from the first green CI run
(`cd tests && npm run screenshots:promote -- --run <id>`).

## Test-side hardening (kept, independent)

Popup menu items register in the element registry progressively while the
menu paints; a coarse ">3 menuitems" gate + single-shot `clickMenuItem` races
(4–8/20 under contention, pre-existing). Rule (tests/TESTING.md): wait for the
specific item via `waitForRenderedByLabel(page, label, { elementType:
'menuitem' })` before every `clickMenuItem`. Applied to `occ-export`,
`occ-export-models`, `3d-viewer-models`, `load-pcb`; `pl_editor` already did
this; `clickMenuItemByText` waits internally.

## Open leads (not blocking)

- The leaked hidden 881×159 startup GAL canvas: destroying it would free a
  context + memory.
- If in-app GL-error recovery ever matters on real GPUs: fix the
  `FULLSCREEN_QUAD` singleton VAOs (per-instance like the font texture) and
  audit remaining cross-context statics.

## Repro rig (for revalidation)

Docker `mcr.microsoft.com/playwright:v1.57.0-jammy`, worktree bind-mount,
container-local node_modules volume, `CI=1`, `xvfb-run -a npx playwright test
--project=kicad-chromium --repeat-each=N --workers=4` with a temp spec that
loads `pic_programmer`, screenshots board-load / settled / export-dialog /
post-poke, and logs the WebGL renderer string + canvas/context telemetry per
instance. Canaries: `CONTEXT_LOST_WEBGL`, `does not belong to this context`,
board-strip pixel ratio of the shots.
