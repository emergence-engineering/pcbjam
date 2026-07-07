// Region Clipping Tests - Non-rectangular clipping regions
import { test, expect, waitForWxApp } from './utils/fixtures';
import { stableShot } from './utils/element-tracker';

test.describe('Region Clipping Tests', () => {

  test('Region clipping renders correctly', async ({ page, testLogger }) => {
    await page.goto('/standalone/regions/regions_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'regions.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

});
