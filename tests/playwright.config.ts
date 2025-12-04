import { defineConfig, devices } from '@playwright/test';

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
    baseURL: 'http://localhost:8080',
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
    command: 'npx serve wasm-app -p 8080',
    port: 8080,
    reuseExistingServer: !process.env.CI,
  },
});
