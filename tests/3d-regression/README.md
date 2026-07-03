# 3D Renderer Regression Suite (OpenGL → WebGL port)

Screenshot-baseline TDD harness for porting KiCad's 3D viewer OpenGL renderer
(`RENDER_3D_OPENGL`, pure GL 1.x fixed-function) to WebGL2 — the same approach
used for the 2D GAL port (`tests/gal-regression/`), but compared with the CI
pixelmatch engine instead of ImageMagick.

Shared C++ **scenarios** call real KiCad 3D-viewer code (draw helpers, display
lists, materials, camera, stencil hole-subtraction, VBO models…) and are
compiled two ways:

- **native/** — macOS app on real desktop OpenGL (2.1 compatibility context via
  the vendored glad loader). Renders each scenario into a fixed 800×600
  offscreen FBO (`GL_RGBA8` + `GL_DEPTH24_STENCIL8`, the
  `EDA_3D_CANVAS::RenderToFrameBuffer` recipe) → **golden baselines**.
- **wasm/** — the same scenario TUs compiled with em++, linked against the
  **`wasm/gl1`** GL1→WebGL2 emulation layer (the port itself — see
  `wasm/gl1/README.md`). Since the port landed, all 47 scenarios render under
  the parity floor with zero per-scenario overrides.

## Directory layout

```
scenarios/        shared scenario sources (native + wasm) — the registry in
                  scene3d_test_scenarios.cpp is the single source of truth
native/           golden generator (CMake; homebrew wxWidgets + OpenGL.framework)
wasm/             WebGL harness (planned)
baseline/         committed native goldens: 3d-<name>.png
baseline-webgl/   committed browser renders (port era, CI-promoted)
output/           run output + diffs (gitignored)
manifest.json     {width,height,scenarios[]} written by the native harness;
                  committed — the anti-drift anchor for specs and orchestrator
floors.json       pixelmatch verdict floors per comparison level
```

## Running

```
./scripts/test-3d-regression.sh            # build + render + gate (native; webgl when present)
./scripts/test-3d-regression.sh native     # native phase only
./scripts/test-3d-regression.sh compare    # comparisons only
./scripts/test-3d-regression.sh promote    # promote output/native -> baseline/ (byte-diff guarded)
```

Logs land in `logs/test-3d-regression/` (build logs in `tests/logs/`).

## Comparison levels

Engine: `tests/tools/screenshots/compare-dirs.ts` (pixelmatch
`{threshold: 0.1, includeAA: false}` — AA edge pixels ignored), floors from
`floors.json`. Diff triptychs/heatmaps + `report.json` land in
`output/diff/<level>/`.

| Level | Pair | Floor (changedRatio) | Role |
|---|---|---|---|
| `native-self` | `baseline/` vs `output/native/` | 0.001 (measured noise: exactly 0 on Apple M5) | gating regression check on the dev Mac |
| `webgl-vs-native` | `baseline/` vs `output/webgl/` | 0.02, **report-only** | the TDD port-progress meter (`npm run 3d:check:parity`) |
| `webgl-self` | `baseline-webgl/` vs `output/webgl/` | 0.005 | browser regression anchor (once the port renders) |

npm scripts (from `tests/`): `3d:check`, `3d:check:webgl`, `3d:check:parity`,
`3d:compare` (generic dir pair), `3d:test:webgl`.

## Updating baselines

Baselines are generated on the dev Mac (CI has no native GL — same model as the
GAL suite). After an intentional render change:

1. `./scripts/test-3d-regression.sh native` (fails with triptychs in
   `output/diff/native-self/` — eyeball them),
2. `./scripts/test-3d-regression.sh promote` (byte-diff-guarded copy, zero
   churn) and commit `baseline/` + `manifest.json`.

The orchestrator `cmp`s the freshly-written manifest against the committed one
every run, so a scenario registry change can't silently drift past the
baselines. Scenario names are append-only — never rename or renumber (they are
the PNG names and the WebGL test IDs).

## Port status (was: TDD red state)

The suite drove the port TDD-style: the harness started against no-op FFP
stubs (~100% changed everywhere), and the `wasm/gl1` emulation layer ground
the parity report down milestone by milestone (substrate → lighting →
display lists/arrays → GLU quadrics). **Current state: 47/47 under the 0.02
parity floor, no floors.json overrides needed.**

Two caveats the parity floor cannot see (verified by eyeballing renders):

- Small-geometry scenarios (the GLU arrows, the spheres gizmo, sparse grids)
  fit under the floor even when absent — a regression there needs the
  triptych/eyeball check, not just the report.
- `glLineWidth > 1` is clamped to 1 by browsers (gizmo axes, native width
  2–4 lines render thinner); the affected coverage is small enough to stay
  under the floor.

## Scenario tiers (47 scenarios)

- **Tier 1 (30)** — standalone TUs: `opengl_utils`
  (arrows/segments/bbox/half-cylinder), `ogl_utils` (background gradient,
  materials, textures), `TRIANGLE_DISPLAY_LIST`/`OPENGL_RENDER_LIST` (display
  lists, seg-ends alpha-test texture, `DrawCulled` stencil subtraction,
  z-transform, transparency), `MODEL_3D` (VBO/IBO, material modes, bboxes),
  `SPHERES_GIZMO`, camera (perspective/ortho/preset views, isolated lights).
- **Tier 2 (14)** — `RENDER_3D_OPENGL` private generators
  (`generateCylinder/Disk/Dimple/InvCone`, all five `addObjectTriangles`
  overloads, `appendPostMachiningGeometry`, via composite, the four grid
  densities, `setupMaterials`/`setLayerMaterial`/`setArrowMaterial`,
  `createBoard`) via the rob-template accessor
  (`native/render3d_test_accessor.*`) over the synthetic `BOARD_ADAPTER`
  (`native/board_adapter_test_impl.cpp` — its `InitSettings` is the test-data
  seam).
- **Tier 3 (3)** — full `reload()` + `Redraw()` composites over the synthetic
  mini-board: `redraw-empty`, `redraw-mini-board` (copper/silk/mask/stencil
  holes), `redraw-mini-board-navigator` (grid + gizmo — the port-complete
  gate).

## Known upstream bug (documented by `3d-post-machining.png`)

`appendPostMachiningGeometry`'s COUNTERSINK path adds middle-contour quads
with `AddQuad` but never calls `AddNormal`, so the normals array ends up half
the vertex count and `OPENGL_RENDER_LIST::generate_middle_triangles` rejects
the whole middle list — a countersunk hole silently erases the walls of any
geometry batched into the same `TRIANGLE_DISPLAY_LIST` (the real viewer has
the same defect). The scenario keeps counterbore and countersink in separate
lists so the counterbore renders correctly while the countersink half records
the buggy (empty) upstream output.

Lighting semantics worth knowing: `init_lights()` runs once at context init
under the identity modelview, so the two directional lights are anchored in
**eye space** (they follow the camera) — the harness replicates that
(`SCENE3D_CTX::InitOnce`), and only the headlight is repositioned per frame
like `Redraw()` does. Also avoid toggling `GL_LIGHTx` between draws inside one
frame: the Apple GL driver drops the first draw after a mid-frame toggle (the
real renderer never does this; the isolated-light scenarios use one light per
frame instead).
