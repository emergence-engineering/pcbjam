import { defineConfig, devices } from "@playwright/test";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const PORT_FILE = path.join(__dirname, ".test-port");

// NOTE: Chrome headless crashes on ARM Mac due to SwiftShader WebGL bug
// (Chromium issues #1416283, #338414704). Firefox headless works reliably.
// Use --project=firefox for headless, --project=chromium for headed debugging.

// Resolve the static-server port for this run.
//
// This config file is re-imported by EVERY Playwright process: the main runner
// (which launches the webServer) and each worker process (which calls
// page.goto(baseURL)). They must all agree on one port. Playwright also
// *recreates* a worker mid-run after a test times out or crashes — and that new
// worker re-imports this config.
//
// The previous heuristic ("reuse .test-port if it's <60s old, else pick a new
// free port") broke exactly there: once a run passed the 60s mark, a recreated
// worker treated the file as stale, picked a DIFFERENT free port, and every
// subsequent page.goto hit a dead port (NS_ERROR_CONNECTION_REFUSED) because the
// webServer was still listening on the original port. A single timing-out test
// (e.g. eeschema-load) thus cascaded into ~all later tests failing.
//
// Fix: drop the time window entirely. The main runner always picks a fresh port
// and writes it; workers always reuse whatever the main runner wrote. The main
// runner is the only process whose argv carries the `test` command (workers are
// forked with an empty argv), and it imports this config — and so writes the
// file — before any worker is spawned.
function resolvePort(): number {
  const isMainRunner = process.argv.slice(2).includes("test");
  if (!isMainRunner) {
    try {
      const existing = parseInt(fs.readFileSync(PORT_FILE, "utf-8").trim(), 10);
      if (existing > 0 && existing < 65536) {
        return existing;
      }
    } catch {
      // No readable port file — fall through. Shouldn't happen in a worker,
      // since the main runner writes the file before spawning workers.
    }
  }

  const port = findFreePort();
  fs.writeFileSync(PORT_FILE, port.toString());
  return port;
}

function findFreePort(): number {
  try {
    const result = execSync(
      "python3 -c \"import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()\"",
      { encoding: "utf-8", timeout: 5000 }
    );
    return parseInt(result.trim());
  } catch {
    return 9000 + Math.floor(Math.random() * 1000);
  }
}

const port = resolvePort();

// The merged kicad_editor wasm (~190M+ debug build; pcbnew+eeschema engines in one
// image since editor-unification Part 2) exceeds SpiderMonkey's per-process code
// budget on x86-64 CI even with the baseline-only JIT (run 27343416511:
// "InternalError: out of memory" at instantiation; the same module compiles
// on arm64, whose denser code fits). V8 handles it, so on CI every spec that
// boots the merged module — i.e. ALL FOUR editors — runs on bundled Chromium
// (the 'chromium-ci' project) and firefox skips them. Firefox keeps the small
// separate bundles (pl_editor / calculator / gerbview).
const BIG_MODULE_SPECS = [
  "**/pcbnew.spec.ts",
  "**/pcbnew-collab.spec.ts",
  "**/load-pcb.spec.ts",
  "**/load-pcb-probe.spec.ts",
  // Specs added 2026-06-11..06-13 that boot pcbnew (pcbnew.html /
  // pcbnew-collab.html). Without routing here they ran on Firefox in CI and
  // timed out at instantiation (the SpiderMonkey/x86 code-budget OOM above).
  // appearance/roundtrip/save-hook are parametrized across pl_editor/eeschema/
  // pcbnew; routing the whole file moves the small-bundle variants to chromium-ci
  // too (they boot fine on V8) — only the browser changes, not whether they run.
  "**/appearance.spec.ts",
  "**/contextmenu-scrollbar-pcbnew.spec.ts",
  "**/dark-mode.spec.ts",
  "**/items-bridge.spec.ts",
  "**/roundtrip.spec.ts",
  "**/save-hook.spec.ts",
  // boots pcbnew.html — must run on V8 (chromium-ci); on Firefox/x86 CI the
  // ~190M module OOMs at instantiation and #canvas never appears (run 27626037849).
  "**/pcbnew-move.spec.ts",
  // 3D viewer specs boot pcbnew.html (3D-enabled build) — same V8 routing.
  "**/3d-viewer.spec.ts",
  // Isolated (own file → own worker) so its heavy single load isn't degraded by the
  // Worker accumulation of the other 3D-viewer tests sharing a process (see the file header).
  "**/3d-viewer-deadlock.spec.ts",
  "**/3d-viewer-models.spec.ts",
  "**/footprint-3d-preview.spec.ts",
  // Parametrized over the library editors — both cases now boot the merged module.
  "**/frame-runtime.spec.ts",
  // eeschema family: since Part 2 these boot the SAME merged kicad_editor module
  // (eeschema.html / symbol_editor.html load kicad_editor.js) — same V8 routing.
  "**/eeschema.spec.ts",
  "**/eeschema-collab.spec.ts",
  "**/eeschema-crosshair.spec.ts",
  "**/eeschema-load.spec.ts",
  "**/eeschema-subschema.spec.ts",
  "**/eeschema-ui.spec.ts",
  "**/eeschema-url-regex.spec.ts",
  "**/symbol_editor.spec.ts",
  // Cross-face probe: schematic session lazily starts the PCB kiface (Preferences).
  "**/xface-probe.spec.ts",
  // OCC split: occ-export boots pcbnew.html (the merged module) and drives the
  // export dialog through the occ_service worker — same V8 routing. occ-probe
  // only boots the (small) occ_service module but shares the harness page.
  "**/occ-export.spec.ts",
  "**/occ-probe.spec.ts",
];

// The heavy 3D-viewer specs each boot the 3D-enabled pcbnew build, which pre-warms
// ~hardwareConcurrency*2+8 Web Workers AND runs a multi-threaded CPU raytracer over
// SwiftShader software-WebGL. Under fullyParallel these separate spec FILES land in
// separate browser processes CONCURRENTLY, and the simultaneous raytrace tabs exhaust
// Workers / wasm heap / the shared GPU process's ~16 live-WebGL-context limit → the tab
// crashes ("Target crashed" / "browser has been closed" / a black frozen canvas). Per-file
// isolation (own worker) prevents in-process Worker accumulation but NOT this cross-process
// concurrency. They STAY in BIG_MODULE_SPECS (so firefox keeps ignoring them — the ~190 MB
// module OOMs SpiderMonkey/x86), but on CI they run in the dedicated 'chromium-ci-3d' project,
// which test:kicad:ci invokes with --workers=1 so at most ONE raytrace tab is alive at a time.
// (footprint-3d-preview.spec.ts is a placeholder glob — no such file exists yet — harmless.)
const THREE_D_HEAVY_SPECS = [
  "**/3d-viewer.spec.ts",
  "**/3d-viewer-deadlock.spec.ts",
  "**/3d-viewer-models.spec.ts",
  "**/footprint-3d-preview.spec.ts",
];

// Runtime-perf specs run ONLY on the Chromium 'perf' project below: they need
// CDP CPU throttling (Chromium-only) and pcbnew needs V8. Excluded from the
// firefox/chromium projects so they don't double-run there.
const PERF_SPECS = ["**/*-perf.spec.ts"];

const appsDir = "apps";

export default defineConfig({
  globalSetup: "./global-setup.ts",
  testDir: "./kicad",
  // See playwright.config.ts: keep CI's outputDir cleanup off test-results/ so the kicad +
  // perf runs don't wipe the accumulated screenshots.
  outputDir: process.env.CI ? "pw-artifacts/kicad" : "test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // 1 local retry absorbs the known under-parallel-load flakes (same rationale
  // as playwright.config.ts): the load-pcb post-load clipboard crash that can
  // close the page on Firefox, and the calculator first-run-wizard timing race.
  retries: process.env.CI ? 2 : 1,
  // Run parallel workers on CI too, same as local — the serial CI run was the dominant
  // wall-clock cost. Capped to a fixed 12 on CI (down from Playwright's default ≈ 50% of
  // cores = ~15 on the 30-core VM) as defense-in-depth for the ~16 live-WebGL-context limit
  // in Chromium's shared GPU process: ~15 GAL-canvas tabs already brush that cap. The heavy
  // 3D-viewer specs (a *second* WebGL context each) no longer run here — they're isolated to
  // the serial 'chromium-ci-3d' project — so 12 is only headroom, not the primary fix.
  workers: process.env.CI ? 12 : undefined,
  reporter: "html",
  timeout: 180000, // KiCad WASM needs more time to load (3 minutes)

  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      // Firefox is the default for headless testing (works on ARM Mac)
      name: "firefox",
      // Perf specs always run on the dedicated 'perf' project, never here. On CI
      // every merged-module (kicad_editor) spec moves to chromium-ci (see
      // BIG_MODULE_SPECS).
      testIgnore: [
        ...PERF_SPECS,
        ...(process.env.CI ? BIG_MODULE_SPECS : []),
      ],
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1280, height: 720 },
        // CI-only prefs: GPU-less CI VMs hit two Firefox blockers (identical on
        // Hetzner ccx53 and ubicloud-standard-30, runs 27329612719/27330989479).
        // Gated on CI so local runs keep stock Firefox behavior.
        ...(process.env.CI
          ? {
              // Headless Firefox cannot create any GL context on the GPU-less CI
              // VMs (blocklist bypass still ends in FEATURE_FAILURE_WEBGL_EXHAUSTED_
              // DRIVERS) — run headed under Xvfb instead, where GLX + Mesa llvmpipe
              // provides software WebGL. CI invokes the suite via `xvfb-run`.
              headless: false,
              launchOptions: {
                firefoxUserPrefs: {
                  // Skip the no-GPU blocklist ("AllowWebgl2:false restricts
                  // context creation") so the GAL canvas gets a WebGL context.
                  "webgl.force-enabled": true,
                  // kicad_editor.wasm (~190M+) OOMs the optimizing wasm JIT at compile
                  // time ("InternalError: out of memory") and the app never boots.
                  // Baseline-only compilation trades runtime speed for a compile
                  // that fits in memory.
                  "javascript.options.wasm_optimizingjit": false,
                },
              },
            }
          : {}),
      },
    },
    {
      // Uses the SYSTEM-installed Google Chrome (not the Playwright-bundled
      // Chromium) so WebGL runs on the real GPU instead of SwiftShader.
      // The bundled Chromium fails with canvas hidden on ARM Mac because of
      // Chromium issues #1416283, #338414704 (SwiftShader WebGL bug).
      // Run via: npm run test:kicad:headed
      name: "chromium",
      testIgnore: PERF_SPECS,
      use: {
        channel: "chrome",
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      // CI-only carrier for the merged-module specs (see BIG_MODULE_SPECS):
      // Playwright-bundled Chromium, headless, software WebGL via SwiftShader
      // (fine on x86 Linux; the SwiftShader bug above is ARM-Mac-specific).
      // --enable-unsafe-swiftshader: newer Chromium refuses software WebGL in
      // headless without it.
      name: "chromium-ci",
      // Every big-module spec EXCEPT the heavy 3D-viewer ones — those move to the
      // serial 'chromium-ci-3d' project below so they never raytrace concurrently.
      testMatch: BIG_MODULE_SPECS.filter((s) => !THREE_D_HEAVY_SPECS.includes(s)),
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          args: ["--enable-unsafe-swiftshader"],
        },
      },
    },
    {
      // CI-only carrier for the heavy 3D-viewer specs (see THREE_D_HEAVY_SPECS). Two reasons
      // it is split out of chromium-ci:
      //  1. HEADED + Mesa llvmpipe GL, not headless SwiftShader. The heavy 3D interactions
      //     (camera move / model scene-build / edge-resize) run the CPU raytracer whose WebGL
      //     blit + the tests' drawImage(glCanvas) pixel reads trigger heavy ReadPixels. Under
      //     HEADLESS SwiftShader on the GPU-less CI VM those stall the GPU thread and Chromium's
      //     GPU watchdog resets the context (CONTEXT_LOST_WEBGL) or crashes the renderer ("Target
      //     crashed") — even with a SINGLE tab (run 28649537489, confirmed via the [DIAG] logs +
      //     trace console). Fix: run HEADED under the CI's Xvfb with Mesa llvmpipe
      //     (--use-gl=angle --use-angle=gl) — the SAME software-WebGL stack the Firefox CI
      //     project already relies on (see the firefox project's headless:false note) — and
      //     disable the GPU watchdog / crash-limit so a slow ReadPixels completes instead of
      //     being killed. --enable-unsafe-swiftshader stays only as a last-ditch fallback.
      //  2. Runs in a SEPARATE `playwright test` pass with --workers=1 (test:kicad:ci), so at
      //     most one raytrace tab is alive at a time.
      // Own outputDir so its start-of-run cleanup doesn't wipe chromium-ci's retained traces,
      // and its own failure traces survive the later `test:perf` run's pw-artifacts/kicad wipe;
      // the CI upload glob tests/pw-artifacts/** already captures it (no workflow change needed).
      name: "chromium-ci-3d",
      testMatch: THREE_D_HEAVY_SPECS,
      outputDir: process.env.CI ? "pw-artifacts/kicad-3d" : "test-results",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
        // The headed + Mesa-llvmpipe stack is a CI-only need (the GPU-less VM). Locally this
        // project should behave like any other bundled-Chromium project, so gate it on CI.
        ...(process.env.CI
          ? {
              headless: false,
              launchOptions: {
                args: [
                  "--use-gl=angle",
                  "--use-angle=gl",
                  "--disable-gpu-watchdog",
                  "--disable-gpu-process-crash-limit",
                  "--enable-unsafe-swiftshader",
                ],
              },
            }
          : { launchOptions: { args: ["--enable-unsafe-swiftshader"] } }),
      },
    },
    {
      // Runtime-perf specs (*-perf.spec.ts): bundled Chromium for CDP CPU throttling.
      // Bundled (not system Chrome) because system Chrome paces rAF oddly under CDP
      // throttle (FPS rose with throttle). --enable-unsafe-swiftshader lets it use
      // software WebGL headless on CI; harmless with a real GPU locally. Add --headed
      // locally for real-GPU FPS numbers.
      name: "perf",
      testMatch: PERF_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
        launchOptions: { args: ["--enable-unsafe-swiftshader"] },
      },
    },
  ],

  webServer: {
    command: `npx serve ${appsDir} -p ${port} -c ../serve.json`,
    port: port,
    reuseExistingServer: !process.env.CI,
  },
});
