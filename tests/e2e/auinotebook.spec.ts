// wxAuiNotebook Tests - Tab panels for KiCad editors
import { test, expect, tryLoadApp } from './utils/fixtures';
import { clickByLabel, clickTab } from './utils/element-tracker';

test.describe('wxAuiNotebook Tests', () => {

  test('AuiNotebook test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/auinotebook/auinotebook_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/auinotebook-01-loaded.png', fullPage: true });

    expect(loaded, 'wxAuiNotebook app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('AuiNotebook tabs can be switched', async ({ page, testLogger }) => {
    await page.goto('/standalone/auinotebook/auinotebook_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click on PCB tab using element registry
    const clicked = await clickTab(page, 'PCB');
    expect(clicked, 'PCB tab should be found and clicked').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/auinotebook-02-tab-switch.png', fullPage: true });
  });

  test('AuiNotebook tabs can be added', async ({ page, testLogger }) => {
    await page.goto('/standalone/auinotebook/auinotebook_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click Add Tab button using element registry
    const clicked = await clickByLabel(page, 'Add Tab');
    expect(clicked, 'Add Tab button should be found and clicked').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/auinotebook-03-add-tab.png', fullPage: true });
  });

  test('AuiNotebook tabs can be removed', async ({ page, testLogger }) => {
    await page.goto('/standalone/auinotebook/auinotebook_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click Remove Tab button using element registry
    const clicked = await clickByLabel(page, 'Remove Tab');
    expect(clicked, 'Remove Tab button should be found and clicked').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/auinotebook-04-remove-tab.png', fullPage: true });
  });

  test('AuiNotebook tab style can be changed', async ({ page, testLogger }) => {
    await page.goto('/standalone/auinotebook/auinotebook_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click Bottom button using element registry
    const clicked = await clickByLabel(page, 'Bottom');
    expect(clicked, 'Bottom button should be found and clicked').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/auinotebook-05-tab-style.png', fullPage: true });
  });
});
