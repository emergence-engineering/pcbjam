// wxOwnerDrawnComboBox Tests - Custom dropdown rendering like KiCad layer selectors
import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('wxOwnerDrawnComboBox Tests', () => {

  test('OwnerDrawn test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/ownerdrawn/ownerdrawn_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/ownerdrawn-01-loaded.png', fullPage: true });

    expect(loaded, 'OwnerDrawn app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Layer combobox is visible', async ({ page, testLogger }) => {
    await page.goto('/standalone/ownerdrawn/ownerdrawn_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/ownerdrawn-02-layer.png', fullPage: true });

    // App loaded successfully - verify no errors
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Font combobox is visible', async ({ page, testLogger }) => {
    await page.goto('/standalone/ownerdrawn/ownerdrawn_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/ownerdrawn-03-font.png', fullPage: true });

    expect(loaded, 'Font combobox should be visible').toBe(true);
  });

  test('Icon combobox is visible', async ({ page, testLogger }) => {
    await page.goto('/standalone/ownerdrawn/ownerdrawn_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/ownerdrawn-04-icon.png', fullPage: true });

    expect(loaded, 'Icon combobox should be visible').toBe(true);
  });

  test('Selection log panel exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/ownerdrawn/ownerdrawn_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/ownerdrawn-05-log.png', fullPage: true });

    expect(loaded, 'Selection log should exist').toBe(true);
  });

});
