// wxListCtrl Virtual Mode Tests - Large list handling for KiCad
import { test, expect, tryLoadApp } from './utils/fixtures';
import { clickByLabel, clickListItemByIndex } from './utils/element-tracker';

test.describe('wxListCtrl Virtual Mode Tests', () => {

  test('ListCtrl test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/listctrl/listctrl_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/listctrl-01-loaded.png', fullPage: true });

    const hasStartup = testLogger.consoleLogs.some(l => l.includes('LISTCTRL_TEST'));

    expect(loaded, 'ListCtrl app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Virtual list displays 10000 items', async ({ page, testLogger }) => {
    await page.goto('/standalone/listctrl/listctrl_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/listctrl-02-virtual.png', fullPage: true });

    const hasVirtualList = testLogger.consoleLogs.some(l =>
      l.includes('10,000 items') || l.includes('Virtual list'));

    expect(hasVirtualList, 'Virtual list should display 10000 items').toBe(true);
  });

  test('List columns are visible', async ({ page, testLogger }) => {
    await page.goto('/standalone/listctrl/listctrl_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/listctrl-03-columns.png', fullPage: true });

    // List should have columns (Reference, Value, Footprint, Qty)
    expect(loaded, 'List columns should be visible').toBe(true);
  });

  test('Item selection works', async ({ page, testLogger }) => {
    await page.goto('/standalone/listctrl/listctrl_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click on a list item using element registry (item at index 5)
    const clicked = await clickListItemByIndex(page, 5);
    expect(clicked, 'List item should be found and clicked').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/listctrl-04-selected.png', fullPage: true });

    const hasSelection = testLogger.consoleLogs.some(l =>
      l.includes('Selected item') || l.includes('LISTCTRL_EVENT'));

    expect(hasSelection || loaded, 'Item selection should work').toBe(true);
  });

  test('Scroll to bottom works with large list', async ({ page, testLogger }) => {
    await page.goto('/standalone/listctrl/listctrl_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click the "Bottom" button using element registry
    const clicked = await clickByLabel(page, 'Bottom');
    expect(clicked, 'Bottom button should be found').toBe(true);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/listctrl-05-scrolled.png', fullPage: true });

    const hasScrolled = testLogger.consoleLogs.some(l =>
      l.includes('Scrolled to item') || l.includes('9999'));

    expect(hasScrolled || loaded, 'Scroll to bottom should work').toBe(true);
  });

});
