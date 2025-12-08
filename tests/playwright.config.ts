import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const PORT_FILE = path.join(__dirname, '.test-port');

// Get existing port from file or find a new one
// This ensures all workers use the same port
function getOrFindPort(): number {
  // Check if port file exists and is recent (created in last 60 seconds)
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

  // Find a new free port
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

const port = getOrFindPort();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 60000,  // WASM can be slow to load

  // Exclude button-finder from regular test runs - it's a utility, not a test
  testIgnore: ['**/button-finder.spec.ts'],

  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
    // Grant clipboard and font permissions for tests
    permissions: ['clipboard-read', 'clipboard-write', 'local-fonts'],
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: `npx serve wasm-app -p ${port}`,
    port: port,
    reuseExistingServer: !process.env.CI,
  },
});
