// wxGrid Cell Editing Tests - Property editing simulation
import { test, expect, tryLoadApp } from './utils/fixtures';

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
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Click on a cell
      await page.mouse.click(box.x + 150, box.y + 180);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/gridedit-02-select-cell.png', fullPage: true });
  });

  test('Grid cells can be edited', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridedit/gridedit_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Double-click to enter edit mode
      await page.mouse.dblclick(box.x + 150, box.y + 180);
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: 'test-results/gridedit-03-edit-cell.png', fullPage: true });
  });

  test('Grid rows can be added', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridedit/gridedit_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Click Add Row button
      await page.mouse.click(box.x + 60, box.y + 60);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/gridedit-04-add-row.png', fullPage: true });
  });

  test('Grid rows can be deleted', async ({ page, testLogger }) => {
    await page.goto('/standalone/gridedit/gridedit_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Select a row first
      await page.mouse.click(box.x + 150, box.y + 180);
      await page.waitForTimeout(100);
      // Click Delete Row button
      await page.mouse.click(box.x + 150, box.y + 60);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/gridedit-05-delete-row.png', fullPage: true });
  });
});
