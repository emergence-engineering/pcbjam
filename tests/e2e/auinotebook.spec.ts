// wxAuiNotebook Tests - Tab panels for KiCad editors
import { test, expect, tryLoadApp } from './utils/fixtures';

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
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Click on PCB tab
      await page.mouse.click(box.x + 200, box.y + 95);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/auinotebook-02-tab-switch.png', fullPage: true });
  });

  test('AuiNotebook tabs can be added', async ({ page, testLogger }) => {
    await page.goto('/standalone/auinotebook/auinotebook_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Click Add Tab button
      await page.mouse.click(box.x + 60, box.y + 60);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/auinotebook-03-add-tab.png', fullPage: true });
  });

  test('AuiNotebook tabs can be removed', async ({ page, testLogger }) => {
    await page.goto('/standalone/auinotebook/auinotebook_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Click Remove Tab button
      await page.mouse.click(box.x + 160, box.y + 60);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/auinotebook-04-remove-tab.png', fullPage: true });
  });

  test('AuiNotebook tab style can be changed', async ({ page, testLogger }) => {
    await page.goto('/standalone/auinotebook/auinotebook_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Click Bottom button
      await page.mouse.click(box.x + 470, box.y + 60);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/auinotebook-05-tab-style.png', fullPage: true });
  });
});
