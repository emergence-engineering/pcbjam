import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Runs the Asyncify race-condition red-green harness (tests/asyncify/) in both
// Firefox and system Chrome. Mirrors playwright-coroutine.config.ts (Chrome must
// be --headed on ARM Mac; Firefox headless OK).

const PORT_FILE = path.join(__dirname, '.test-port-asyncify');

function findFreePort(): number {
  try {
    const result = execSync(
      'python3 -c "import socket; s=socket.socket(); s.bind((\'\',0)); print(s.getsockname()[1]); s.close()"',
      { encoding: 'utf-8' }
    );
    return parseInt(result.trim());
  } catch {
    return 9100 + Math.floor(Math.random() * 800);
  }
}

// Same port-pinning scheme as playwright-kicad.config.ts: the main runner picks a
// fresh port and writes the file before workers spawn; workers always reuse it.
function resolvePort(): number {
  const isMainRunner = process.argv.slice(2).includes('test');
  if (!isMainRunner) {
    try {
      const existing = parseInt(fs.readFileSync(PORT_FILE, 'utf-8').trim(), 10);
      if (existing > 0 && existing < 65536) return existing;
    } catch { /* fall through */ }
  }
  const port = findFreePort();
  fs.writeFileSync(PORT_FILE, port.toString());
  return port;
}

const port = resolvePort();

export default defineConfig({
  globalSetup: './global-setup.ts',
  testDir: './asyncify',
  testMatch: /asyncify-races.*\.spec\.ts$/,
  fullyParallel: false, // one heavy WASM app at a time
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  timeout: 120000,

  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      // Firefox: headless, reliable on ARM Mac.
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 720 } },
    },
    {
      // System Chrome (real V8) — run via: npm run test:asyncify:chrome (must be --headed).
      name: 'chromium',
      use: {
        channel: 'chrome',
        viewport: { width: 1280, height: 720 },
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
  ],

  webServer: {
    command: `npx serve apps -p ${port} -c ../serve.json`,
    port: port,
    reuseExistingServer: !process.env.CI,
  },
});
