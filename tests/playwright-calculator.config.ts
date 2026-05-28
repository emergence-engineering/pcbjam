import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Mirrors playwright-kicad.config.ts. The only structural difference is
// testMatch — calculator.spec.ts lives next to pcbnew.spec.ts under ./kicad,
// and we filter to it so running `npm run test:calculator` doesn't drag in
// the pcbnew suite.

const PORT_FILE = path.join(__dirname, '.test-port');

// NOTE: Chrome headless crashes on ARM Mac due to SwiftShader WebGL bug
// (Chromium issues #1416283, #338414704). Firefox headless works reliably.
// Use --project=firefox for headless, --project=chromium for headed debugging.

function getOrFindPort(): number {
  try {
    const stat = fs.statSync(PORT_FILE);
    const age = Date.now() - stat.mtimeMs;
    if (age < 60000) {
      const port = parseInt(fs.readFileSync(PORT_FILE, 'utf-8').trim());
      if (port > 0 && port < 65536) {
        return port;
      }
    }
  } catch {
    // File doesn't exist or can't be read
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

const port = getOrFindPort();

export default defineConfig({
  globalSetup: './global-setup.ts',
  testDir: './kicad',
  testMatch: 'calculator.spec.ts',
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
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      // Uses system Chrome (not bundled Chromium) so WebGL runs on the real GPU.
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
