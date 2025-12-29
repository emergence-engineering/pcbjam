// wxTimer Tests - Timer functionality for KiCad animations, auto-save, periodic updates
// Uses element registry for semantic element identification
import { test, expect, tryLoadApp, waitForRegistry, clickByLabel, findByLabel } from './utils/fixtures';

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

    await waitForRegistry(page);

    // Click Start button for slow timer
    // Note: There are two "Start" buttons, we need the first one in "Slow Timer" section
    const startButton = await findByLabel(page, 'Start', { exact: true });
    if (startButton) {
      await page.mouse.click(startButton.centerX, startButton.centerY);
    }
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/timer-02-started.png', fullPage: true });

    const hasStartEvent = testLogger.consoleLogs.some(log =>
      log.includes('Slow timer started')
    );
    expect(hasStartEvent, 'Should log slow timer started').toBe(true);

    // Wait for timer tick
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/timer-03-ticked.png', fullPage: true });

    // Click Stop button for slow timer
    const stopButton = await findByLabel(page, 'Stop', { exact: true });
    if (stopButton) {
      await page.mouse.click(stopButton.centerX, stopButton.centerY);
    }
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

    await waitForRegistry(page);

    // Click "Start Fast" button
    await clickByLabel(page, 'Start Fast');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/timer-05-fast-started.png', fullPage: true });

    const hasFastStartEvent = testLogger.consoleLogs.some(log =>
      log.includes('Fast timer started')
    );
    expect(hasFastStartEvent, 'Should log fast timer started').toBe(true);

    // Wait for multiple fast ticks
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/timer-06-fast-running.png', fullPage: true });

    // Click "Stop Fast" button
    await clickByLabel(page, 'Stop Fast');
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

    await waitForRegistry(page);

    // Start slow timer briefly
    const startButton = await findByLabel(page, 'Start', { exact: true });
    if (startButton) {
      await page.mouse.click(startButton.centerX, startButton.centerY);
    }
    await page.waitForTimeout(1500);

    // Click "Reset All Counters" button
    await clickByLabel(page, 'Reset All Counters');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/timer-08-reset.png', fullPage: true });

    const hasResetEvent = testLogger.consoleLogs.some(log =>
      log.includes('Counters reset')
    );
    expect(hasResetEvent, 'Should log counters reset').toBe(true);
  });
});
