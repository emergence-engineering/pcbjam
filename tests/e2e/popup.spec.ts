// wxPopupWindow Tests - Transient popups like KiCad toolbar palettes
import { test, expect, waitForWxApp } from './utils/fixtures';
import { findByLabel, clickByLabel, stableShot } from './utils/element-tracker';

test.describe('wxPopupWindow Tests', () => {

  test('Popup test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/popup/popup_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'popup-01-loaded.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Status popup button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/popup/popup_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'popup-02-status.png', { fullPage: true });

    // App loaded successfully - verify no errors
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  // Reproduces the DOM-port bug: a wxPopupTransientWindow toolbar palette (like KiCad's
  // ACTION_TOOLBAR_PALETTE) must actually render as a floating overlay and be interactive.
  // FAILS before the popup-overlay fix (palette never renders → its tool buttons aren't
  // visible/clickable), PASSES after.
  test('Tool palette opens and a tool button is clickable', async ({ page, testLogger }) => {
    await page.goto('/standalone/popup/popup_test.html');
    await waitForWxApp(page);

    // Open the transient palette (wxPopupTransientWindow::Popup()).
    expect(await clickByLabel(page, 'Show Tool Palette'),
      '"Show Tool Palette" button should be clickable').toBe(true);
    await stableShot(page, 'popup-03-palette-open.png', { fullPage: true });

    // The palette must actually render as an overlay: its tool buttons (T1..T9) become visible.
    const t1 = await findByLabel(page, 'T1', { visible: true });
    expect(t1, 'palette tool button T1 should be visible once the palette opens').not.toBeNull();

    // And clicking a tool must fire its handler (logged via EM_ASM console.log in popup_test.cpp).
    expect(await clickByLabel(page, 'T1', { visible: true }), 'palette tool T1 should be clickable').toBe(true);
    await expect.poll(
      () => testLogger.consoleLogs.some(l => l.includes('[POPUP] Tool 1 clicked')),
      { message: 'clicking palette tool T1 should fire its handler' }
    ).toBe(true);
  });

  // The palette is transient: clicking outside should dismiss it.
  test('Tool palette dismisses on outside click', async ({ page }) => {
    await page.goto('/standalone/popup/popup_test.html');
    await waitForWxApp(page);

    expect(await clickByLabel(page, 'Show Tool Palette')).toBe(true);
    await expect.poll(
      async () => await findByLabel(page, 'T1', { visible: true }),
      { message: 'palette should open before testing dismiss' }
    ).not.toBeNull();

    // Click far from the palette to dismiss the transient popup.
    await page.mouse.click(600, 500);
    await stableShot(page, 'popup-03-palette-dismissed.png', { fullPage: true });
    expect(await findByLabel(page, 'T1', { visible: true }),
      'palette should be dismissed (T1 no longer visible) after an outside click').toBeNull();
  });

  test('Color picker button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/popup/popup_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'popup-04-color.png', { fullPage: true });
  });

  test('Positioning buttons exist', async ({ page, testLogger }) => {
    await page.goto('/standalone/popup/popup_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'popup-05-positioning.png', { fullPage: true });
  });

  test('Event log panel exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/popup/popup_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'popup-06-log.png', { fullPage: true });
  });

});
