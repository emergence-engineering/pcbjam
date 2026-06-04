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

export default defineConfig({
  globalSetup: './global-setup.ts',
  testDir: './kicad',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
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
  ],

  webServer: {
    command: `npx serve apps -p ${port} -c ../serve.json`,
    port: port,
    reuseExistingServer: !process.env.CI,
  },
});
