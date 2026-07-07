// Bitmap Masking Tests - wxMask and transparent bitmap drawing
import { test, expect, waitForWxApp } from './utils/fixtures';
import { stableShot } from './utils/element-tracker';

test.describe('Bitmap Masking Tests', () => {

  test('Bitmap masking renders correctly', async ({ page, testLogger }) => {
    await page.goto('/standalone/bitmask/bitmask_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'bitmask.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

});
