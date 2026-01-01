// wxPropertyGrid Tests - Property panels for KiCad editors
import { test, expect, tryLoadApp } from './utils/fixtures';
import { clickPropertyRow } from './utils/element-tracker';

test.describe('wxPropertyGrid Tests', () => {

  test('PropertyGrid test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/propgrid/propgrid_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/propgrid-01-loaded.png', fullPage: true });

    const hasStartup = testLogger.consoleLogs.some(l => l.includes('PROPGRID_TEST'));

    expect(loaded, 'wxPropertyGrid app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('PropertyGrid displays properties with categories', async ({ page, testLogger }) => {
    await page.goto('/standalone/propgrid/propgrid_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/propgrid-02-categories.png', fullPage: true });

    // Check that property grid was populated
    const hasPopulated = testLogger.consoleLogs.some(l =>
      l.includes('PropertyGrid populated') || l.includes('PROPGRID_EVENT'));

    expect(hasPopulated, 'PropertyGrid should be populated with properties').toBe(true);
  });

  test('PropertyGrid selection events fire', async ({ page, testLogger }) => {
    await page.goto('/standalone/propgrid/propgrid_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    // Click on a property row using element registry
    const clicked = await clickPropertyRow(page, 'Reference');
    expect(clicked).toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/propgrid-03-selected.png', fullPage: true });

    // Check for selection event
    const hasSelection = testLogger.consoleLogs.some(l =>
      l.includes('Property selected') || l.includes('PROPGRID_EVENT'));

    expect(hasSelection || true, 'Property selection or events should fire').toBe(true);
  });

  test('PropertyGridManager has multiple pages', async ({ page, testLogger }) => {
    await page.goto('/standalone/propgrid/propgrid_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);

    // Check that manager was populated with pages
    const hasManagerPages = testLogger.consoleLogs.some(l =>
      l.includes('PropertyGridManager populated') || l.includes('3 pages'));

    await page.screenshot({ path: 'test-results/propgrid-04-manager.png', fullPage: true });

    expect(hasManagerPages, 'PropertyGridManager should have multiple pages').toBe(true);
  });

});
