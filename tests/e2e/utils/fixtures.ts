import { test as base } from '@playwright/test';
import * as path from 'path';
import { setupTestLogger, writeTestLogs, TestLogger, MAIN_CANVAS, waitForApp, tryLoadApp, getCanvasBox, WXWIDGETS_LOGS_DIR, getTestFileName } from './test-utils';

// WX_PORT=dom runs the same specs against the DOM-port bundles; screenshots
// and logs are namespaced into a dom/ subdirectory so the canvas artifacts
// stay untouched (baselines: tests/baseline-screenshots-dom/).
const IS_DOM_PORT = process.env.WX_PORT === 'dom';

// Extend base test with automatic logging
export const test = base.extend<{
  testLogger: TestLogger;
}>({
  page: async ({ page }, use) => {
    if (IS_DOM_PORT) {
      const origScreenshot = page.screenshot.bind(page);
      page.screenshot = ((options?: Parameters<typeof origScreenshot>[0]) => {
        if (options?.path) {
          const dir = path.dirname(options.path);
          // Specs write to test-results/<name>.png; redirect to test-results/dom/.
          if (path.basename(dir) === 'test-results') {
            options = { ...options, path: path.join(dir, 'dom', path.basename(options.path)) };
          }
        }
        return origScreenshot(options);
      }) as typeof page.screenshot;
    }
    await use(page);
  },
  testLogger: async ({ page }, use, testInfo) => {
    // Build test name from describe block + test title
    const testName = testInfo.titlePath.join(' - ');

    const logger = setupTestLogger(page);

    await use(logger);

    // Write logs to wxwidgets/<test-file>/ directory (wxwidgets/dom/<test-file>/ for the DOM port)
    const testFileName = getTestFileName(testInfo.file);
    const logsDir = IS_DOM_PORT
      ? path.join(WXWIDGETS_LOGS_DIR, 'dom', testFileName)
      : path.join(WXWIDGETS_LOGS_DIR, testFileName);
    writeTestLogs(testName, logger, logsDir);
    logger.cleanup();
  },
});

export { expect } from '@playwright/test';
export { MAIN_CANVAS, waitForApp, tryLoadApp, getCanvasBox };

// Element tracking utilities for semantic element identification
export * from './element-tracker';
