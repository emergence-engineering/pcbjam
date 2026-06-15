// Select Height Test - Regression guard for the wxChoice (<select>) height fix.
// A <select>'s height only resolves after layout, but DoGetBestSize() is queried
// before layout; the DOM used to report ~0 height, collapsing the control. The
// fix floors the height in wxChoice::DoGetBestSize(). The C++ app queries one
// wxChoice's GetBestSize() in its constructor (before Show()) and logs it.
import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('Select Height Tests', () => {

  test('Select height test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/selectheight/selectheight_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/selectheight-01-loaded.png', fullPage: true });

    const hasStartup = testLogger.consoleLogs.some(l => l.includes('[SELECTHEIGHT_TEST] Select height test app started'));

    expect(loaded, 'Select height app should load').toBe(true);
    expect(hasStartup, 'Startup log should be present').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('wxChoice best size has a real height before layout', async ({ page, testLogger }) => {
    await page.goto('/standalone/selectheight/selectheight_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    // Wait for the app to finish initialization
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/selectheight-02-result.png', fullPage: true });

    // Parse the best size logged from the constructor (before Show()/layout)
    const bestSizeLogs = testLogger.consoleLogs.filter(l => l.includes('[SELECTHEIGHT_TEST] Choice best size:'));
    expect(bestSizeLogs.length).toBeGreaterThan(0);

    const bestMatch = bestSizeLogs[0].match(/Choice best size: (\d+)x(\d+)/);
    expect(bestMatch, 'Best size log should contain dimensions').not.toBeNull();

    if (bestMatch) {
      const height = parseInt(bestMatch[2]);

      // The key assertion: the <select> height must NOT collapse to ~0px.
      // Pre-fix this was ~0; the DoGetBestSize() floor makes it a line of text tall.
      expect(height, `Select best-size height should be > 0 (got ${height})`).toBeGreaterThan(0);
      expect(height, `Select best-size height should be a real control height (got ${height})`).toBeGreaterThan(10);
    }

    // The C++ app cross-checks against GetCharHeight()+8 and emits PASS/FAIL.
    const passLog = testLogger.consoleLogs.some(l => l.includes('[SELECTHEIGHT_TEST] PASS'));
    const failLog = testLogger.consoleLogs.some(l => l.includes('[SELECTHEIGHT_TEST] FAIL'));

    expect(failLog, 'Should not have FAIL log').toBe(false);
    expect(passLog, 'Should have PASS log').toBe(true);
  });
});
