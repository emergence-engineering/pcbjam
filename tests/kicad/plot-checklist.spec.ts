import { test, expect } from './fixtures';
import { clickMenuBarItem, clickByLabel } from '../e2e/utils/element-tracker';
import type { Page } from '@playwright/test';

// KiCad-level reproduction of the wxCheckListBox "check marks wiped on rebuild"
// bug (parity audit H-5), fixed in src/wasm/{listbox.h,checklst.{h,cpp}}.
//
// pcbnew's Plot dialog fills its layer list with the exact Append-then-Check
// pattern the bug breaks (pcbnew/dialogs/dialog_plot.cpp:351-354):
//
//     int checkIndex = m_layerCheckListBox->Append( board->GetLayerName( layer ) );
//     if( m_plotOpts.GetLayerSelection()[layer] )
//         m_layerCheckListBox->Check( checkIndex );
//
// A fresh board's default plot selection is
//   LSET{ F_SilkS, B_SilkS, F_Mask, B_Mask, F_Paste, B_Paste, Edge_Cuts } (+Cu),
// i.e. 7+ layers should be checked. With the DOM-port bug, every Append rebuilds
// the rows unchecked and only re-applies the listbox *selection*, never the
// *check* state — so all but the final Append's check are wiped and the dialog
// opens showing 0-1 checked layers.
//
//   RED  (bug present): <= 1 layer checkbox is checked in the Plot dialog.
//   GREEN (fixed):      the default plot layers (>= 2) are checked.

async function waitForPcbnew(page: Page): Promise<void> {
  await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });
  await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 90000 });
  await page.waitForFunction(
    () => {
      const r = window.wxElementRegistry;
      return !!r && r.findAll({}).length > 0;
    },
    null,
    { timeout: 150000 },
  );
  await page.waitForTimeout(2500);
  // dismiss the first-run setup wizard (Next > … Finish); no-op if absent
  for (let i = 0; i < 12; i++) {
    const advanced = await clickByLabel(page, 'Next >');
    if (!advanced) break;
    await page.waitForTimeout(400);
  }
  await clickByLabel(page, 'Finish');
  await page.waitForTimeout(800);
  await page.waitForFunction(
    () => {
      const r = window.wxElementRegistry;
      if (!r) return false;
      return r.findAll({ visible: true }).some((el) => el.name === 'PcbFrame');
    },
    null,
    { timeout: 90000 },
  );
  await page.waitForTimeout(1500);
}

// Open the File menu and click the menu item whose label matches `re`.
async function clickFileMenuItem(page: Page, re: RegExp): Promise<string[]> {
  expect(await clickMenuBarItem(page, 'File'), 'File menu should open').toBe(true);
  await page.waitForTimeout(600);
  const items = await page.evaluate(() => {
    const r = window.wxElementRegistry;
    const all = (r?.findAllRendered?.({}) ?? []) as any[];
    return all
      .filter((e) => e.elementType === 'menuitem')
      .map((e) => ({ label: e.label, x: e.centerX, y: e.centerY }));
  });
  const labels = items.map((i) => i.label);
  const target = items.find((i) => re.test(i.label));
  if (target) {
    await page.mouse.click(target.x, target.y);
  }
  return labels;
}

test.describe('pcbnew Plot dialog — wxCheckListBox check persistence (H-5)', () => {
  test('Plot dialog shows the default plot layers checked', async ({ page }) => {
    await page.goto('/kicad/pcbnew.html');
    await waitForPcbnew(page);

    const fileLabels = await clickFileMenuItem(page, /plot/i);
    console.log('[PLOT] File menu items: ' + JSON.stringify(fileLabels));

    // The Plot dialog's layer list is a wxCheckListBox -> a [data-wx-check-list]
    // div of checkbox rows in the DOM port.
    const boxes = page.locator('[data-wx-check-list] input[type=checkbox]');
    await expect
      .poll(() => boxes.count(), {
        timeout: 30000,
        message: 'Plot dialog layer checklist should render its rows',
      })
      .toBeGreaterThan(2);

    await page.screenshot({ path: 'test-results/plot-checklist.png', scale: 'device' });

    const checked = await page
      .locator('[data-wx-check-list] input[type=checkbox]:checked')
      .count();
    const total = await boxes.count();
    console.log(`[PLOT] checked ${checked} of ${total} layer rows`);

    // RED: <= 1 checked (only the last Append survived). GREEN: the default
    // plot layers (>= 2) are checked.
    expect(
      checked,
      `expected the default plot layers to be checked (got ${checked}/${total})`,
    ).toBeGreaterThanOrEqual(2);
  });
});
