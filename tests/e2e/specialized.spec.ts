// Specialized wxWidgets Controls Tests - Treebook, RearrangeCtrl, BitmapComboBox
import { test, expect, tryLoadApp } from './utils/fixtures';
import { clickByLabel, clickComboButton, selectComboItem, clickListboxItem, clickTreeItem } from './utils/element-tracker';

test.describe('Specialized wxWidgets Controls Tests', () => {

  test('Specialized controls test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/specialized/specialized_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/specialized-01-loaded.png', fullPage: true });

    expect(loaded, 'Specialized controls app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('wxTreebook displays tree with pages', async ({ page, testLogger }) => {
    await page.goto('/standalone/specialized/specialized_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);

    // Treebook should show General page by default with tree on left
    await page.screenshot({ path: 'test-results/specialized-02-treebook-initial.png', fullPage: true });
  });

  test('wxTreebook can navigate between pages', async ({ page, testLogger }) => {
    await page.goto('/standalone/specialized/specialized_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click on Display page using element registry
    await clickTreeItem(page, 'Display');
    await page.waitForTimeout(200);

    // Click on Printing page using element registry
    await clickTreeItem(page, 'Printing');
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/specialized-03-treebook-subpage.png', fullPage: true });
  });

  test('wxTreebook can expand tree nodes', async ({ page, testLogger }) => {
    await page.goto('/standalone/specialized/specialized_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click on Editing page using element registry
    await clickTreeItem(page, 'Editing');
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/specialized-04-treebook-expand.png', fullPage: true });
  });

  test('wxBitmapComboBox displays layer swatches', async ({ page, testLogger }) => {
    await page.goto('/standalone/specialized/specialized_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click on layer combo box to open dropdown using element tracking
    const opened = await clickComboButton(page);
    expect(opened, 'Should be able to open BitmapComboBox dropdown').toBe(true);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/specialized-05-bitmapcombo-dropdown.png', fullPage: true });
  });

  test('wxBitmapComboBox can select different layer', async ({ page, testLogger }) => {
    await page.goto('/standalone/specialized/specialized_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Select B.Cu layer using element tracking
    const selected = await selectComboItem(page, 'B.Cu');
    expect(selected, 'Should be able to select B.Cu from dropdown').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/specialized-06-bitmapcombo-select.png', fullPage: true });
  });

  test('wxRearrangeCtrl displays layer order', async ({ page, testLogger }) => {
    await page.goto('/standalone/specialized/specialized_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);

    // RearrangeCtrl should show list of layers with checkboxes
    await page.screenshot({ path: 'test-results/specialized-07-rearrange-list.png', fullPage: true });
  });

  test('wxRearrangeCtrl Get Layer Status button works', async ({ page, testLogger }) => {
    await page.goto('/standalone/specialized/specialized_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click Get Layer Status button using element registry
    await clickByLabel(page, 'Get Layer Status');
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/specialized-08-get-order.png', fullPage: true });
  });
});
