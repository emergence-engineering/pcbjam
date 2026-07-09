import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { clickByLabel, findRenderedByType } from '../e2e/utils/element-tracker';

// KiCad-level reproduction of the wxWidgets DOM-port "context menu goes stale"
// bug (parity audit H-8) — the right-click sibling of H-7. Fixed in
// wxwidgets/src/wasm/window.cpp (DoPopupMenu).
//
// Native behavior: right-click menus fire wxEVT_MENU_OPEN just before showing,
// so KiCad refreshes them just-in-time. For the pcbnew *selection* menu this is
// masked — TOOL_MENU::ShowContextMenu(SELECTION&) already runs Evaluate() +
// UpdateAll() in C++ before the popup (tool_menu.cpp:57). But the no-arg
// TOOL_MENU::ShowContextMenu() overload (tool_menu.cpp:66) only marks the menu
// dirty and shows it — it relies ENTIRELY on wxEVT_MENU_OPEN → updateMenu to
// Evaluate the CONDITIONAL_MENU. The pcbnew Measure tool uses that overload
// (pcb_viewer_tools.cpp:441).
//
// In the WASM/DOM port DoPopupMenu never fired wxEVT_MENU_OPEN, so the cloned
// CONDITIONAL_MENU was never Evaluated → ZERO items materialized → the measure
// tool's right-click menu came up EMPTY. The selection menu (pre-Evaluated in
// C++) stayed populated, which is why this survived undetected.
//
//   RED  (bug present): measure-tool right-click menu has 0 items (empty popup).
//   GREEN (fixed):      it is populated (contains the Zoom + Grid submenus).
//
// The selection-tool menu is used as an in-test CONTROL: it is populated in
// BOTH builds (its C++ pre-Evaluate path is unaffected), proving the popup
// pipeline works and isolating the failure to the no-arg / wxEVT_MENU_OPEN path.

async function waitForEditor(page: Page): Promise<void> {
  await expect(page.locator('#canvas')).toBeVisible({ timeout: 120000 });
  await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 120000 });
  await page.waitForTimeout(2000);
  // Dismiss the first-run setup wizard (pcbnew shows one).
  for (let i = 0; i < 12; i++) {
    const next = await clickByLabel(page, 'Next >');
    if (!next) {
      await clickByLabel(page, 'Finish');
      break;
    }
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(2000);
}

async function getGlBox(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const id = await page.evaluate(() => {
    const visible = Array.from(document.querySelectorAll('[id^="glcanvas-"]'))
      .map((c) => c as HTMLCanvasElement)
      .find((c) => {
        const rect = c.getBoundingClientRect();
        return window.getComputedStyle(c).display !== 'none' && rect.width > 0 && rect.height > 0;
      });
    return (visible ?? (document.querySelector('[id^="glcanvas-"]') as HTMLCanvasElement | null))?.id ?? null;
  });
  if (!id) throw new Error('No visible GL canvas found');
  const box = await page.locator(`#${id}`).boundingBox();
  if (!box) throw new Error('GL canvas bounding box unavailable');
  return box;
}

// Labels of the items in the currently-open DOM context-menu popup.
async function popupLabels(page: Page): Promise<string[]> {
  const items = await findRenderedByType(page, 'menuitem', { parentId: 'popupmenu' });
  return items.map((i) => i.label);
}

async function dismissPopup(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await popupLabels(page)).length, {
      timeout: 5000,
      message: 'popup should dismiss on Escape',
    })
    .toBe(0);
}

test.describe('pcbnew: context menus refresh on open (H-8)', () => {
  test.describe.configure({ timeout: 240000 });

  test('the measure-tool right-click menu is populated (wxEVT_MENU_OPEN fires)', async ({
    page,
    testLogger,
  }) => {
    await page.goto('/kicad/pcbnew.html');
    await waitForEditor(page);

    const box = await getGlBox(page);
    const x = Math.round(box.x + box.width * 0.5);
    const y = Math.round(box.y + box.height * 0.5);

    // --- CONTROL: selection-tool menu (pre-Evaluated in C++ before popup). It
    // is populated in RED and GREEN alike — proves the popup pipeline works. ---
    await page.mouse.click(x, y); // activate the selection tool
    await page.waitForTimeout(400);
    await page.mouse.click(x, y, { button: 'right' });
    await expect
      .poll(async () => (await popupLabels(page)).length, {
        timeout: 15000,
        message: 'control: the selection-tool context menu should be populated',
      })
      .toBeGreaterThan(0);
    const selLabels = await popupLabels(page);
    console.log(`[H8] selection-tool menu (${selLabels.length}): ${JSON.stringify(selLabels)}`);
    expect(selLabels, `selection menu items: ${JSON.stringify(selLabels)}`).toEqual(
      expect.arrayContaining(['Zoom', 'Grid']),
    );
    await dismissPopup(page);
    await page.screenshot({ path: 'test-results/pcbnew-h8-00-selection-menu.png', fullPage: true });

    // --- SIGNAL: Measure tool menu — the no-arg ShowContextMenu() path that
    // depends on wxEVT_MENU_OPEN. Activate Measure (Ctrl+Shift+M), right-click. ---
    await page.mouse.move(x, y);
    await page.mouse.click(x, y); // ensure the GAL canvas has keyboard focus
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+Shift+KeyM'); // ACTIONS::measureTool
    await page.waitForTimeout(900);
    await page.mouse.move(x, y);
    await page.mouse.click(x, y, { button: 'right' });

    // Read the popup: GREEN populates quickly; RED stays empty. Poll so a slow
    // GREEN render is not mistaken for RED, but bail out after the deadline so
    // an actually-empty (RED) popup reports fast.
    let measLabels: string[] = [];
    const deadline = Date.now() + 12000;
    do {
      measLabels = await popupLabels(page);
      if (measLabels.length > 0) break;
      await page.waitForTimeout(500);
    } while (Date.now() < deadline);
    console.log(`[H8] measure-tool menu (${measLabels.length}): ${JSON.stringify(measLabels)}`);
    await page.screenshot({ path: 'test-results/pcbnew-h8-01-measure-menu.png', fullPage: true });

    const aborted = [...testLogger.consoleLogs, ...testLogger.errors].some((l) =>
      l.includes('Aborted('),
    );
    expect(aborted, 'WASM module should not abort').toBe(false);

    // RED trap: without wxEVT_MENU_OPEN the CONDITIONAL_MENU clone is never
    // Evaluated, so the measure-tool popup materializes 0 items.
    expect(
      measLabels.length,
      `measure-tool right-click menu must be populated — an empty menu means ` +
        `wxEVT_MENU_OPEN was not fired on open. items=${JSON.stringify(measLabels)}`,
    ).toBeGreaterThan(0);
    expect(measLabels, `measure menu items: ${JSON.stringify(measLabels)}`).toEqual(
      expect.arrayContaining(['Zoom', 'Grid']),
    );

    await dismissPopup(page);
  });
});
