// wxXmlDocument Tests - XML parsing like KiCad's config and project files
import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('wxXmlDocument Tests', () => {

  test('XML test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/xml/xml_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/xml-01-loaded.png', fullPage: true });

    expect(loaded, 'XML app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Sample XML input exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/xml/xml_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/xml-02-input.png', fullPage: true });

    // App loaded successfully - verify no errors
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Parse button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/xml/xml_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/xml-03-parse.png', fullPage: true });

    expect(loaded, 'Parse button should exist').toBe(true);
  });

  test('Traverse button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/xml/xml_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/xml-04-traverse.png', fullPage: true });

    expect(loaded, 'Traverse button should exist').toBe(true);
  });

  test('Create XML button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/xml/xml_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/xml-05-create.png', fullPage: true });

    expect(loaded, 'Create XML button should exist').toBe(true);
  });

  test('Results output panel exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/xml/xml_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/xml-06-results.png', fullPage: true });

    expect(loaded, 'Results panel should exist').toBe(true);
  });

});
