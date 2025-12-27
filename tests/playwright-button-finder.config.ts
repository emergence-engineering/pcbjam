import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for button-finder utility ONLY.
 * This config does NOT exclude button-finder.spec.ts like the main config.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 300000,  // 5 minute timeout for scanning

  // Only include the button-finder test
  testMatch: '**/button-finder.spec.ts',

  use: {
    baseURL: 'http://localhost:8080',
    trace: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npx serve apps -p 8080',
    port: 8080,
    reuseExistingServer: true,
  },
});
