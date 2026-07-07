// wxInfoBar Tests - Notification bar for KiCad messages
import { test, expect } from './utils/fixtures';
import { clickByLabel, waitForWxApp, stableShot } from './utils/element-tracker';

test.describe('wxInfoBar Tests', () => {

  test('InfoBar test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/infobar/infobar_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'infobar-01-loaded.png', { fullPage: true });

    const hasStartup = testLogger.consoleLogs.some(l => l.includes('INFOBAR_TEST'));

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Show Info Message button works', async ({ page, testLogger }) => {
    await page.goto('/standalone/infobar/infobar_test.html');
    await waitForWxApp(page);

    // Click Show Info Message button using element registry
    const clicked = await clickByLabel(page, 'Show Info Message');
    expect(clicked, 'Show Info Message button should be found and clicked').toBe(true);

    await expect.poll(
      () => testLogger.consoleLogs.some(l =>
        l.includes('Showed info message') || l.includes('INFOBAR_EVENT')),
      { message: 'Info message should show' }
    ).toBe(true);

    await stableShot(page, 'infobar-02-info.png', { fullPage: true });
  });

  test('Show Warning Message button works', async ({ page, testLogger }) => {
    await page.goto('/standalone/infobar/infobar_test.html');
    await waitForWxApp(page);

    // Click Show Warning Message button using element registry
    const clicked = await clickByLabel(page, 'Show Warning Message');
    expect(clicked, 'Show Warning Message button should be found and clicked').toBe(true);

    await expect.poll(
      () => testLogger.consoleLogs.some(l =>
        l.includes('Showed warning message') || l.includes('warning')),
      { message: 'Warning message should show' }
    ).toBe(true);

    await stableShot(page, 'infobar-03-warning.png', { fullPage: true });
  });

  test('Show Error Message button works', async ({ page, testLogger }) => {
    await page.goto('/standalone/infobar/infobar_test.html');
    await waitForWxApp(page);

    // Click Show Error Message button using element registry
    const clicked = await clickByLabel(page, 'Show Error Message');
    expect(clicked, 'Show Error Message button should be found and clicked').toBe(true);

    await expect.poll(
      () => testLogger.consoleLogs.some(l =>
        l.includes('Showed error message') || l.includes('error')),
      { message: 'Error message should show' }
    ).toBe(true);

    await stableShot(page, 'infobar-04-error.png', { fullPage: true });
  });

  test('Dismiss button works', async ({ page, testLogger }) => {
    await page.goto('/standalone/infobar/infobar_test.html');
    await waitForWxApp(page);

    // First show a message using element registry
    const infoClicked = await clickByLabel(page, 'Show Info Message');
    expect(infoClicked, 'Show Info Message button should be found').toBe(true);

    await expect.poll(
      () => testLogger.consoleLogs.some(l =>
        l.includes('Showed info message') || l.includes('INFOBAR_EVENT')),
      { message: 'Info message should show before dismiss' }
    ).toBe(true);

    // Then dismiss using element registry
    const dismissClicked = await clickByLabel(page, 'Dismiss');
    expect(dismissClicked, 'Dismiss button should be found and clicked').toBe(true);

    await expect.poll(
      () => testLogger.consoleLogs.some(l =>
        l.includes('dismissed') || l.includes('Dismiss')),
      { message: 'Dismiss should work' }
    ).toBe(true);

    await stableShot(page, 'infobar-05-dismiss.png', { fullPage: true });
  });

});
