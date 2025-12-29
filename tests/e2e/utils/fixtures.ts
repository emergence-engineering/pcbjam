import { test as base } from '@playwright/test';
import * as path from 'path';
import { setupTestLogger, writeTestLogs, TestLogger, MAIN_CANVAS, waitForApp, tryLoadApp, getCanvasBox, WXWIDGETS_LOGS_DIR, getTestFileName } from './test-utils';

// Extend base test with automatic logging
export const test = base.extend<{
  testLogger: TestLogger;
}>({
  testLogger: async ({ page }, use, testInfo) => {
    // Build test name from describe block + test title
    const testName = testInfo.titlePath.join(' - ');

    const logger = setupTestLogger(page);

    await use(logger);

    // Write logs to wxwidgets/<test-file>/ directory
    const testFileName = getTestFileName(testInfo.file);
    const logsDir = path.join(WXWIDGETS_LOGS_DIR, testFileName);
    writeTestLogs(testName, logger, logsDir);
    logger.cleanup();
  },
});

export { expect } from '@playwright/test';
export { MAIN_CANVAS, waitForApp, tryLoadApp, getCanvasBox };

// Element tracking utilities for semantic element identification
export * from './element-tracker';
