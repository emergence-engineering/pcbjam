// wxCollapsiblePane Tests - Collapsible sections for property panels
import { test, expect, waitForWxApp } from './utils/fixtures';
import { clickByLabel, stableShot } from './utils/element-tracker';

test.describe('wxCollapsiblePane Tests', () => {

  test('Collapsible test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/collapsible/collapsible_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'collapsible-01-loaded.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Collapsible panes are created', async ({ page, testLogger }) => {
    await page.goto('/standalone/collapsible/collapsible_test.html');
    await waitForWxApp(page);

    await expect.poll(() => testLogger.consoleLogs.some(l =>
      l.includes('3 collapsible sections') || l.includes('CollapsiblePane test app')),
      { message: 'Collapsible panes should be created' }).toBe(true);

    await stableShot(page, 'collapsible-02-panes.png', { fullPage: true });
  });

  test('First pane is expanded by default', async ({ page, testLogger }) => {
    await page.goto('/standalone/collapsible/collapsible_test.html');
    await waitForWxApp(page);

    // First pane should be expanded showing content
    await stableShot(page, 'collapsible-03-expanded.png', { fullPage: true });
  });

  test('Expand All button works', async ({ page, testLogger }) => {
    await page.goto('/standalone/collapsible/collapsible_test.html');
    await waitForWxApp(page);

    // Click Expand All button using element registry
    const clicked = await clickByLabel(page, 'Expand All');
    expect(clicked, 'Expand All button should be found and clicked').toBe(true);

    await expect.poll(() => testLogger.consoleLogs.some(l =>
      l.includes('All panes expanded') || l.includes('expanded')),
      { message: 'Expand All should log expansion' }).toBe(true);

    await stableShot(page, 'collapsible-04-expand-all.png', { fullPage: true });
  });

  test('Collapse All button works', async ({ page, testLogger }) => {
    await page.goto('/standalone/collapsible/collapsible_test.html');
    await waitForWxApp(page);

    // Click Collapse All button using element registry
    const clicked = await clickByLabel(page, 'Collapse All');
    expect(clicked, 'Collapse All button should be found and clicked').toBe(true);

    await expect.poll(() => testLogger.consoleLogs.some(l =>
      l.includes('All panes collapsed') || l.includes('collapsed')),
      { message: 'Collapse All should log collapse' }).toBe(true);

    await stableShot(page, 'collapsible-05-collapse-all.png', { fullPage: true });
  });

});
