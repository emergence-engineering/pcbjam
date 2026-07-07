// wxGrid Cell Editing Tests - Property editing simulation
import { test, expect, waitForWxApp } from './utils/fixtures';
import { clickByLabel, clickGridCell, findGridCell, stableShot } from './utils/element-tracker';

test.describe('wxGrid Cell Editing Tests', () => {

  test('GridEdit test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridedit/gridedit_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'gridedit-01-loaded.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Grid cells can be selected', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridedit/gridedit_test.html');
    await waitForWxApp(page);

    // Click on a cell using element registry
    const clicked = await clickGridCell(page, 1, 1);
    expect(clicked, 'Grid cell should be found and clicked').toBe(true);

    await stableShot(page, 'gridedit-02-select-cell.png', { fullPage: true });
  });

  test('Grid cells can be edited', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridedit/gridedit_test.html');
    await waitForWxApp(page);

    // Double-click to enter edit mode using element registry
    const cell = await findGridCell(page, 1, 1);
    expect(cell, 'Grid cell should be found').not.toBeNull();
    await page.mouse.dblclick(cell!.centerX, cell!.centerY);

    await stableShot(page, 'gridedit-03-edit-cell.png', { fullPage: true });
  });

  test('Grid rows can be added', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridedit/gridedit_test.html');
    await waitForWxApp(page);

    // Click Add Row button using element registry
    const clicked = await clickByLabel(page, 'Add Row');
    expect(clicked, 'Add Row button should be found and clicked').toBe(true);

    await stableShot(page, 'gridedit-04-add-row.png', { fullPage: true });
  });

  test('Grid rows can be deleted', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridedit/gridedit_test.html');
    await waitForWxApp(page);

    // Select a row first using element registry
    const cellClicked = await clickGridCell(page, 1, 1);
    expect(cellClicked, 'Grid cell should be found and clicked').toBe(true);
    await page.waitForTimeout(100); // eslint-disable-line -- documented interaction dwell: let the cell-selection commit before the Delete Row click; no observable event is emitted

    // Click Delete Row button using element registry
    const deleteClicked = await clickByLabel(page, 'Delete Row');
    expect(deleteClicked, 'Delete Row button should be found and clicked').toBe(true);

    await stableShot(page, 'gridedit-05-delete-row.png', { fullPage: true });
  });
});
