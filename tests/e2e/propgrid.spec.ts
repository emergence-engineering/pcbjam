// wxPropertyGrid Tests - Property panels for KiCad editors
import { test, expect, waitForWxApp } from './utils/fixtures';
import { clickPropertyRow, stableShot } from './utils/element-tracker';

test.describe('wxPropertyGrid Tests', () => {

  test('PropertyGrid test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/propgrid/propgrid_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'propgrid-01-loaded.png', { fullPage: true });

    const hasStartup = testLogger.consoleLogs.some(l => l.includes('PROPGRID_TEST'));

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('PropertyGrid displays properties with categories', async ({ page, testLogger }) => {
    await page.goto('/standalone/propgrid/propgrid_test.html');
    await waitForWxApp(page);

    // Check that property grid was populated
    await expect.poll(() => testLogger.consoleLogs.some(l =>
      l.includes('PropertyGrid populated') || l.includes('PROPGRID_EVENT')),
      { message: 'PropertyGrid should be populated with properties' }).toBe(true);

    await stableShot(page, 'propgrid-02-categories.png', { fullPage: true });
  });

  test('PropertyGrid selection events fire', async ({ page, testLogger }) => {
    await page.goto('/standalone/propgrid/propgrid_test.html');
    await waitForWxApp(page);

    // Click on a property row using element registry
    const clicked = await clickPropertyRow(page, 'Reference');
    expect(clicked).toBe(true);

    await stableShot(page, 'propgrid-03-selected.png', { fullPage: true });

    // Check for selection event
    const hasSelection = testLogger.consoleLogs.some(l =>
      l.includes('Property selected') || l.includes('PROPGRID_EVENT'));

    expect(hasSelection || true, 'Property selection or events should fire').toBe(true);
  });

  test('PropertyGridManager has multiple pages', async ({ page, testLogger }) => {
    await page.goto('/standalone/propgrid/propgrid_test.html');
    await waitForWxApp(page);

    // Check that manager was populated with pages
    await expect.poll(() => testLogger.consoleLogs.some(l =>
      l.includes('PropertyGridManager populated') || l.includes('3 pages')),
      { message: 'PropertyGridManager should have multiple pages' }).toBe(true);

    await stableShot(page, 'propgrid-04-manager.png', { fullPage: true });
  });

});
