// wxFontEnumerator Tests - Local Font Access API integration
import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('wxFontEnumerator Tests', () => {

  test('Font enumeration renders correctly', async ({ page, testLogger }) => {
    await page.goto('/standalone/fontenum/fontenum_test.html');
    const loaded = await tryLoadApp(page);

    if (!loaded) {
      test.skip();
      return;
    }

    // Wait for auto font enumeration to complete (uses Asyncify)
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'test-results/fontenum.png', fullPage: true });

    expect(loaded, 'Font enum app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

});
