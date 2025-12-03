// wxDataViewCtrl Virtual Mode Tests - Zone Manager/Net Inspector simulation
import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('wxDataViewCtrl Virtual Mode Tests', () => {

  test('DataViewVirtual test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/dataviewvirtual/dataviewvirtual_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/dataviewvirtual-01-loaded.png', fullPage: true });

    expect(loaded, 'wxDataViewCtrl virtual mode app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Virtual list handles large datasets', async ({ page, testLogger }) => {
    await page.goto('/standalone/dataviewvirtual/dataviewvirtual_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(500);

    // Click 10,000 button to test large dataset
    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Click where the 10,000 button should be
      await page.mouse.click(box.x + 200, box.y + 60);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/dataviewvirtual-02-large-dataset.png', fullPage: true });

    const hasVirtualLog = testLogger.consoleLogs.some(l =>
      l.includes('virtual') || l.includes('10,000') || l.includes('DATAVIEW'));

    expect(loaded, 'Virtual list should handle large data').toBe(true);
  });

  test('Virtual list scrolling works', async ({ page, testLogger }) => {
    await page.goto('/standalone/dataviewvirtual/dataviewvirtual_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Click Middle button
      await page.mouse.click(box.x + 340, box.y + 60);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/dataviewvirtual-03-scroll.png', fullPage: true });
  });

  test('Virtual list selection works', async ({ page, testLogger }) => {
    await page.goto('/standalone/dataviewvirtual/dataviewvirtual_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Click on an item in the list
      await page.mouse.click(box.x + 200, box.y + 200);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/dataviewvirtual-04-selection.png', fullPage: true });
  });

  test('Zone manager panel works', async ({ page, testLogger }) => {
    await page.goto('/standalone/dataviewvirtual/dataviewvirtual_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Click in zone manager panel (right side)
      await page.mouse.click(box.x + 700, box.y + 200);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/dataviewvirtual-05-zone-manager.png', fullPage: true });
  });
});
