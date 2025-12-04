// Text Decorations Tests - Underline and Strikethrough rendering
import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('Text Decorations Tests', () => {

  test('Text decorations render correctly', async ({ page, testLogger }) => {
    await page.goto('/standalone/textdecor/textdecor_test.html');
    const loaded = await tryLoadApp(page);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/textdecor.png', fullPage: true });

    expect(loaded, 'Text decorations app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

});
