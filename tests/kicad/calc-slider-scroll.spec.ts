import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { clickByLabel, clickTreeItem } from '../e2e/utils/element-tracker';

// KiCad-level reproduction of the wxWidgets DOM-port "wxSlider fires only
// wxEVT_SLIDER, never the wxEVT_SCROLL_* family" bug (parity audit H-6), fixed
// in wxwidgets/src/wasm/slider.cpp.
//
// Native wxSlider fires the wxEVT_SCROLL_* family (THUMBTRACK/CHANGED/…) in
// addition to the wxEVT_SLIDER command event. The unfixed DOM port fired only
// wxEVT_SLIDER, so handlers bound EXCLUSIVELY to the scroll family never run.
//
// Surface: the PCB Calculator's "Cable Size" panel. Its current-density slider
// m_slCurrentDensity is connected ONLY to wxEVT_SCROLL_* → onUpdateCurrentDensity
// (panel_cable_size_base.cpp:283-286), whose body recomputes the output text
// fields (Ampacity etc.): `m_amp_by_mm2 = m_slCurrentDensity->GetValue(); updateAll(...)`
// (panel_cable_size.cpp:199-204). The effect is a readable <input> value change,
// not a canvas repaint — so it is deterministically assertable (unlike the
// colour picker, which does not open in WASM, and the Appearance opacity
// sliders, whose effect is canvas-pixel only).
//
//   RED  (bug present): moving the current-density slider fires no scroll event,
//                       so onUpdateCurrentDensity never runs and NO output field
//                       changes.
//   GREEN (fixed):      moving the slider recomputes Ampacity (and derived
//                       fields) → at least one output <input> value changes.

async function waitForRegistry(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 90000 });
  await page.waitForTimeout(2000);
}

async function waitForLabel(page: Page, label: string, timeoutMs: number): Promise<boolean> {
  try {
    await page.waitForFunction(
      (l) => {
        const r = window.wxElementRegistry;
        return !!(r && r.findByLabel && r.findByLabel(l, {}).length > 0);
      },
      label,
      { timeout: timeoutMs },
    );
    return true;
  } catch {
    return false;
  }
}

// Same first-run wizard dismissal as calculator.spec.ts.
async function completeFirstRunWizard(page: Page): Promise<void> {
  await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });
  await waitForRegistry(page);
  for (let i = 1; i <= 12; i++) {
    if (await waitForLabel(page, 'Next >', 15000)) {
      if (await clickByLabel(page, 'Next >')) {
        await page.waitForTimeout(400);
        continue;
      }
    }
    if (await waitForLabel(page, 'Finish', 5000)) {
      await clickByLabel(page, 'Finish');
      await page.waitForTimeout(400);
    }
    break;
  }
  await page.waitForTimeout(2500);
}

// Values of every editable text <input> currently in the document (excludes the
// range slider itself and checkboxes/radios). Between two snapshots only the
// slider is moved, so any difference is attributable to it.
async function textInputValues(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll('input:not([type=range]):not([type=checkbox]):not([type=radio])'),
    ).map((el) => (el as HTMLInputElement).value),
  );
}

test.describe('PCB Calculator Cable Size — wxSlider scroll-event family (H-6)', () => {
  test.describe.configure({ timeout: 180000 });

  test('moving the current-density slider recomputes an output field', async ({ page, testLogger }) => {
    await page.goto('/kicad/calculator.html');
    await completeFirstRunWizard(page);

    expect(await clickTreeItem(page, 'Cable Size'), 'Cable Size panel should be selectable').toBe(true);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'test-results/calc-slider-00-panel.png', scale: 'device' });

    // The current-density slider is the only wxSlider (<input type=range>) on
    // the panel; default value 3, range 3..12.
    const slider = page.locator('input[type=range]').first();
    await expect(slider).toBeVisible({ timeout: 15000 });

    const before = await textInputValues(page);
    console.log(`[H6] output values before: ${JSON.stringify(before)}`);

    // Drive it to the far end and fire the DOM input/change events the port
    // translates into the wxSlider event(s).
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = '12';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(1200);

    const after = await textInputValues(page);
    console.log(`[H6] output values after: ${JSON.stringify(after)}`);
    await page.screenshot({ path: 'test-results/calc-slider-01-moved.png', scale: 'device' });

    const aborted = [...testLogger.consoleLogs, ...testLogger.errors].some((l) =>
      l.includes('Aborted('),
    );
    expect(aborted, 'WASM module should not abort').toBe(false);

    // Precondition: the slider is wired and the field set is stable.
    expect(before.length, 'the panel should expose output text fields').toBeGreaterThan(0);
    expect(after.length, 'the field set should be stable across the move').toBe(before.length);

    // RED: no output changed (scroll event never fired). GREEN: Ampacity et al.
    // recomputed.
    const changedCount = before.filter((v, i) => v !== after[i]).length;
    console.log(`[H6] output fields changed by the slider move: ${changedCount}`);
    expect(
      changedCount,
      'moving the current-density slider must recompute at least one output field',
    ).toBeGreaterThan(0);
  });
});
