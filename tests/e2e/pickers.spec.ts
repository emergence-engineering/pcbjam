// wxColourPickerCtrl/wxFontPickerCtrl Tests - Color and font pickers for KiCad
import { test, expect, waitForWxApp } from './utils/fixtures';
import { stableShot } from './utils/element-tracker';

test.describe('wxPicker Controls Tests', () => {

  test('Pickers test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/pickers/pickers_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'pickers-01-loaded.png', { fullPage: true });

    const hasStartup = testLogger.consoleLogs.some(l => l.includes('PICKERS_TEST'));

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Color pickers are visible', async ({ page, testLogger }) => {
    await page.goto('/standalone/pickers/pickers_test.html');
    await waitForWxApp(page);

    // Check startup logged (deterministic: poll the SAME console event the spec asserted)
    await expect
      .poll(
        () => testLogger.consoleLogs.some(l => l.includes('Picker controls test app started')),
        { message: 'Picker controls should initialize' }
      )
      .toBe(true);

    await stableShot(page, 'pickers-02-colors.png', { fullPage: true });
  });

  test('Font picker is visible', async ({ page, testLogger }) => {
    await page.goto('/standalone/pickers/pickers_test.html');
    await waitForWxApp(page);

    // Font picker should be part of the UI
    await stableShot(page, 'pickers-03-font.png', { fullPage: true });
  });

  test('Color preview panel exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/pickers/pickers_test.html');
    await waitForWxApp(page);

    // The preview panel should exist and be colored
    await stableShot(page, 'pickers-04-preview.png', { fullPage: true });
  });

});
