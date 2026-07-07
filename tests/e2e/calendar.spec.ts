// wxCalendarCtrl Tests - Date selection
import { test, expect, waitForWxApp } from './utils/fixtures';
import { clickByLabel, clickCalendarDate, stableShot } from './utils/element-tracker';

test.describe('wxCalendarCtrl Tests', () => {

  test('Calendar test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/calendar/calendar_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'calendar-01-loaded.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Calendar dates can be selected', async ({ page, testLogger }) => {
    await page.goto('/standalone/calendar/calendar_test.html');
    await waitForWxApp(page);

    // Click on day 15 in the calendar using element registry
    const clicked = await clickCalendarDate(page, 15);
    expect(clicked, 'Calendar date 15 should be found and clicked').toBe(true);

    await stableShot(page, 'calendar-02-select-date.png', { fullPage: true });
  });

  test('Calendar can navigate to next month', async ({ page, testLogger }) => {
    await page.goto('/standalone/calendar/calendar_test.html');
    await waitForWxApp(page);

    // Click Next Month button using element registry
    const clicked = await clickByLabel(page, 'Next Month');
    expect(clicked, 'Next Month button should be found').toBe(true);

    await stableShot(page, 'calendar-03-next-month.png', { fullPage: true });
  });

  test('Calendar can navigate to previous month', async ({ page, testLogger }) => {
    await page.goto('/standalone/calendar/calendar_test.html');
    await waitForWxApp(page);

    // Click Previous Month button using element registry
    const clicked = await clickByLabel(page, 'Previous Month');
    expect(clicked, 'Previous Month button should be found').toBe(true);

    await stableShot(page, 'calendar-04-prev-month.png', { fullPage: true });
  });

  test('Calendar can navigate to today', async ({ page, testLogger }) => {
    await page.goto('/standalone/calendar/calendar_test.html');
    await waitForWxApp(page);

    // First go to next month
    const nextClicked = await clickByLabel(page, 'Next Month');
    expect(nextClicked, 'Next Month button should be found').toBe(true);

    // Click Today button using element registry
    const todayClicked = await clickByLabel(page, 'Today');
    expect(todayClicked, 'Today button should be found').toBe(true);

    await stableShot(page, 'calendar-05-today.png', { fullPage: true });
  });
});
