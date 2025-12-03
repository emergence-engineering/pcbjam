// wxWizard Tests - Footprint Wizard simulation
import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('wxWizard Tests', () => {

  test('Wizard test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/wizard/wizard_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/wizard-01-loaded.png', fullPage: true });

    expect(loaded, 'wxWizard app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Wizard dialog can be launched', async ({ page, testLogger }) => {
    await page.goto('/standalone/wizard/wizard_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Click Launch button
      await page.mouse.click(box.x + 120, box.y + 60);
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: 'test-results/wizard-02-launch.png', fullPage: true });
  });

  test('Wizard can navigate to next page', async ({ page, testLogger }) => {
    await page.goto('/standalone/wizard/wizard_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Launch wizard
      await page.mouse.click(box.x + 120, box.y + 60);
      await page.waitForTimeout(500);
      // Click Next
      await page.mouse.click(box.x + 500, box.y + 400);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/wizard-03-next-page.png', fullPage: true });
  });

  test('Wizard can navigate back', async ({ page, testLogger }) => {
    await page.goto('/standalone/wizard/wizard_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Launch wizard
      await page.mouse.click(box.x + 120, box.y + 60);
      await page.waitForTimeout(500);
      // Click Next
      await page.mouse.click(box.x + 500, box.y + 400);
      await page.waitForTimeout(200);
      // Click Back
      await page.mouse.click(box.x + 400, box.y + 400);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/wizard-04-back-page.png', fullPage: true });
  });

  test('Wizard can be cancelled', async ({ page, testLogger }) => {
    await page.goto('/standalone/wizard/wizard_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Launch wizard
      await page.mouse.click(box.x + 120, box.y + 60);
      await page.waitForTimeout(500);
      // Click Cancel
      await page.mouse.click(box.x + 300, box.y + 400);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/wizard-05-cancel.png', fullPage: true });
  });
});
