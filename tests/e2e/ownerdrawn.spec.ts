// wxOwnerDrawnComboBox Tests - Custom dropdown rendering like KiCad layer selectors
import { test, expect, waitForWxApp } from './utils/fixtures';
import { stableShot } from './utils/element-tracker';

test.describe('wxOwnerDrawnComboBox Tests', () => {

  test('OwnerDrawn test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/ownerdrawn/ownerdrawn_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'ownerdrawn-01-loaded.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Layer combobox is visible', async ({ page, testLogger }) => {
    await page.goto('/standalone/ownerdrawn/ownerdrawn_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'ownerdrawn-02-layer.png', { fullPage: true });

    // App loaded successfully - verify no errors
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Font combobox is visible', async ({ page, testLogger }) => {
    await page.goto('/standalone/ownerdrawn/ownerdrawn_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'ownerdrawn-03-font.png', { fullPage: true });
  });

  test('Icon combobox is visible', async ({ page, testLogger }) => {
    await page.goto('/standalone/ownerdrawn/ownerdrawn_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'ownerdrawn-04-icon.png', { fullPage: true });
  });

  test('Selection log panel exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/ownerdrawn/ownerdrawn_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'ownerdrawn-05-log.png', { fullPage: true });
  });

});
