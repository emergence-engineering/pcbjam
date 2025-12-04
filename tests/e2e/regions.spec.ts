// Region Clipping Tests - Non-rectangular clipping regions
import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('Region Clipping Tests', () => {

  test('Region clipping renders correctly', async ({ page, testLogger }) => {
    await page.goto('/standalone/regions/regions_test.html');
    const loaded = await tryLoadApp(page);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/regions.png', fullPage: true });

    expect(loaded, 'Region clipping app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

});
