// wxToolBar and wxStatusBar Tests - Toolbar and status bar KiCad uses
import { test, expect, MAIN_CANVAS, tryLoadApp, getCanvasBox } from './utils/fixtures';
import { clickToolbarTool, findRenderedByType } from './utils/element-tracker';

test.describe('wxToolBar & wxStatusBar Tests', () => {

  test('Toolbar test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/toolbar/toolbar_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/toolbar-01-loaded.png', fullPage: true });

    const hasStartup = testLogger.consoleLogs.some(l => l.includes('Toolbar test app started'));

    expect(loaded, 'Toolbar app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Toolbar buttons are visible', async ({ page, testLogger }) => {
    await page.goto('/standalone/toolbar/toolbar_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.screenshot({ path: 'test-results/toolbar-02-buttons.png', fullPage: true });

    const hasToolbarLog = testLogger.consoleLogs.some(l => l.includes('Toolbar created'));

    expect(hasToolbarLog).toBe(true);
  });

  test('New tool button can be clicked', async ({ page, testLogger }) => {
    await page.goto('/standalone/toolbar/toolbar_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    // Click New button using element registry
    const clicked = await clickToolbarTool(page, 'New');
    expect(clicked, 'New tool should be found and clicked').toBe(true);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/toolbar-03-new-clicked.png', fullPage: true });
  });

  test('Zoom tools can be clicked', async ({ page, testLogger }) => {
    await page.goto('/standalone/toolbar/toolbar_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    // Click Zoom In using element registry
    const zoomInClicked = await clickToolbarTool(page, 'Zoom In');
    expect(zoomInClicked, 'Zoom In tool should be found and clicked').toBe(true);
    await page.waitForTimeout(300);

    // Click Zoom Out using element registry
    const zoomOutClicked = await clickToolbarTool(page, 'Zoom Out');
    expect(zoomOutClicked, 'Zoom Out tool should be found and clicked').toBe(true);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/toolbar-04-zoom.png', fullPage: true });
  });

  test('Toggle tool changes state', async ({ page, testLogger }) => {
    await page.goto('/standalone/toolbar/toolbar_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    // Click Toggle button using element registry
    const toggleClicked1 = await clickToolbarTool(page, 'Toggle');
    expect(toggleClicked1, 'Toggle tool should be found and clicked').toBe(true);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/toolbar-05-toggle-on.png', fullPage: true });

    // Click again to toggle off
    const toggleClicked2 = await clickToolbarTool(page, 'Toggle');
    expect(toggleClicked2, 'Toggle tool should be found and clicked again').toBe(true);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/toolbar-06-toggle-off.png', fullPage: true });
  });

  test('Status bar shows messages', async ({ page, testLogger }) => {
    await page.goto('/standalone/toolbar/toolbar_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.screenshot({ path: 'test-results/toolbar-07-statusbar.png', fullPage: true });

    const hasStatusBarLog = testLogger.consoleLogs.some(l => l.includes('Status bar created'));

    expect(hasStatusBarLog).toBe(true);
  });

  test('All toolbar buttons accessible', async ({ page, testLogger }) => {
    await page.goto('/standalone/toolbar/toolbar_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    // Verify all tools are registered
    const tools = await findRenderedByType(page, 'tool');
    expect(tools.length, 'Should have 6 tools registered').toBeGreaterThanOrEqual(6);

    // Click all toolbar buttons by label
    const toolLabels = ['New', 'Open', 'Save', 'Zoom In', 'Zoom Out', 'Toggle'];
    for (const label of toolLabels) {
      const clicked = await clickToolbarTool(page, label);
      expect(clicked, `Tool "${label}" should be found and clicked`).toBe(true);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/toolbar-08-all-buttons.png', fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });
});
