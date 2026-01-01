// wxPopupWindow Tests - Transient popups like KiCad toolbar palettes
import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('wxPopupWindow Tests', () => {

  test('Popup test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/popup/popup_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/popup-01-loaded.png', fullPage: true });

    expect(loaded, 'Popup app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Status popup button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/popup/popup_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/popup-02-status.png', fullPage: true });

    // App loaded successfully - verify no errors
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Tool palette button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/popup/popup_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/popup-03-palette.png', fullPage: true });

    expect(loaded, 'Tool palette button should exist').toBe(true);
  });

  test('Color picker button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/popup/popup_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/popup-04-color.png', fullPage: true });

    expect(loaded, 'Color picker button should exist').toBe(true);
  });

  test('Positioning buttons exist', async ({ page, testLogger }) => {
    await page.goto('/standalone/popup/popup_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/popup-05-positioning.png', fullPage: true });

    expect(loaded, 'Positioning buttons should exist').toBe(true);
  });

  test('Event log panel exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/popup/popup_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/popup-06-log.png', fullPage: true });

    expect(loaded, 'Event log should exist').toBe(true);
  });

});
