import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const PORT_FILE = path.join(__dirname, '.test-port');

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
// subsequent page.goto hit a dead port (net::ERR_CONNECTION_REFUSED) because the
// webServer was still listening on the original port. A single failing test
// thus cascaded into ~all later tests failing.
//
// Fix (same as playwright-kicad.config.ts): drop the time window entirely. The
// main runner always picks a fresh port and writes it; workers always reuse
// whatever the main runner wrote. The main runner is the only process whose
// argv carries the `test` command (workers are forked with an empty argv), and
// it imports this config — and so writes the file — before any worker is
// spawned.
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

// Find a free port dynamically using a shell command
function findFreePort(): number {
  // Use Python to find a free port (works on macOS and Linux)
  try {
    const result = execSync(
      'python3 -c "import socket; s=socket.socket(); s.bind((\'\',0)); print(s.getsockname()[1]); s.close()"',
      { encoding: 'utf-8' }
    );
    return parseInt(result.trim());
  } catch {
    // Fallback to default port range
    return 9000 + Math.floor(Math.random() * 1000);
  }
}

const port = resolvePort();

const appsDir = 'apps';

export default defineConfig({
  globalSetup: './global-setup.ts',
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // 1 local retry absorbs transient `npx serve` connection refusals under heavy
  // parallel load (many workers fetching large WASM bundles at once).
  retries: process.env.CI ? 2 : 1,
  // Run parallel workers on CI too (Playwright default ≈ 50% of cores), same as
  // local — the serial CI run was the dominant wall-clock cost. Cap (e.g. '50%'
  // or a fixed count) if contention OOMs/flakes; retries:2 covers transient.
  workers: undefined,
  reporter: 'html',
  timeout: 60000,  // WASM can be slow to load

  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
    // Grant clipboard and font permissions for tests
    permissions: ['clipboard-read', 'clipboard-write', 'local-fonts'],
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // CI runners have no GPU and several wx specs use WebGL
        // (gal-webgl.spec.ts etc.): newer headless Chromium refuses software
        // WebGL without --enable-unsafe-swiftshader. CI-gated so local runs
        // keep stock behavior (same pattern as playwright-kicad.config.ts).
        ...(process.env.CI ? {
          launchOptions: { args: ['--enable-unsafe-swiftshader'] },
        } : {}),
      },
    },
  ],

  webServer: {
    command: `npx serve ${appsDir} -p ${port} -c ../serve.json`,
    port: port,
    reuseExistingServer: !process.env.CI,
  },
});
