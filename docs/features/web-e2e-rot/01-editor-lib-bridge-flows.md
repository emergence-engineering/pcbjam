# Web-suite rot: footprint/symbol editor library-bridge flows (5 specs)

Surfaced 2026-07-15 by wiring the web suite into CI for the first time
(branch `experiment/ff-big-modules`, runs 29414003275 / 29415027412). These
specs were green when written and have silently rotted since — the web suite
never ran in CI, so nothing caught it.

## Affected specs (marked `test.fixme` — flip back when fixed)

| spec | first-broken symptom (local, web-chromium) | CI symptom |
|---|---|---|
| `web/footprint-browse-remote.spec.ts` | boots, lib tree lists libs, but expanding `Resistor_SMD` never produces child rows (FootprintEnumerate yields nothing) | `#canvas` never visible in 180 s |
| `web/footprint-write-remote.spec.ts` | boots; New Footprint + Ctrl+S never lands an item in the backend (`/api/scopes/default/libs/<lib>/items` stays empty 30 s) | same boot timeout |
| `web/footprint-write-spike.spec.ts` | boots (route fixed); `window.__pcbjamSaved` never captures a body after New Footprint + save (`?fpwrite=1` spike provider silent) | same boot timeout |
| `web/symbol-write-remote.spec.ts` | same family as footprint-write-remote, symbol domain | same boot timeout |
| `web/symbol-write-spike.spec.ts` | same family as footprint-write-spike (`?libwrite=1`) | same boot timeout |

## Evidence pointing at one root cause

All five live in the same domain: `window.kicadLibs.request(...)` traffic from
the footprint/symbol EDITOR tools (enumerate / save). Probing a booted
`/default/projects/demo/-/footprint_editor` locally:

- the lib tree lists the origin libs (Capacitor_SMD, Diode_SMD, LED_SMD,
  My Symbols, Resistor_SMD) — the *list* path works (pre-sync/IDB);
- `__libsCalls` (a wrapper capturing every `kicadLibs.request`) records ZERO
  calls during boot and ZERO on expanding a lib — the per-lib
  enumerate/get/save traffic never happens;
- one `[pageerror] __name is not defined` fires at boot — esbuild's
  keep-names helper missing in whatever context executes a bundled callback;
  prime suspect for the provider dying silently on first use.

By contrast the SCHEMATIC editor's bridge works (eeschema-fp-selector records
`index` calls), and eeschema/pcbnew tool pages boot and pass their specs — the
rot is specific to the fp/sym editor lib flows, not the bridge as a whole.

Separately fixed while triaging (NOT part of this bug): dead `/p/<slug>/<tool>/`
routes in 3 of these specs (router grammar is `/:scope/projects/:name/-/:tool`
since the scope/kind/name change), the tool-switch overlay race + `/p/` URL
asserts, and read-only-editor's cross-tab SelectFirst-order assumption.

## Why fixme and not expected-fail

The ysync convention (expected-fail repros) is right for fast unit-level
repros. These five die in 180 s boot timeouts on CI — as `test.fail()` they
would burn ~30 min of CI per run across two engines for zero extra signal.
`test.fixme` keeps them visible in every report as skipped-with-reason;
remove the marker (and delete this table row) when the bridge flow is fixed.

## CI-only sibling (kept RUNNING, conditional expected-fail)

`web/eeschema-fp-selector.spec.ts` completes its flow but records a
`[pageerror] index out of bounds` wasm trap on CI (BOTH engines,
llvmpipe/SwiftShader) that does not reproduce on a Mac with real GL — see
`test.fail(!!process.env.CI, …)` in the spec. Likely the same software-GL
render-path family as the presence ghost-wipe (SwiftShader pass-boundary
flush, webgl_gal.cpp). Needs its own investigation on a CI-like rig.
