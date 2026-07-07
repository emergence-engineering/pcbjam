// wxGrid Custom Cell Renderers Tests - Color cells, icon+text, striped rows
import { test, expect } from './utils/fixtures';
import { clickTab, clickGridCell, waitForWxApp, stableShot } from './utils/element-tracker';

test.describe('wxGrid Custom Cell Renderers Tests', () => {

  test('Grid renderers test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridrenderers/gridrenderers_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'gridrenderers-01-loaded.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Color cells tab displays color swatches', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridrenderers/gridrenderers_test.html');
    await waitForWxApp(page);

    // Color Cells tab should be visible by default
    await stableShot(page, 'gridrenderers-02-color-cells.png', { fullPage: true });
  });

  test('Icon+Text tab displays icons with text', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridrenderers/gridrenderers_test.html');
    await waitForWxApp(page);

    // Click Icon+Text tab using element registry
    const clicked = await clickTab(page, 'Icon+Text');
    expect(clicked, 'Icon+Text tab should be found').toBe(true);

    await stableShot(page, 'gridrenderers-03-icon-text.png', { fullPage: true });
  });

  test('Striped rows tab displays alternating colors', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridrenderers/gridrenderers_test.html');
    await waitForWxApp(page);

    // Click Striped+Checkboxes tab using element registry
    const clicked = await clickTab(page, 'Striped+Checkboxes');
    expect(clicked, 'Striped+Checkboxes tab should be found').toBe(true);

    await stableShot(page, 'gridrenderers-04-striped.png', { fullPage: true });
  });

  test('Checkbox cells can be toggled in striped grid', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridrenderers/gridrenderers_test.html');
    await waitForWxApp(page);

    // Go to Striped+Checkboxes tab using element registry
    const tabClicked = await clickTab(page, 'Striped+Checkboxes');
    expect(tabClicked, 'Striped+Checkboxes tab should be found').toBe(true);

    // Click on a checkbox cell (DNP column - row 2, col 2 based on typical grid structure)
    const cellClicked = await clickGridCell(page, 2, 2);
    expect(cellClicked, 'Checkbox cell should be found').toBe(true);

    await stableShot(page, 'gridrenderers-05-checkbox-toggle.png', { fullPage: true });
  });
});
