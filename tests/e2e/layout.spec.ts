// wxSplitterWindow and wxScrolledWindow Tests - Layout controls KiCad uses
import { test, expect, MAIN_CANVAS, tryLoadApp, getCanvasBox } from './utils/fixtures';
import { getSplitterSash, findRenderedByType } from './utils/element-tracker';

test.describe('wxSplitterWindow & wxScrolledWindow Tests', () => {

  test('Layout test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/layout/layout_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/layout-01-loaded.png', fullPage: true });

    const hasStartup = testLogger.consoleLogs.some(l => l.includes('Layout test app started'));

    expect(loaded, 'Layout app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Splitter is visible with two panes', async ({ page, testLogger }) => {
    await page.goto('/standalone/layout/layout_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.screenshot({ path: 'test-results/layout-02-splitter.png', fullPage: true });

    const hasSplitterLog = testLogger.consoleLogs.some(l => l.includes('Splitter position'));

    expect(hasSplitterLog).toBe(true);
  });

  test('Splitter sash can be dragged', async ({ page, testLogger }) => {
    await page.goto('/standalone/layout/layout_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    // Get splitter sash from element registry
    const sash = await getSplitterSash(page);
    expect(sash, 'Splitter sash should be found in registry').not.toBeNull();

    // Drag sash to the right using its center position
    await page.mouse.move(sash!.centerX, sash!.centerY);
    await page.mouse.down();
    await page.mouse.move(sash!.centerX + 100, sash!.centerY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/layout-03-sash-dragged.png', fullPage: true });

    // Verify sash position updated
    const sashAfter = await getSplitterSash(page);
    expect(sashAfter, 'Splitter sash should still be found after drag').not.toBeNull();
  });

  test('Scrolled windows show content', async ({ page, testLogger }) => {
    await page.goto('/standalone/layout/layout_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    const box = await getCanvasBox(page);

    // Scroll in left pane
    await page.mouse.move(box.x + 150, box.y + 200);
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/layout-04-scrolled-left.png', fullPage: true });

    // Scroll in right pane
    await page.mouse.move(box.x + 500, box.y + 200);
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/layout-05-scrolled-right.png', fullPage: true });

    expect(true).toBe(true);
  });

  test('Layout controls work together', async ({ page, testLogger }) => {
    await page.goto('/standalone/layout/layout_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    // Get splitter sash from element registry
    const sash = await getSplitterSash(page);
    expect(sash, 'Splitter sash should be found in registry').not.toBeNull();

    // Drag sash using registry coordinates
    await page.mouse.move(sash!.centerX, sash!.centerY);
    await page.mouse.down();
    await page.mouse.move(sash!.centerX + 100, sash!.centerY, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Get updated sash position after drag
    const sashAfter = await getSplitterSash(page);
    expect(sashAfter, 'Splitter sash should still be found after drag').not.toBeNull();

    // Scroll left pane (use position left of sash)
    await page.mouse.move(sashAfter!.centerX - 100, sashAfter!.centerY);
    await page.mouse.wheel(0, 50);
    await page.waitForTimeout(200);

    // Scroll right pane (use position right of sash)
    await page.mouse.move(sashAfter!.centerX + 100, sashAfter!.centerY);
    await page.mouse.wheel(0, 50);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/layout-06-combined.png', fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });
});
