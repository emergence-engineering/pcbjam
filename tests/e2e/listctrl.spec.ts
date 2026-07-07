// wxListCtrl Virtual Mode Tests - Large list handling for KiCad
// Uses element registry for semantic element identification.
//
// Determinism: no waitForTimeout. Readiness via waitForWxApp (canvas visible +
// registry populated, fails loudly). Each interaction's effect is the console event
// the app emits ('10,000 items'/'Virtual list', 'Selected item'/'LISTCTRL_EVENT',
// 'Scrolled to item'/'9999'), so we poll for that exact event instead of sleeping.
// Static loaded/virtual/columns/selected/scrolled states use stableShot, whose
// built-in stabilization replaces the old settle sleeps.
import { test, expect, waitForWxApp } from './utils/fixtures';
import { clickByLabel, clickListItemByIndex, stableShot } from './utils/element-tracker';

test.describe('wxListCtrl Virtual Mode Tests', () => {

  test('ListCtrl test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/listctrl/listctrl_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'listctrl-01-loaded.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Virtual list displays 10000 items', async ({ page, testLogger }) => {
    await page.goto('/standalone/listctrl/listctrl_test.html');
    await waitForWxApp(page);

    await expect.poll(
      () => testLogger.consoleLogs.some(l =>
        l.includes('10,000 items') || l.includes('Virtual list')),
      { message: 'Virtual list should display 10000 items' }
    ).toBe(true);

    await stableShot(page, 'listctrl-02-virtual.png', { fullPage: true });
  });

  test('List columns are visible', async ({ page }) => {
    await page.goto('/standalone/listctrl/listctrl_test.html');
    await waitForWxApp(page);

    // List should have columns (Reference, Value, Footprint, Qty)
    await stableShot(page, 'listctrl-03-columns.png', { fullPage: true });
  });

  test('Item selection works', async ({ page, testLogger }) => {
    await page.goto('/standalone/listctrl/listctrl_test.html');
    await waitForWxApp(page);

    // Click on a list item using element registry (item at index 5)
    const clicked = await clickListItemByIndex(page, 5);
    expect(clicked, 'List item should be found and clicked').toBe(true);

    await expect.poll(
      () => testLogger.consoleLogs.some(l =>
        l.includes('Selected item') || l.includes('LISTCTRL_EVENT')),
      { message: 'Item selection should work' }
    ).toBe(true);

    await stableShot(page, 'listctrl-04-selected.png', { fullPage: true });
  });

  test('Scroll to bottom works with large list', async ({ page, testLogger }) => {
    await page.goto('/standalone/listctrl/listctrl_test.html');
    await waitForWxApp(page);

    // Click the "Bottom" button using element registry
    const clicked = await clickByLabel(page, 'Bottom');
    expect(clicked, 'Bottom button should be found').toBe(true);

    await expect.poll(
      () => testLogger.consoleLogs.some(l =>
        l.includes('Scrolled to item') || l.includes('9999')),
      { message: 'Scroll to bottom should work' }
    ).toBe(true);

    await stableShot(page, 'listctrl-05-scrolled.png', { fullPage: true });
  });

});
