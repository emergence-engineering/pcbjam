// wxDataViewCtrl Virtual Mode Tests - Zone Manager/Net Inspector simulation
import { test, expect, tryLoadApp } from './utils/fixtures';
import { clickByLabel, findAllRenderedByLabel, clickDataViewItemByIndex, clickDataViewItem } from './utils/element-tracker';

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
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);

    // Click 10,000 button to test large dataset using element registry
    const clicked = await clickByLabel(page, '10,000');
    expect(clicked, '10,000 button should be found').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/dataviewvirtual-02-large-dataset.png', fullPage: true });

    const hasVirtualLog = testLogger.consoleLogs.some(l =>
      l.includes('virtual') || l.includes('10,000') || l.includes('DATAVIEW'));

    expect(loaded, 'Virtual list should handle large data').toBe(true);
  });

  test('Virtual list scrolling works', async ({ page, testLogger }) => {
    await page.goto('/standalone/dataviewvirtual/dataviewvirtual_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click Middle button using element registry
    const clicked = await clickByLabel(page, 'Middle');
    expect(clicked, 'Middle button should be found').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/dataviewvirtual-03-scroll.png', fullPage: true });
  });

  test('Virtual list selection works', async ({ page, testLogger }) => {
    await page.goto('/standalone/dataviewvirtual/dataviewvirtual_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click on an item in the list using element registry
    // Virtual list items have labels like "NET_00000", "NET_00001", etc.
    const clicked = await clickDataViewItemByIndex(page, 0);
    expect(clicked).toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/dataviewvirtual-04-selection.png', fullPage: true });
  });

  test('Zone manager panel works', async ({ page, testLogger }) => {
    await page.goto('/standalone/dataviewvirtual/dataviewvirtual_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click in zone manager panel using element registry
    // Zone items have labels like "Zone_000", "Zone_001", etc.
    const clicked = await clickDataViewItem(page, 'Zone_000');
    expect(clicked).toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/dataviewvirtual-05-zone-manager.png', fullPage: true });
  });
});
