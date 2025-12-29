// wxAuiManager Tests - AUI docking system KiCad uses extensively
import { test, expect, MAIN_CANVAS, tryLoadApp, getCanvasBox } from './utils/fixtures';
import { clickAuiButton, findRenderedByLabel, findRenderedByType } from './utils/element-tracker';

test.describe('wxAuiManager Tests', () => {

  test('AUI test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/aui/aui_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/aui-01-loaded.png', fullPage: true });

    const hasStartup = testLogger.consoleLogs.some(l => l.includes('AUI test app started'));

    expect(loaded, 'AUI app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('AUI dockable panels are visible', async ({ page, testLogger }) => {
    await page.goto('/standalone/aui/aui_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.screenshot({ path: 'test-results/aui-02-panels.png', fullPage: true });

    const hasPanelsLog = testLogger.consoleLogs.some(l => l.includes('dockable panels'));

    expect(hasPanelsLog).toBe(true);
  });

  test('Panel close button can be clicked', async ({ page, testLogger }) => {
    await page.goto('/standalone/aui/aui_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    // Find all AUI parts to verify they're registered
    const auiParts = await findRenderedByType(page, 'auipart');
    expect(auiParts.length, 'Should have AUI parts registered').toBeGreaterThan(0);

    // Click on Properties panel close button using element registry
    const clicked = await clickAuiButton(page, 'close', 'Properties');
    expect(clicked, 'Properties close button should be found and clicked').toBe(true);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/aui-03-close-clicked.png', fullPage: true });
  });

  test('Panel can be dragged', async ({ page, testLogger }) => {
    await page.goto('/standalone/aui/aui_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    const box = await getCanvasBox(page);

    // Get Properties panel caption using element registry
    const caption = await findRenderedByLabel(page, 'Properties', { elementType: 'auipart', subType: 'caption' });
    expect(caption, 'Properties caption should be found in registry').not.toBeNull();

    // Drag panel title bar using registry coordinates
    await page.mouse.move(caption!.centerX, caption!.centerY);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 200, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/aui-04-dragged.png', fullPage: true });
  });

  test('Multiple panels can be interacted with', async ({ page, testLogger }) => {
    await page.goto('/standalone/aui/aui_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    const box = await getCanvasBox(page);

    // Click in Properties panel
    await page.mouse.click(box.x + 75, box.y + 200);
    await page.waitForTimeout(200);

    // Click in Layers panel (right side)
    await page.mouse.click(box.x + 720, box.y + 200);
    await page.waitForTimeout(200);

    // Click in Messages panel (bottom)
    await page.mouse.click(box.x + 400, box.y + 550);
    await page.waitForTimeout(200);

    // Click in center (Event Log)
    await page.mouse.click(box.x + 400, box.y + 300);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/aui-05-multi-panel.png', fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });
});
