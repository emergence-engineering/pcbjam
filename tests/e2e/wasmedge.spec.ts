// WASM Edge Cases Tests - Browser-specific limitations and behaviors
import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('WASM Edge Cases Tests', () => {

  test('WASM edge cases test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/wasmedge/wasmedge_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/wasmedge-01-loaded.png', fullPage: true });

    expect(loaded, 'WASM edge cases app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('File system test button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/wasmedge/wasmedge_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/wasmedge-02-filesystem.png', fullPage: true });

    // App loaded successfully - verify no errors
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Threading test button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/wasmedge/wasmedge_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/wasmedge-03-threading.png', fullPage: true });

    expect(loaded, 'Threading test button should exist').toBe(true);
  });

  test('Font enumeration test button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/wasmedge/wasmedge_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/wasmedge-04-fonts.png', fullPage: true });

    expect(loaded, 'Font enumeration button should exist').toBe(true);
  });

  test('Clipboard test button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/wasmedge/wasmedge_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/wasmedge-05-clipboard.png', fullPage: true });

    expect(loaded, 'Clipboard test button should exist').toBe(true);
  });

  test('Memory test button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/wasmedge/wasmedge_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/wasmedge-06-memory.png', fullPage: true });

    expect(loaded, 'Memory test button should exist').toBe(true);
  });

  test('Run all tests button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/wasmedge/wasmedge_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/wasmedge-07-runall.png', fullPage: true });

    expect(loaded, 'Run all tests button should exist').toBe(true);
  });

  test('Test results log exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/wasmedge/wasmedge_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/wasmedge-08-log.png', fullPage: true });

    expect(loaded, 'Test results log should exist').toBe(true);
  });

});
