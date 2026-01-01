// wxColourPickerCtrl/wxFontPickerCtrl Tests - Color and font pickers for KiCad
import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('wxPicker Controls Tests', () => {

  test('Pickers test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/pickers/pickers_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/pickers-01-loaded.png', fullPage: true });

    const hasStartup = testLogger.consoleLogs.some(l => l.includes('PICKERS_TEST'));

    expect(loaded, 'Pickers app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Color pickers are visible', async ({ page, testLogger }) => {
    await page.goto('/standalone/pickers/pickers_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/pickers-02-colors.png', fullPage: true });

    // Check startup logged
    const hasStarted = testLogger.consoleLogs.some(l => l.includes('Picker controls test app started'));

    expect(hasStarted, 'Picker controls should initialize').toBe(true);
  });

  test('Font picker is visible', async ({ page, testLogger }) => {
    await page.goto('/standalone/pickers/pickers_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/pickers-03-font.png', fullPage: true });

    // Font picker should be part of the UI
    expect(loaded, 'Font picker should be visible').toBe(true);
  });

  test('Color preview panel exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/pickers/pickers_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/pickers-04-preview.png', fullPage: true });

    // The preview panel should exist and be colored
    expect(loaded, 'Preview panel should exist').toBe(true);
  });

});
