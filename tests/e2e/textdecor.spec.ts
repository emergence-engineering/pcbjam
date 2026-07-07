// Text Decorations Tests - Underline and Strikethrough rendering
import { test, expect, waitForWxApp } from './utils/fixtures';
import { stableShot } from './utils/element-tracker';

test.describe('Text Decorations Tests', () => {

  test('Text decorations render correctly', async ({ page, testLogger }) => {
    await page.goto('/standalone/textdecor/textdecor_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'textdecor.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

});
