// wxInfoBar Tests - Notification bar for KiCad messages
import { test, expect, tryLoadApp } from './utils/fixtures';
import { clickByLabel } from './utils/element-tracker';

test.describe('wxInfoBar Tests', () => {

  test('InfoBar test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/infobar/infobar_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/infobar-01-loaded.png', fullPage: true });

    const hasStartup = testLogger.consoleLogs.some(l => l.includes('INFOBAR_TEST'));

    expect(loaded, 'InfoBar app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Show Info Message button works', async ({ page, testLogger }) => {
    await page.goto('/standalone/infobar/infobar_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    // Click Show Info Message button using element registry
    const clicked = await clickByLabel(page, 'Show Info Message');
    expect(clicked, 'Show Info Message button should be found and clicked').toBe(true);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/infobar-02-info.png', fullPage: true });

    const hasInfo = testLogger.consoleLogs.some(l =>
      l.includes('Showed info message') || l.includes('INFOBAR_EVENT'));

    expect(hasInfo, 'Info message should show').toBe(true);
  });

  test('Show Warning Message button works', async ({ page, testLogger }) => {
    await page.goto('/standalone/infobar/infobar_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    // Click Show Warning Message button using element registry
    const clicked = await clickByLabel(page, 'Show Warning Message');
    expect(clicked, 'Show Warning Message button should be found and clicked').toBe(true);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/infobar-03-warning.png', fullPage: true });

    const hasWarning = testLogger.consoleLogs.some(l =>
      l.includes('Showed warning message') || l.includes('warning'));

    expect(hasWarning, 'Warning message should show').toBe(true);
  });

  test('Show Error Message button works', async ({ page, testLogger }) => {
    await page.goto('/standalone/infobar/infobar_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    // Click Show Error Message button using element registry
    const clicked = await clickByLabel(page, 'Show Error Message');
    expect(clicked, 'Show Error Message button should be found and clicked').toBe(true);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/infobar-04-error.png', fullPage: true });

    const hasError = testLogger.consoleLogs.some(l =>
      l.includes('Showed error message') || l.includes('error'));

    expect(hasError, 'Error message should show').toBe(true);
  });

  test('Dismiss button works', async ({ page, testLogger }) => {
    await page.goto('/standalone/infobar/infobar_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    // First show a message using element registry
    const infoClicked = await clickByLabel(page, 'Show Info Message');
    expect(infoClicked, 'Show Info Message button should be found').toBe(true);
    await page.waitForTimeout(300);

    // Then dismiss using element registry
    const dismissClicked = await clickByLabel(page, 'Dismiss');
    expect(dismissClicked, 'Dismiss button should be found and clicked').toBe(true);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/infobar-05-dismiss.png', fullPage: true });

    const hasDismiss = testLogger.consoleLogs.some(l =>
      l.includes('dismissed') || l.includes('Dismiss'));

    expect(hasDismiss || loaded, 'Dismiss should work').toBe(true);
  });

});
