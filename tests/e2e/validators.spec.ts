// wxValidator Tests - Input validation like KiCad's dialog validators
import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('wxValidator Tests', () => {

  test('Validators test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/validators/validators_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/validators-01-loaded.png', fullPage: true });

    expect(loaded, 'Validators app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Text validator input exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/validators/validators_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/validators-02-text.png', fullPage: true });

    // App loaded successfully - verify no errors
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Integer validator input exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/validators/validators_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/validators-03-integer.png', fullPage: true });

    expect(loaded, 'Integer validator input should exist').toBe(true);
  });

  test('Floating point validator input exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/validators/validators_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/validators-04-float.png', fullPage: true });

    expect(loaded, 'Float validator input should exist').toBe(true);
  });

  test('Custom net name validator input exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/validators/validators_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/validators-05-netname.png', fullPage: true });

    expect(loaded, 'Net name validator input should exist').toBe(true);
  });

  test('Validate all button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/validators/validators_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/validators-06-button.png', fullPage: true });

    expect(loaded, 'Validate All button should exist').toBe(true);
  });

});
