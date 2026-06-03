import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for the React WEB APP (apps/frontend at :3048 + apps/server :3050),
 * as opposed to playwright-kicad.config.ts which drives the standalone tool
 * harness HTMLs under tests/apps/kicad.
 *
 * These tests exercise the real web open paths: navigate to /p/<project>/<tool>/<file>,
 * let WasmTool boot the tool in-document (boot.ts), drive the project into MEMFS
 * and auto-open the file (open-flow.ts via Module.kicadOpenFile), and assert the
 * editor loaded wizard-free.
 *
 * PREREQUISITE: the web stack must be running. From web/:
 *   pnpm db:up && pnpm db:migrate && pnpm dev
 * (db:migrate seeds the "demo" project; global-setup-web.ts re-seeds it through
 * the API if missing.) The webServer block below reuses an already-running stack
 * and, if absent, best-effort starts `turbo dev` — but that still needs Postgres
 * up (pnpm db:up) and migrated first.
 *
 * Firefox is the reliable headless target on ARM Mac (Chromium SwiftShader WebGL
 * bug); use --project=chromium (system Chrome) for headed debugging.
 */

const FRONTEND_URL = process.env.WEB_APP_URL ?? 'http://localhost:3048';

export default defineConfig({
  globalSetup: './web/global-setup-web.ts',
  testDir: './web',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // KiCad WASM is process-global (one runtime per page) and each tool wasm is
  // 40–200 MB; run serially to avoid loading several giant runtimes at once.
  workers: 1,
  reporter: 'html',
  timeout: 180000, // tool wasm download + boot + open can take minutes

  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'chromium',
      use: { channel: 'chrome', viewport: { width: 1280, height: 720 } },
    },
  ],

  webServer: {
    // Best-effort: reuse the dev stack if it's already up (the common case);
    // otherwise start turbo dev. Postgres (pnpm db:up) + db:migrate must already
    // have run — turbo dev does not provision the database.
    command: 'pnpm --dir ../web dev',
    url: FRONTEND_URL,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
