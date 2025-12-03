// wxCalendarCtrl Tests - Date selection
import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('wxCalendarCtrl Tests', () => {

  test('Calendar test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/calendar/calendar_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/calendar-01-loaded.png', fullPage: true });

    expect(loaded, 'wxCalendarCtrl app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Calendar dates can be selected', async ({ page, testLogger }) => {
    await page.goto('/standalone/calendar/calendar_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Click on a day in the calendar
      await page.mouse.click(box.x + 150, box.y + 200);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/calendar-02-select-date.png', fullPage: true });
  });

  test('Calendar can navigate to next month', async ({ page, testLogger }) => {
    await page.goto('/standalone/calendar/calendar_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Click Next Month button
      await page.mouse.click(box.x + 480, box.y + 170);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/calendar-03-next-month.png', fullPage: true });
  });

  test('Calendar can navigate to previous month', async ({ page, testLogger }) => {
    await page.goto('/standalone/calendar/calendar_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // Click Previous Month button
      await page.mouse.click(box.x + 480, box.y + 200);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/calendar-04-prev-month.png', fullPage: true });
  });

  test('Calendar can navigate to today', async ({ page, testLogger }) => {
    await page.goto('/standalone/calendar/calendar_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (box) {
      // First go to next month
      await page.mouse.click(box.x + 480, box.y + 170);
      await page.waitForTimeout(100);
      // Click Today button
      await page.mouse.click(box.x + 480, box.y + 140);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/calendar-05-today.png', fullPage: true });
  });
});
