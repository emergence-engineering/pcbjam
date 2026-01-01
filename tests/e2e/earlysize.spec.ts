// Early Size Test - Verifies GetClientSize() returns reasonable values before Show()
// This reproduces KiCad's pattern where GetClientSize() is called in the constructor.
import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('Early GetClientSize() Tests', () => {

  test('Early size test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/earlysize/earlysize_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/earlysize-01-loaded.png', fullPage: true });

    const hasStartup = testLogger.consoleLogs.some(l => l.includes('[EARLYSIZE_TEST] Early size test app started'));

    expect(loaded, 'Early size app should load').toBe(true);
    expect(hasStartup, 'Startup log should be present').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('GetClientSize() returns reasonable values before Show()', async ({ page, testLogger }) => {
    await page.goto('/standalone/earlysize/earlysize_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    // Wait for the app to finish initialization
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/earlysize-02-result.png', fullPage: true });

    // Check for early client size log
    const clientSizeLogs = testLogger.consoleLogs.filter(l => l.includes('[EARLYSIZE_TEST] Early client size:'));
    expect(clientSizeLogs.length).toBeGreaterThan(0);

    // Parse the early client size
    const clientSizeLog = clientSizeLogs[0];
    const clientMatch = clientSizeLog.match(/Early client size: (\d+)x(\d+)/);
    expect(clientMatch, 'Client size log should contain dimensions').not.toBeNull();

    if (clientMatch) {
      const clientWidth = parseInt(clientMatch[1]);
      const clientHeight = parseInt(clientMatch[2]);

      // The key assertion: early client size should NOT be 20x20 or similar tiny values
      // This is the bug we're testing for - KiCad gets 20x20 here
      expect(clientWidth, `Early client width should be > 100 (got ${clientWidth})`).toBeGreaterThan(100);
      expect(clientHeight, `Early client height should be > 100 (got ${clientHeight})`).toBeGreaterThan(100);
    }

    // Check for early frame size log
    const frameSizeLogs = testLogger.consoleLogs.filter(l => l.includes('[EARLYSIZE_TEST] Early frame size:'));
    expect(frameSizeLogs.length).toBeGreaterThan(0);

    // Parse the early frame size
    const frameSizeLog = frameSizeLogs[0];
    const frameMatch = frameSizeLog.match(/Early frame size: (\d+)x(\d+)/);
    expect(frameMatch, 'Frame size log should contain dimensions').not.toBeNull();

    if (frameMatch) {
      const frameWidth = parseInt(frameMatch[1]);
      const frameHeight = parseInt(frameMatch[2]);

      // Frame size should also be reasonable
      expect(frameWidth, `Early frame width should be > 100 (got ${frameWidth})`).toBeGreaterThan(100);
      expect(frameHeight, `Early frame height should be > 100 (got ${frameHeight})`).toBeGreaterThan(100);
    }

    // Check for PASS/FAIL result
    const passLog = testLogger.consoleLogs.some(l => l.includes('[EARLYSIZE_TEST] PASS'));
    const failLog = testLogger.consoleLogs.some(l => l.includes('[EARLYSIZE_TEST] FAIL'));

    expect(failLog, 'Should not have FAIL log').toBe(false);
    expect(passLog, 'Should have PASS log').toBe(true);
  });
});
