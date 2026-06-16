import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const PORT_FILE = path.join(__dirname, '.test-port');

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
  const isMainRunner = process.argv.slice(2).includes('test');
  if (!isMainRunner) {
    try {
      const existing = parseInt(fs.readFileSync(PORT_FILE, 'utf-8').trim(), 10);
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
      'python3 -c "import socket; s=socket.socket(); s.bind((\'\',0)); print(s.getsockname()[1]); s.close()"',
      { encoding: 'utf-8' }
    );
    return parseInt(result.trim());
  } catch {
    return 9000 + Math.floor(Math.random() * 1000);
  }
}

const port = resolvePort();

// pcbnew's wasm (~190M debug build) exceeds SpiderMonkey's per-process code
// budget on x86-64 CI even with the baseline-only JIT (run 27343416511:
// "InternalError: out of memory" at instantiation; the same module compiles
// on arm64, whose denser code fits). V8 handles it, so on CI these specs run
// on bundled Chromium (the 'chromium-ci' project) and firefox skips them.
const PCBNEW_FAMILY_SPECS = [
  '**/pcbnew.spec.ts',
  '**/pcbnew-collab.spec.ts',
  '**/load-pcb.spec.ts',
  '**/load-pcb-probe.spec.ts',
  // Specs added 2026-06-11..06-13 that boot pcbnew (pcbnew.html /
  // pcbnew-collab.html). Without routing here they ran on Firefox in CI and
  // timed out at instantiation (the SpiderMonkey/x86 code-budget OOM above).
  // The last three are parametrized across pl_editor/eeschema/pcbnew; routing
  // the whole file moves those variants to chromium-ci too (they boot fine on
  // V8) — only the browser exercising them changes, not whether they run.
  '**/appearance.spec.ts',
  '**/contextmenu-scrollbar-pcbnew.spec.ts',
  '**/dark-mode.spec.ts',
  '**/items-bridge.spec.ts',
  '**/roundtrip.spec.ts',
  '**/save-hook.spec.ts',
];

const appsDir = 'apps';

export default defineConfig({
  globalSetup: './global-setup.ts',
  testDir: './kicad',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // 1 local retry absorbs the known under-parallel-load flakes (same rationale
  // as playwright.config.ts): the load-pcb post-load clipboard crash that can
  // close the page on Firefox, and the calculator first-run-wizard timing race.
  retries: process.env.CI ? 2 : 1,
  // Run parallel workers on CI too (Playwright default ≈ 50% of cores), same as
  // local — the serial CI run was the dominant wall-clock cost. Cap (e.g. '50%'
  // or a fixed count) if contention OOMs/flakes; retries:2 covers transient.
  workers: undefined,
  reporter: 'html',
  timeout: 180000,  // KiCad WASM needs more time to load (3 minutes)

  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      // Firefox is the default for headless testing (works on ARM Mac)
      name: 'firefox',
      // On CI the pcbnew-family specs run on chromium-ci instead (see
      // PCBNEW_FAMILY_SPECS above for why).
      ...(process.env.CI ? { testIgnore: PCBNEW_FAMILY_SPECS } : {}),
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
        // CI-only prefs: GPU-less CI VMs hit two Firefox blockers (identical on
        // Hetzner ccx53 and ubicloud-standard-30, runs 27329612719/27330989479).
        // Gated on CI so local runs keep stock Firefox behavior.
        ...(process.env.CI ? {
          // Headless Firefox cannot create any GL context on the GPU-less CI
          // VMs (blocklist bypass still ends in FEATURE_FAILURE_WEBGL_EXHAUSTED_
          // DRIVERS) — run headed under Xvfb instead, where GLX + Mesa llvmpipe
          // provides software WebGL. CI invokes the suite via `xvfb-run`.
          headless: false,
          launchOptions: {
            firefoxUserPrefs: {
              // Skip the no-GPU blocklist ("AllowWebgl2:false restricts
              // context creation") so the GAL canvas gets a WebGL context.
              'webgl.force-enabled': true,
              // pcbnew.wasm (~190M) OOMs the optimizing wasm JIT at compile
              // time ("InternalError: out of memory") and the app never boots.
              // Baseline-only compilation trades runtime speed for a compile
              // that fits in memory.
              'javascript.options.wasm_optimizingjit': false,
            },
          },
        } : {}),
      },
    },
    {
      // Uses the SYSTEM-installed Google Chrome (not the Playwright-bundled
      // Chromium) so WebGL runs on the real GPU instead of SwiftShader.
      // The bundled Chromium fails with canvas hidden on ARM Mac because of
      // Chromium issues #1416283, #338414704 (SwiftShader WebGL bug).
      // Run via: npm run test:kicad:headed
      name: 'chromium',
      use: {
        channel: 'chrome',
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      // CI-only carrier for the pcbnew-family specs (see PCBNEW_FAMILY_SPECS):
      // Playwright-bundled Chromium, headless, software WebGL via SwiftShader
      // (fine on x86 Linux; the SwiftShader bug above is ARM-Mac-specific).
      // --enable-unsafe-swiftshader: newer Chromium refuses software WebGL in
      // headless without it.
      name: 'chromium-ci',
      testMatch: PCBNEW_FAMILY_SPECS,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          args: ['--enable-unsafe-swiftshader'],
        },
      },
    },
  ],

  webServer: {
    command: `npx serve ${appsDir} -p ${port} -c ../serve.json`,
    port: port,
    reuseExistingServer: !process.env.CI,
  },
});
