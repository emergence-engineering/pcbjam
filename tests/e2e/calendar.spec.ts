// wxCalendarCtrl Tests - Date selection
import { test, expect, tryLoadApp } from './utils/fixtures';
import { clickByLabel, clickCalendarDate } from './utils/element-tracker';

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
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click on day 15 in the calendar using element registry
    const clicked = await clickCalendarDate(page, 15);
    expect(clicked, 'Calendar date 15 should be found and clicked').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/calendar-02-select-date.png', fullPage: true });
  });

  test('Calendar can navigate to next month', async ({ page, testLogger }) => {
    await page.goto('/standalone/calendar/calendar_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click Next Month button using element registry
    const clicked = await clickByLabel(page, 'Next Month');
    expect(clicked, 'Next Month button should be found').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/calendar-03-next-month.png', fullPage: true });
  });

  test('Calendar can navigate to previous month', async ({ page, testLogger }) => {
    await page.goto('/standalone/calendar/calendar_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click Previous Month button using element registry
    const clicked = await clickByLabel(page, 'Previous Month');
    expect(clicked, 'Previous Month button should be found').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/calendar-04-prev-month.png', fullPage: true });
  });

  test('Calendar can navigate to today', async ({ page, testLogger }) => {
    await page.goto('/standalone/calendar/calendar_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // First go to next month
    const nextClicked = await clickByLabel(page, 'Next Month');
    expect(nextClicked, 'Next Month button should be found').toBe(true);
    await page.waitForTimeout(100);

    // Click Today button using element registry
    const todayClicked = await clickByLabel(page, 'Today');
    expect(todayClicked, 'Today button should be found').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/calendar-05-today.png', fullPage: true });
  });
});
