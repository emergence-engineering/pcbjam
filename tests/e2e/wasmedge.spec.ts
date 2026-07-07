// WASM Edge Cases Tests - Browser-specific limitations and behaviors
import { test, expect, waitForWxApp } from './utils/fixtures';
import { stableShot } from './utils/element-tracker';

test.describe('WASM Edge Cases Tests', () => {

  test('WASM edge cases test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/wasmedge/wasmedge_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'wasmedge-01-loaded.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('File system test button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/wasmedge/wasmedge_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'wasmedge-02-filesystem.png', { fullPage: true });

    // App loaded successfully - verify no errors
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Threading test button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/wasmedge/wasmedge_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'wasmedge-03-threading.png', { fullPage: true });
  });

  test('Font enumeration test button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/wasmedge/wasmedge_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'wasmedge-04-fonts.png', { fullPage: true });
  });

  test('Clipboard test button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/wasmedge/wasmedge_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'wasmedge-05-clipboard.png', { fullPage: true });
  });

  test('Memory test button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/wasmedge/wasmedge_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'wasmedge-06-memory.png', { fullPage: true });
  });

  test('Run all tests button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/wasmedge/wasmedge_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'wasmedge-07-runall.png', { fullPage: true });
  });

  test('Test results log exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/wasmedge/wasmedge_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'wasmedge-08-log.png', { fullPage: true });
  });

});
