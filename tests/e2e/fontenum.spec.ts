// wxFontEnumerator Tests - Local Font Access API integration
import { test, expect, waitForWxApp } from './utils/fixtures';
import { stableShot } from './utils/element-tracker';

test.describe('wxFontEnumerator Tests', () => {

  test('Font enumeration renders correctly', async ({ page, testLogger }) => {
    await page.goto('/standalone/fontenum/fontenum_test.html');
    await waitForWxApp(page);

    // Font enumeration auto-runs on startup (CallAfter). It renders a static
    // list/preview once done; stableShot's stabilization replaces the
    // fixed 3s settle and asserts the rendered result deterministically.
    await stableShot(page, 'fontenum.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

});
