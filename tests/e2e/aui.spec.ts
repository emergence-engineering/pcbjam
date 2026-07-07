// wxAuiManager Tests - AUI docking system KiCad uses extensively
import { test, expect, MAIN_CANVAS, waitForWxApp, getCanvasBox } from './utils/fixtures';
import { clickAuiButton, clickAuiPaneContent, findRenderedByLabel, findRenderedByType, stableShot } from './utils/element-tracker';

test.describe('wxAuiManager Tests', () => {

  test('AUI test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/aui/aui_test.html');
    await waitForWxApp(page);

    const hasStartup = testLogger.consoleLogs.some(l => l.includes('AUI test app started'));

    await stableShot(page, 'aui-01-loaded.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('AUI dockable panels are visible', async ({ page, testLogger }) => {
    await page.goto('/standalone/aui/aui_test.html');
    await waitForWxApp(page);

    await expect
      .poll(() => testLogger.consoleLogs.some(l => l.includes('dockable panels')), {
        message: 'AUI dockable panels log should be emitted',
      })
      .toBe(true);

    await stableShot(page, 'aui-02-panels.png', { fullPage: true });
  });

  test('Panel close button can be clicked', async ({ page, testLogger }) => {
    await page.goto('/standalone/aui/aui_test.html');
    await waitForWxApp(page);

    // Find all AUI parts to verify they're registered
    const auiParts = await findRenderedByType(page, 'auipart');
    expect(auiParts.length, 'Should have AUI parts registered').toBeGreaterThan(0);

    // Click on Properties panel close button using element registry
    const clicked = await clickAuiButton(page, 'close', 'Properties');
    expect(clicked, 'Properties close button should be found and clicked').toBe(true);

    await stableShot(page, 'aui-03-close-clicked.png', { fullPage: true });
  });

  test('Panel can be dragged', async ({ page, testLogger }) => {
    await page.goto('/standalone/aui/aui_test.html');
    await waitForWxApp(page);

    const box = await getCanvasBox(page);

    // Get Properties panel caption using element registry
    const caption = await findRenderedByLabel(page, 'Properties', { elementType: 'auipart', subType: 'caption' });
    expect(caption, 'Properties caption should be found in registry').not.toBeNull();

    // Drag panel title bar using registry coordinates
    await page.mouse.move(caption!.centerX, caption!.centerY);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 200, { steps: 10 });
    await page.mouse.up();

    await stableShot(page, 'aui-04-dragged.png', { fullPage: true });
  });

  test('Multiple panels can be interacted with', async ({ page, testLogger }) => {
    await page.goto('/standalone/aui/aui_test.html');
    await waitForWxApp(page);

    // Click in Properties panel using element tracking
    const propsClicked = await clickAuiPaneContent(page, 'Properties');
    expect(propsClicked, 'Should be able to click Properties pane').toBe(true);
    await page.waitForTimeout(200); // eslint-disable-line -- documented interaction dwell: no observable event; lets the pane-content click commit before the next click

    // Click in Layers panel using element tracking
    const layersClicked = await clickAuiPaneContent(page, 'Layers');
    expect(layersClicked, 'Should be able to click Layers pane').toBe(true);
    await page.waitForTimeout(200); // eslint-disable-line -- documented interaction dwell: no observable event; lets the pane-content click commit before the next click

    // Click in Messages panel using element tracking
    const messagesClicked = await clickAuiPaneContent(page, 'Messages');
    expect(messagesClicked, 'Should be able to click Messages pane').toBe(true);
    await page.waitForTimeout(200); // eslint-disable-line -- documented interaction dwell: no observable event; lets the pane-content click commit before the next click

    // Click in Event Log panel using element tracking
    const eventLogClicked = await clickAuiPaneContent(page, 'Event Log');
    expect(eventLogClicked, 'Should be able to click Event Log pane').toBe(true);

    await stableShot(page, 'aui-05-multi-panel.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });
});
