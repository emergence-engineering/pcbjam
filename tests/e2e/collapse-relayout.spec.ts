// collapse-relayout — regression test for the pcbnew "Layer Display Options" bug.
//
// The Layers notebook page holds a proportion-1 scrolled layer list above a
// collapsible "Layer Display Options" pane. Toggling the pane runs KiCad's
// `Freeze(); page->Fit(); outerSizer->Layout(); Thaw();` idiom, which in the
// WASM DOM port permanently collapses the layer list (it stays at height 0,
// rows clip-pathed away, until reload). See wxNotebook::WasmRelayoutSelectedPage
// / wxWindowWasm::DoSetSize in the wxwidgets wasm port.
//
// A plain wxScrolledWindow is not in the JS element registry (its Create() runs
// during base construction and is skipped as a base type), so the app reports
// the layer-list height directly from C++ via console.log; the test asserts on
// those. It is RED before the wasm-layer fix and GREEN after.
import { test, expect } from './utils/fixtures';
import { findByType, waitForWxApp, stableShot } from './utils/element-tracker';

const APP = '/standalone/collapse-relayout/collapse-relayout_test.html';
const HEADER_LABEL = 'Layer Display Options';

// Parse "[COLLAPSE_RELAYOUT] <tag> = N" from the console logs (-1 if absent).
function reportedHeight(logs: string[], tag: string): number {
  const line = logs.find(l => l.includes(tag));
  const m = line?.match(/=\s*(\d+)/);
  return m ? parseInt(m[1], 10) : -1;
}

// Expand the collapsible "Layer Display Options" pane. Its header
// (wxGenericCollapsibleHeaderCtrl) is not in the label registry, so — as the original did
// via its findByType fallback — find the wxGenericCollapsiblePane by type and click its
// header row (top-left). Deterministically wait for the pane to render first.
async function expandPane(page: import('@playwright/test').Page): Promise<boolean> {
  let panes: Awaited<ReturnType<typeof findByType>> = [];
  await expect
    .poll(async () => {
      panes = await findByType(page, 'wxGenericCollapsiblePane');
      return panes.length;
    }, { message: `"${HEADER_LABEL}" collapsible pane should be rendered` })
    .toBeGreaterThan(0);
  await page.mouse.click(panes[0].screenX + 15, panes[0].screenY + 10);
  return true;
}

test.describe('collapse-relayout (Layer Display Options bug)', () => {

  test('app loads with a populated layer list', async ({ page, testLogger }) => {
    await page.goto(APP);
    await waitForWxApp(page);

    await expect
      .poll(() => testLogger.consoleLogs.some(l => l.includes('[COLLAPSE_RELAYOUT] app started')), {
        message: 'app-started log should be present',
      })
      .toBe(true);
    await expect
      .poll(() => reportedHeight(testLogger.consoleLogs, 'initial layerlist height') > -1, {
        message: 'initial layerlist height should be reported',
      })
      .toBe(true);

    await stableShot(page, 'collapse-relayout-01-loaded.png', { fullPage: true });

    const initial = reportedHeight(testLogger.consoleLogs, 'initial layerlist height');
    console.log('initial layerlist height =', initial);
    expect(initial, 'layer list should start with a real height').toBeGreaterThan(100);

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('layer list survives expanding "Layer Display Options"', async ({ page, testLogger }) => {
    await page.goto(APP);
    await waitForWxApp(page);

    await expect
      .poll(() => reportedHeight(testLogger.consoleLogs, 'initial layerlist height') > -1, {
        message: 'initial layerlist height should be reported',
      })
      .toBe(true);
    const initial = reportedHeight(testLogger.consoleLogs, 'initial layerlist height');
    expect(initial, 'layer list should start with a real height').toBeGreaterThan(100);

    const clicked = await expandPane(page);
    expect(clicked, `"${HEADER_LABEL}" pane header should be found and clicked`).toBe(true);

    // The handler only logs on a real toggle — its presence proves the click
    // reached the pane, and N is the list height measured right after relayout.
    await expect
      .poll(() => reportedHeight(testLogger.consoleLogs, 'layerlist height after toggle') > -1, {
        message: 'pane toggle handler should have run',
      })
      .toBe(true);

    await stableShot(page, 'collapse-relayout-02-expanded.png', { fullPage: true });

    const afterToggle = reportedHeight(testLogger.consoleLogs, 'layerlist height after toggle');
    console.log('layerlist height after toggle =', afterToggle);

    // Core assertion: the list must NOT have collapsed to ~0.
    expect(afterToggle, 'layer list height after expanding the pane').toBeGreaterThan(50);
  });

});
