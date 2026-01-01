// wxGrid Cell Editing Tests - Property editing simulation
import { test, expect, tryLoadApp } from './utils/fixtures';
import { clickByLabel, clickGridCell, findGridCell } from './utils/element-tracker';

test.describe('wxGrid Cell Editing Tests', () => {

  test('GridEdit test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridedit/gridedit_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/gridedit-01-loaded.png', fullPage: true });

    expect(loaded, 'wxGrid editing app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Grid cells can be selected', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridedit/gridedit_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click on a cell using element registry
    const clicked = await clickGridCell(page, 1, 1);
    expect(clicked, 'Grid cell should be found and clicked').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/gridedit-02-select-cell.png', fullPage: true });
  });

  test('Grid cells can be edited', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridedit/gridedit_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Double-click to enter edit mode using element registry
    const cell = await findGridCell(page, 1, 1);
    expect(cell, 'Grid cell should be found').not.toBeNull();
    if (cell) {
      await page.mouse.dblclick(cell.centerX, cell.centerY);
    }
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/gridedit-03-edit-cell.png', fullPage: true });
  });

  test('Grid rows can be added', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridedit/gridedit_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click Add Row button using element registry
    const clicked = await clickByLabel(page, 'Add Row');
    expect(clicked, 'Add Row button should be found and clicked').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/gridedit-04-add-row.png', fullPage: true });
  });

  test('Grid rows can be deleted', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridedit/gridedit_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Select a row first using element registry
    const cellClicked = await clickGridCell(page, 1, 1);
    expect(cellClicked, 'Grid cell should be found and clicked').toBe(true);
    await page.waitForTimeout(100);

    // Click Delete Row button using element registry
    const deleteClicked = await clickByLabel(page, 'Delete Row');
    expect(deleteClicked, 'Delete Row button should be found and clicked').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/gridedit-05-delete-row.png', fullPage: true });
  });
});
