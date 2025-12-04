// Bitmap Masking Tests - wxMask and transparent bitmap drawing
import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('Bitmap Masking Tests', () => {

  test('Bitmap masking renders correctly', async ({ page, testLogger }) => {
    await page.goto('/standalone/bitmask/bitmask_test.html');
    const loaded = await tryLoadApp(page);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/bitmask.png', fullPage: true });

    expect(loaded, 'Bitmap masking app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

});
