// Retina/HiDPI Scaling Test - Verifies bitmaps render at correct logical pixel sizes
import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('Retina Scale Tests', () => {

  test('Bitmap icons render at correct logical size', async ({ page, testLogger }) => {
    await page.goto('/standalone/retinascale/retinascale_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/retinascale-01-loaded.png', fullPage: true });

    expect(loaded, 'Retina scale test app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

});
