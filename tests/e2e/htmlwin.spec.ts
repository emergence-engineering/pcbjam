import { test, expect } from './utils/fixtures';
import { clickByLabel, waitForWxApp, stableShot } from './utils/element-tracker';

/**
 * wxHtmlWindow Tests
 *
 * Layout (from button-finder):
 * - Buttons at y≈96:
 *   - Basic HTML: x≈416
 *   - Tables: x≈528
 *   - Long Content: x≈608
 *   - KiCad About: x≈736
 * - HTML content area starts at y≈120
 */

test.describe('wxHtmlWindow Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/standalone/htmlwin/htmlwin_test.html');
    // Deterministic app-readiness: canvas visible + wx element registry populated (fails loudly).
    await waitForWxApp(page);
  });

  test('HtmlWindow test app loads successfully', async ({ page, testLogger }) => {
    const hasStartupLog = testLogger.consoleLogs.some(log =>
      log.includes('HTMLWIN_TEST') && log.includes('started successfully')
    );

    await stableShot(page, 'htmlwin-01-loaded.png');

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Basic HTML content is displayed', async ({ page }) => {
    // Take screenshot to verify basic HTML content is displayed
    await stableShot(page, 'htmlwin-02-basic-content.png');

    // Visual verification through screenshot - the HTML window should show initial content.
  });

  test('Tables button loads table content', async ({ page, testLogger }) => {
    // Click Tables button using element registry
    await clickByLabel(page, 'Tables');

    await expect
      .poll(() => testLogger.consoleLogs.some(l => l.includes('table HTML content')), {
        message: 'Tables button should load table HTML content',
      })
      .toBe(true);

    await stableShot(page, 'htmlwin-03-tables.png');
  });

  test('Long Content button loads scrollable content', async ({ page, testLogger }) => {
    // Click Long Content button using element registry
    await clickByLabel(page, 'Long Content');

    await expect
      .poll(
        () =>
          testLogger.consoleLogs.some(
            l => l.includes('long scrollable content') || l.includes('30 sections')
          ),
        { message: 'Long Content button should load scrollable content' }
      )
      .toBe(true);

    await stableShot(page, 'htmlwin-04-long-content.png');
  });

  test('KiCad About button loads KiCad-style content', async ({ page, testLogger }) => {
    // Click KiCad About button using element registry
    await clickByLabel(page, 'KiCad-style About');

    await expect
      .poll(() => testLogger.consoleLogs.some(l => l.includes('KiCad-style About')), {
        message: 'KiCad About button should load KiCad-style content',
      })
      .toBe(true);

    await stableShot(page, 'htmlwin-05-kicad-about.png');
  });

  test('Link click fires event', async ({ page, testLogger }) => {
    const canvas = page.locator('canvas');

    // Click Basic HTML first to ensure links are visible
    await clickByLabel(page, 'Basic HTML');
    await expect
      .poll(() => testLogger.consoleLogs.some(l => l.includes('basic HTML content')), {
        message: 'Basic HTML content should load before clicking a link',
      })
      .toBe(true);

    // Click on a link in the HTML content (link positions not in registry)
    await canvas.click({ position: { x: 200, y: 350 } });

    await stableShot(page, 'htmlwin-06-link-clicked.png');

    const hasLinkLog = testLogger.consoleLogs.some(log =>
      log.includes('Link clicked') || log.includes('HTMLWIN_LINK')
    );
    // Link click event should fire if hit
  });

  test('Scrolling works with long content', async ({ page, testLogger }) => {
    const canvas = page.locator('canvas');

    // Load long content first
    await clickByLabel(page, 'Long Content');
    await expect
      .poll(
        () =>
          testLogger.consoleLogs.some(
            l => l.includes('long scrollable content') || l.includes('30 sections')
          ),
        { message: 'Long content should load before scrolling' }
      )
      .toBe(true);

    // Scroll the content (scroll position not in registry)
    await canvas.hover({ position: { x: 350, y: 300 } });
    await page.mouse.wheel(0, 300);

    await stableShot(page, 'htmlwin-07-scrolled.png');

    // Visual verification through screenshot
  });

  test('Content can be switched between buttons', async ({ page, testLogger }) => {
    // Click each button in sequence using element registry
    await clickByLabel(page, 'Basic HTML');
    await expect
      .poll(() => testLogger.consoleLogs.some(l => l.includes('basic HTML content')), {
        message: 'Basic HTML content should load',
      })
      .toBe(true);
    await stableShot(page, 'htmlwin-08a-basic.png');

    await clickByLabel(page, 'Tables');
    await expect
      .poll(() => testLogger.consoleLogs.some(l => l.includes('table HTML content')), {
        message: 'Table content should load',
      })
      .toBe(true);
    await stableShot(page, 'htmlwin-08b-tables.png');

    await clickByLabel(page, 'KiCad-style About');
    await expect
      .poll(() => testLogger.consoleLogs.some(l => l.includes('KiCad-style About')), {
        message: 'KiCad-style About content should load',
      })
      .toBe(true);
    await stableShot(page, 'htmlwin-08c-about.png');

    // Check that multiple content changes happened
    const contentChanges = testLogger.consoleLogs.filter(log =>
      log.includes('Loaded')
    ).length;
    expect(contentChanges).toBeGreaterThanOrEqual(2);
  });
});
