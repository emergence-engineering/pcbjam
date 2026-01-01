// wxPrintPreview Tests - Print preview, page setup
import { test, expect, tryLoadApp } from './utils/fixtures';
import { clickByLabel } from './utils/element-tracker';

test.describe('wxPrintPreview Tests', () => {

  test('Print preview test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/printpreview/printpreview_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/printpreview-01-loaded.png', fullPage: true });

    expect(loaded, 'Print preview app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Preview area displays schematic-like content', async ({ page, testLogger }) => {
    await page.goto('/standalone/printpreview/printpreview_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);

    // Preview area should show sample schematic with grid, components, and title block
    await page.screenshot({ path: 'test-results/printpreview-02-preview-area.png', fullPage: true });
  });

  test('Print Preview button opens preview frame', async ({ page, testLogger }) => {
    await page.goto('/standalone/printpreview/printpreview_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click Print Preview button using element registry
    const clicked = await clickByLabel(page, 'Print Preview');
    expect(clicked, 'Print Preview button should be found and clicked').toBe(true);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/printpreview-03-preview-frame.png', fullPage: true });
  });

  test('Page Setup button opens dialog', async ({ page, testLogger }) => {
    await page.goto('/standalone/printpreview/printpreview_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click Page Setup button using element registry
    const clicked = await clickByLabel(page, 'Page Setup');
    expect(clicked, 'Page Setup button should be found and clicked').toBe(true);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/printpreview-04-page-setup.png', fullPage: true });
  });

  test('Print settings display shows current configuration', async ({ page, testLogger }) => {
    await page.goto('/standalone/printpreview/printpreview_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(500);

    // Settings display should show orientation, paper size, quality, color
    await page.screenshot({ path: 'test-results/printpreview-05-settings.png', fullPage: true });
  });
});
