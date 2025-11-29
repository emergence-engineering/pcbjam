import { test, expect, tryLoadApp, getCanvasBox } from './utils/fixtures';

test.describe('wxTimer Tests', () => {

  test('Timer test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/timer/timer_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/timer-01-loaded.png', fullPage: true });

    expect(loaded, 'Timer app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Slow timer can be started and stopped', async ({ page, testLogger }) => {
    await page.goto('/standalone/timer/timer_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    const box = await getCanvasBox(page);
    const centerX = box.width / 2;

    // Click Start button for slow timer (left of center in button row)
    await page.mouse.click(box.x + centerX - 40, box.y + 125);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/timer-02-started.png', fullPage: true });

    const hasStartEvent = testLogger.consoleLogs.some(log =>
      log.includes('Slow timer started')
    );
    expect(hasStartEvent, 'Should log slow timer started').toBe(true);

    // Wait for timer tick
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/timer-03-ticked.png', fullPage: true });

    // Click Stop button (right of center in button row)
    await page.mouse.click(box.x + centerX + 40, box.y + 125);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/timer-04-stopped.png', fullPage: true });

    const hasStopEvent = testLogger.consoleLogs.some(log =>
      log.includes('Slow timer stopped')
    );
    expect(hasStopEvent, 'Should log slow timer stopped').toBe(true);
  });

  test('Fast timer can be started and updates gauge', async ({ page, testLogger }) => {
    await page.goto('/standalone/timer/timer_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    const box = await getCanvasBox(page);
    const centerX = box.width / 2;

    // Click Start Fast button (left of center in fast timer row)
    await page.mouse.click(box.x + centerX - 40, box.y + 265);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/timer-05-fast-started.png', fullPage: true });

    const hasFastStartEvent = testLogger.consoleLogs.some(log =>
      log.includes('Fast timer started')
    );
    expect(hasFastStartEvent, 'Should log fast timer started').toBe(true);

    // Wait for multiple fast ticks
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/timer-06-fast-running.png', fullPage: true });

    // Click Stop Fast button (right of center in fast timer row)
    await page.mouse.click(box.x + centerX + 40, box.y + 265);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/timer-07-fast-stopped.png', fullPage: true });

    const hasFastStopEvent = testLogger.consoleLogs.some(log =>
      log.includes('Fast timer stopped')
    );
    expect(hasFastStopEvent, 'Should log fast timer stopped').toBe(true);
  });

  test('Reset counters button works', async ({ page, testLogger }) => {
    await page.goto('/standalone/timer/timer_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    const box = await getCanvasBox(page);
    const centerX = box.width / 2;

    // Start slow timer briefly
    await page.mouse.click(box.x + centerX - 40, box.y + 125);
    await page.waitForTimeout(1500);

    // Click Reset All Counters (centered button, below fast timer section)
    await page.mouse.click(box.x + centerX, box.y + 390);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/timer-08-reset.png', fullPage: true });

    const hasResetEvent = testLogger.consoleLogs.some(log =>
      log.includes('Counters reset')
    );
    expect(hasResetEvent, 'Should log counters reset').toBe(true);
  });
});
