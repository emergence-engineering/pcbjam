// wxBitmapButton Tests - Bitmap buttons, toggle buttons, disabled states
import { test, expect, waitForWxApp } from './utils/fixtures';
import { clickByLabel, clickByName, stableShot } from './utils/element-tracker';

test.describe('wxBitmapButton Tests', () => {

  test('Bitmap buttons test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/bitmapbuttons/bitmapbuttons_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'bitmapbuttons-01-loaded.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Toolbar-style buttons can be clicked', async ({ page, testLogger }) => {
    await page.goto('/standalone/bitmapbuttons/bitmapbuttons_test.html');
    await waitForWxApp(page);

    // Click Select tool button using element registry (by name)
    await clickByName(page, 'SelectTool');
    // Click Line tool button
    await clickByName(page, 'LineTool');

    await stableShot(page, 'bitmapbuttons-02-toolbar-click.png', { fullPage: true });
  });

  test('Toggle buttons can be toggled', async ({ page, testLogger }) => {
    await page.goto('/standalone/bitmapbuttons/bitmapbuttons_test.html');
    await waitForWxApp(page);

    // Click F.Cu checkbox to toggle it using element registry
    await clickByLabel(page, 'F.Cu');

    await stableShot(page, 'bitmapbuttons-03-toggle.png', { fullPage: true });
  });

  test('Toggle button can toggle multiple layers', async ({ page, testLogger }) => {
    await page.goto('/standalone/bitmapbuttons/bitmapbuttons_test.html');
    await waitForWxApp(page);

    // Toggle multiple layer checkboxes using element registry
    await clickByLabel(page, 'F.Cu');
    await clickByLabel(page, 'B.Cu');

    await stableShot(page, 'bitmapbuttons-04-multi-toggle.png', { fullPage: true });
  });

  test('Disabled button can be re-enabled', async ({ page, testLogger }) => {
    await page.goto('/standalone/bitmapbuttons/bitmapbuttons_test.html');
    await waitForWxApp(page);

    // Click Toggle Enable State button using element registry
    await clickByLabel(page, 'Toggle Enable State');

    await stableShot(page, 'bitmapbuttons-05-enable-toggle.png', { fullPage: true });
  });

  test('Shape buttons display different icons', async ({ page, testLogger }) => {
    await page.goto('/standalone/bitmapbuttons/bitmapbuttons_test.html');
    await waitForWxApp(page);

    // Click different shape buttons using element registry (by name)
    await clickByName(page, 'Rectangle');
    await clickByName(page, 'Circle');
    await clickByName(page, 'Triangle');

    await stableShot(page, 'bitmapbuttons-06-shapes.png', { fullPage: true });
  });

  test('Art Provider buttons display system icons', async ({ page, testLogger }) => {
    await page.goto('/standalone/bitmapbuttons/bitmapbuttons_test.html');
    await waitForWxApp(page);

    // Click New, Open buttons using element registry (by name)
    await clickByName(page, 'New');
    await clickByName(page, 'Open');

    await stableShot(page, 'bitmapbuttons-07-artprovider.png', { fullPage: true });
  });
});
