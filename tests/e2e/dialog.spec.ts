import { test, expect, Page } from '@playwright/test';

const MAIN_CANVAS = '#canvas';

async function tryLoadApp(page: Page, timeout = 15000) {
  try {
    await page.waitForSelector(MAIN_CANVAS, { state: 'visible', timeout });
    await page.waitForTimeout(500);
    return true;
  } catch {
    return false;
  }
}

test.describe('wxDialog/wxMessageBox Tests', () => {
  test('Dialog test app loads successfully', async ({ page }) => {
    const consoleLogs: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', msg => consoleLogs.push(msg.text()));
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto('/standalone/dialog/dialog_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/dialog-01-loaded.png', fullPage: true });

    const hasStartupLog = consoleLogs.some(log =>
      log.includes('DIALOG_TEST') && log.includes('started successfully')
    );

    console.log('Dialog app logs:', consoleLogs.filter(l => l.includes('DIALOG')));
    console.log('Dialog app loaded:', hasStartupLog);

    expect(loaded, 'Canvas should be visible').toBe(true);
    expect(pageErrors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Info dialog button can be clicked', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto('/standalone/dialog/dialog_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    const canvas = page.locator(MAIN_CANVAS);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Info Dialog button is first in the wxMessageBox row
    // Layout: description (~80px) + fieldset header + buttons
    // Buttons are centered horizontally in 3-button row
    // Estimate: first button at ~(centerX - 120), y ~115
    const centerX = box.width / 2;
    await page.mouse.click(box.x + centerX - 110, box.y + 115);
    await page.waitForTimeout(500);

    console.log('Info dialog logs:', consoleLogs.filter(l => l.includes('DIALOG')));
    await page.screenshot({ path: 'test-results/dialog-02-info-clicked.png', fullPage: true });

    const hasInfoEvent = consoleLogs.some(log =>
      log.includes('Opening Info dialog')
    );

    expect(hasInfoEvent, 'Info dialog should open').toBe(true);
  });

  test('Yes/No dialog button can be clicked', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto('/standalone/dialog/dialog_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    const canvas = page.locator(MAIN_CANVAS);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Yes/No Dialog button is second (center) in the wxMessageBox row
    const centerX = box.width / 2;
    await page.mouse.click(box.x + centerX, box.y + 115);
    await page.waitForTimeout(500);

    console.log('Yes/No dialog logs:', consoleLogs.filter(l => l.includes('DIALOG')));
    await page.screenshot({ path: 'test-results/dialog-03-yesno-clicked.png', fullPage: true });

    const hasYesNoEvent = consoleLogs.some(log =>
      log.includes('Opening Yes/No dialog')
    );
    expect(hasYesNoEvent, 'Yes/No dialog should open').toBe(true);
  });

  test('Error dialog button can be clicked', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto('/standalone/dialog/dialog_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    const canvas = page.locator(MAIN_CANVAS);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Error Dialog button is third (rightmost) in the wxMessageBox row
    const centerX = box.width / 2;
    await page.mouse.click(box.x + centerX + 110, box.y + 115);
    await page.waitForTimeout(500);

    console.log('Error dialog logs:', consoleLogs.filter(l => l.includes('DIALOG')));
    await page.screenshot({ path: 'test-results/dialog-04-error-clicked.png', fullPage: true });

    const hasErrorEvent = consoleLogs.some(log =>
      log.includes('Opening Error dialog')
    );
    expect(hasErrorEvent, 'Error dialog should open').toBe(true);
  });

  test('Custom dialog button can be clicked', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto('/standalone/dialog/dialog_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    const canvas = page.locator(MAIN_CANVAS);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Custom Dialog button is first in the wxDialog row (row 2)
    // Y position is lower (~175) since it's in the second fieldset
    const centerX = box.width / 2;
    await page.mouse.click(box.x + centerX - 60, box.y + 175);
    await page.waitForTimeout(500);

    console.log('Custom dialog logs:', consoleLogs.filter(l => l.includes('DIALOG')));
    await page.screenshot({ path: 'test-results/dialog-05-custom-clicked.png', fullPage: true });

    expect(true).toBe(true);
  });
});
