// wxAuiNotebook Tests - Tab panels for KiCad editors
import { test, expect, waitForWxApp } from './utils/fixtures';
import { clickByLabel, clickTab, stableShot } from './utils/element-tracker';

test.describe('wxAuiNotebook Tests', () => {

  test('AuiNotebook test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/auinotebook/auinotebook_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'auinotebook-01-loaded.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('AuiNotebook tabs can be switched', async ({ page, testLogger }) => {
    await page.goto('/standalone/auinotebook/auinotebook_test.html');
    await waitForWxApp(page);

    // Click on PCB tab using element registry
    const clicked = await clickTab(page, 'PCB');
    expect(clicked, 'PCB tab should be found and clicked').toBe(true);

    await stableShot(page, 'auinotebook-02-tab-switch.png', { fullPage: true });
  });

  test('AuiNotebook tabs can be added', async ({ page, testLogger }) => {
    await page.goto('/standalone/auinotebook/auinotebook_test.html');
    await waitForWxApp(page);

    // Click Add Tab button using element registry
    const clicked = await clickByLabel(page, 'Add Tab');
    expect(clicked, 'Add Tab button should be found and clicked').toBe(true);

    await stableShot(page, 'auinotebook-03-add-tab.png', { fullPage: true });
  });

  test('AuiNotebook tabs can be removed', async ({ page, testLogger }) => {
    await page.goto('/standalone/auinotebook/auinotebook_test.html');
    await waitForWxApp(page);

    // Click Remove Tab button using element registry
    const clicked = await clickByLabel(page, 'Remove Tab');
    expect(clicked, 'Remove Tab button should be found and clicked').toBe(true);

    await stableShot(page, 'auinotebook-04-remove-tab.png', { fullPage: true });
  });

  test('AuiNotebook tab style can be changed', async ({ page, testLogger }) => {
    await page.goto('/standalone/auinotebook/auinotebook_test.html');
    await waitForWxApp(page);

    // Click Bottom button using element registry
    const clicked = await clickByLabel(page, 'Bottom');
    expect(clicked, 'Bottom button should be found and clicked').toBe(true);

    await stableShot(page, 'auinotebook-05-tab-style.png', { fullPage: true });
  });
});
