// wxNotebook page-relayout e2e — regression coverage for the DOM-port fix in
// wxwidgets/src/wasm/notebook.cpp (wxNotebook::WasmRelayoutSelectedPage).
//
// The "Scrolled" page wraps a wxScrolledWindow full of "Row N" labels, and the
// app's wxEVT_NOTEBOOK_PAGE_CHANGED handler calls page->Fit() exactly like
// KiCad's APPEARANCE_CONTROLS. Without the fix that collapses the scrolled
// viewport and clip-paths the rows away after a tab round-trip; with it,
// OnDomEvent re-asserts the geometry so the rows stay painted.
import { test, expect } from './utils/fixtures';
import { clickTab, waitForWxApp, stableShot } from './utils/element-tracker';
import type { Page } from '@playwright/test';

declare global {
  interface Window {
    wxDomControls?: Map<number, HTMLElement>;
  }
}

// Whether each row label is genuinely PAINTED (not merely present in the DOM).
// A bare getBoundingClientRect is not enough: when the scrolled window collapses
// on a tab round-trip the rows keep their layout box but are removed by an
// ancestor's clip-path. clip-path also affects hit-testing, so we sample points
// down each row's box and treat it as visible only if the row (or its content)
// is actually returned by elementsFromPoint. This is what makes the collapse
// regression fail the assertion. (Mirrors kicad/appearance.spec.ts:rowsVisible.)
async function rowsVisible(page: Page, labels: string[]): Promise<Record<string, boolean>> {
  return page.evaluate((wanted: string[]) => {
    const out: Record<string, boolean> = {};
    for (const w of wanted) out[w] = false;
    if (!window.wxDomControls) return out;
    const visible = (el: HTMLElement): boolean => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const cx = r.left + r.width / 2;
      const ys = [r.top + 1, r.top + r.height / 2, r.bottom - 1];
      return ys.some((y) => {
        const hits = document.elementsFromPoint(cx, y);
        return hits.some((h) => h === el || el.contains(h));
      });
    };
    for (const [, el] of window.wxDomControls) {
      const txt = el.textContent || '';
      if (el.tagName === 'SPAN' && wanted.includes(txt) && visible(el)) out[txt] = true;
    }
    return out;
  }, labels);
}

test.describe('DOM-port wxNotebook page relayout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/standalone/notebook/notebook_test.html');
    await waitForWxApp(page);
  });

  test('scrolled page rows survive a tab round-trip', async ({ page, testLogger }) => {
    // First visit to the scrolled page: rows must be painted.
    expect(await clickTab(page, 'Scrolled'), 'switch to Scrolled').toBe(true);
    await stableShot(page, 'notebook-01-scrolled.png', { fullPage: true });

    let vis = await rowsVisible(page, ['Row 0', 'Row 1']);
    expect(vis['Row 0'], 'Row 0 visible on first visit').toBe(true);

    // Round-trip: away to Plain, then back to Scrolled. The PAGE_CHANGED Fit()
    // collapses the scrolled child; WasmRelayoutSelectedPage must restore it.
    expect(await clickTab(page, 'Plain'), 'switch to Plain').toBe(true);
    await page.waitForTimeout(300); // eslint-disable-line -- documented interaction dwell: let the Plain PAGE_CHANGED relayout commit before switching back
    expect(await clickTab(page, 'Scrolled'), 'switch back to Scrolled').toBe(true);
    await stableShot(page, 'notebook-02-scrolled-again.png', { fullPage: true });

    vis = await rowsVisible(page, ['Row 0', 'Row 1']);
    expect(vis['Row 0'], 'Row 0 visible after tab round-trip').toBe(true);
    expect(vis['Row 1'], 'Row 1 visible after tab round-trip').toBe(true);

    expect(testLogger.errors.filter((e) => !e.includes('favicon'))).toHaveLength(0);
  });
});
