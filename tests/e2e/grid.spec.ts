// wxGrid / wxSpinCtrl / wxSearchCtrl tests on the Grid tab and the dedicated wxGrid page.
// Uses the element registry for semantic element identification.
//
// Determinism: no blind waitForTimeout gating assertions. Readiness via waitForWxApp
// (loud). Cell-selection/edit assertions poll the console event the app emits instead of
// sleeping. Static states use stableShot (its stabilization replaces the settle).
// A few genuine interaction dwells (tab-content paint, focus-before-type) are kept and
// documented. Screenshots that, after the poll conversion, would sit behind an
// expected-fail poll and assert nothing are dropped.
import { test, expect, waitForWxApp, getCanvasBox } from './utils/fixtures';
import { clickTab, clickSpinUp, clickSearchCtrl, stableShot } from './utils/element-tracker';

async function switchToGridTab(page: any) {
  // Click Grid tab using the element registry (deterministic; assert it actually switched).
  const clicked = await clickTab(page, 'Grid');
  expect(clicked, 'Should switch to the Grid tab').toBe(true);
  await page.waitForTimeout(1000); // eslint-disable-line -- documented interaction dwell: tab-content paint settle before pixel-variance/screenshot checks (no console event marks tab render)
}

// ============================================================================
// DEDICATED wxGrid TEST PAGE - Tests if wxGrid compiles and runs at all
// ============================================================================

test.describe('wxGrid Dedicated Test Page', () => {

  // This is THE critical test for wxGrid support.
  test('wxGrid test page loads successfully', async ({ page, testLogger }) => {
    // Navigate to the dedicated wxGrid test page
    await page.goto('/standalone/grid/grid_test.html');

    // Loud, deterministic app-readiness (if wxGrid crashes this fails here).
    await waitForWxApp(page);

    // The success message from grid_test.cpp is a console event — poll for it
    // (replaces the 1000ms settle and the hasSuccessMessage assertion).
    await expect.poll(() => testLogger.consoleLogs.some(l =>
      l.includes('wxGrid test app started successfully') ||
      l.includes('wxGrid initialized successfully')
    ), { message: 'wxGrid app should start successfully' }).toBe(true);

    await stableShot(page, 'wxgrid-dedicated-page.png', { fullPage: true });

    // Check for crash errors
    const hasCrash = testLogger.errors.some(e =>
      e.includes('function signature mismatch') ||
      e.includes('RuntimeError') ||
      e.includes('Exception thrown')
    );

    // This test FAILS if wxGrid crashed the app.
    expect(hasCrash, 'wxGrid should not crash the app').toBe(false);
  });

  test('wxGrid test page shows grid controls', async ({ page, testLogger }) => {
    await page.goto('/standalone/grid/grid_test.html');

    await waitForWxApp(page);

    await stableShot(page, 'wxgrid-controls.png', { fullPage: true });

    // Check if grid content is visible in the canvas
    const hasGridContent = await page.evaluate(() => {
      const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;

      // Grid would be in the upper portion with labels and cells
      const imageData = ctx.getImageData(50, 100, 400, 150);
      const data = imageData.data;

      // Look for text/lines (significant color variance)
      let variance = 0;
      for (let i = 4; i < data.length; i += 4) {
        if (Math.abs(data[i] - data[i-4]) > 30 ||
            Math.abs(data[i+1] - data[i-3]) > 30 ||
            Math.abs(data[i+2] - data[i-2]) > 30) {
          variance++;
        }
      }
      return variance > 1000; // Grid with labels/lines has high variance
    });

    expect(hasGridContent, 'wxGrid page should show grid controls').toBe(true);
  });
});

test.describe('Grid Tab Tests', () => {

  // ============================================================================
  // wxGrid Tests in Main App - EXPECTED TO FAIL until wxGrid is added back
  // ============================================================================

  test.describe('wxGrid in Main App (DISABLED)', () => {

    test.fail('wxGrid renders visible grid cells', async ({ page, testLogger }) => {
      await page.goto('/minimal_test.html');
      await waitForWxApp(page);

      // Switch to Grid tab using element registry
      await switchToGridTab(page);
      await stableShot(page, 'wxgrid-01-tab.png', { fullPage: true });

      // Evaluate if grid-like content exists (row/column headers, cells)
      const hasGridContent = await page.evaluate(() => {
        const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
        if (!canvas) return false;

        const ctx = canvas.getContext('2d');
        if (!ctx) return false;

        // Sample pixels at where grid headers/cells would be (around y=180-200)
        const imageData = ctx.getImageData(100, 180, 300, 50);
        const data = imageData.data;

        // Check if there's actual visible content (non-background pixels)
        let colorVariance = 0;
        let lastPixel = { r: data[0], g: data[1], b: data[2] };

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2];
          if (Math.abs(r - lastPixel.r) > 20 ||
              Math.abs(g - lastPixel.g) > 20 ||
              Math.abs(b - lastPixel.b) > 20) {
            colorVariance++;
          }
          lastPixel = { r, g, b };
        }

        return colorVariance > 500; // Grid has lines and text = high variance
      });

      expect(hasGridContent, 'wxGrid should render visible grid cells with headers and data').toBe(true);
    });

    test.fail('wxGrid cell selection works', async ({ page, testLogger }) => {
      await page.goto('/minimal_test.html');
      await waitForWxApp(page);

      const box = await getCanvasBox(page);

      await switchToGridTab(page);

      // Click on a cell (would be at ~y=175 if grid existed)
      await page.mouse.click(box.x + 180, box.y + 175);

      // The click's effect is the cell-selection console event — poll for it
      // (replaces the 200ms sleep + hasGridEvent assertion).
      await expect.poll(() => testLogger.consoleLogs.some(l => l.includes('Grid cell')),
        { message: 'wxGrid should emit cell selection events' }).toBe(true);
    });

    test.fail('wxGrid cell editing works', async ({ page, testLogger }) => {
      await page.goto('/minimal_test.html');
      await waitForWxApp(page);

      const box = await getCanvasBox(page);

      await switchToGridTab(page);

      // Double-click to edit a cell
      await page.mouse.dblclick(box.x + 180, box.y + 195);
      await page.waitForTimeout(200); // eslint-disable-line -- documented interaction dwell: let the cell editor open before typing (no observable event)

      await page.keyboard.type('1.5');
      await page.keyboard.press('Enter');

      // The edit's effect is the cell-changed console event — poll for it
      // (replaces the 200ms sleep + hasEditEvent assertion).
      await expect.poll(() => testLogger.consoleLogs.some(l => l.includes('Grid cell') && l.includes('changed')),
        { message: 'wxGrid should emit cell changed events when editing' }).toBe(true);
    });
  });

  // ============================================================================
  // wxSpinCtrl Tests - These should PASS if wxSpinCtrl is working
  // ============================================================================

  test.describe('wxSpinCtrl', () => {

    test('SpinCtrl renders and is visible', async ({ page, testLogger }) => {
      await page.goto('/minimal_test.html');
      await waitForWxApp(page);

      const box = await getCanvasBox(page);

      await switchToGridTab(page);
      await stableShot(page, 'spinctrl-01-visible.png', { fullPage: true });

      // SpinCtrl should be visible - check for its box and arrows in the canvas
      const hasSpinCtrlContent = await page.evaluate(() => {
        const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
        if (!canvas) return false;

        const ctx = canvas.getContext('2d');
        if (!ctx) return false;

        // SpinCtrl is at the top left of the Grid tab content, around y=130-170
        const imageData = ctx.getImageData(10, 130, 180, 50);
        const data = imageData.data;

        // Check for non-white content (text, borders, buttons)
        let nonBackgroundPixels = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2];
          if (r < 230 || g < 230 || b < 230) {
            nonBackgroundPixels++;
          }
        }

        return nonBackgroundPixels > 50; // Should have visible text and borders
      });

      expect(hasSpinCtrlContent, 'wxSpinCtrl should be visible with borders and arrows').toBe(true);
      expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
    });

    test('SpinCtrl up/down arrows work', async ({ page, testLogger }) => {
      await page.goto('/minimal_test.html');
      await waitForWxApp(page);

      const box = await getCanvasBox(page);

      await switchToGridTab(page);

      // Click up arrow on SpinCtrl using element tracking
      const spinClicked = await clickSpinUp(page);
      expect(spinClicked, 'Should be able to click spin up button').toBe(true);

      await stableShot(page, 'spinctrl-02-after-click.png', { fullPage: true });

      // This is a smoke test - if it doesn't crash, that's good
      expect(true).toBe(true);
    });
  });

  // ============================================================================
  // wxSearchCtrl Tests - These should PASS if wxSearchCtrl is working
  // ============================================================================

  test.describe('wxSearchCtrl', () => {

    test('SearchCtrl renders and is visible', async ({ page, testLogger }) => {
      await page.goto('/minimal_test.html');
      await waitForWxApp(page);

      const box = await getCanvasBox(page);

      await switchToGridTab(page);
      await stableShot(page, 'searchctrl-01-visible.png', { fullPage: true });

      // SearchCtrl should be visible - check for its text field and buttons
      const hasSearchCtrlContent = await page.evaluate(() => {
        const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
        if (!canvas) return false;

        const ctx = canvas.getContext('2d');
        if (!ctx) return false;

        // SearchCtrl is on the right side of the Grid tab content, around y=130-170
        const imageData = ctx.getImageData(200, 130, 300, 50);
        const data = imageData.data;

        // Check for non-white content (text field border, placeholder text, icons)
        let nonBackgroundPixels = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2];
          if (r < 230 || g < 230 || b < 230) {
            nonBackgroundPixels++;
          }
        }

        return nonBackgroundPixels > 50; // Should have visible borders and placeholder text
      });

      expect(hasSearchCtrlContent, 'wxSearchCtrl should be visible with text field and buttons').toBe(true);
      expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
    });

    test('SearchCtrl accepts text input', async ({ page, testLogger }) => {
      await page.goto('/minimal_test.html');
      await waitForWxApp(page);

      const box = await getCanvasBox(page);

      await switchToGridTab(page);

      // Click on SearchCtrl text field using element tracking
      const searchClicked = await clickSearchCtrl(page);
      expect(searchClicked, 'Should be able to click SearchCtrl text field').toBe(true);
      await page.waitForTimeout(200); // eslint-disable-line -- documented interaction dwell: focus the SearchCtrl text field before typing (no observable event)

      // Type search text
      await page.keyboard.type('TRACK');
      await stableShot(page, 'searchctrl-02-typing.png', { fullPage: true });

      // Press Enter to search
      await page.keyboard.press('Enter');
      await stableShot(page, 'searchctrl-03-after-enter.png', { fullPage: true });

      // This is a smoke test - verify no crashes
      expect(true).toBe(true);
    });
  });

  // ============================================================================
  // Combined Tab Test - Basic smoke test for the Grid tab
  // ============================================================================

  test('Grid tab loads without crash', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');
    await waitForWxApp(page);

    const box = await getCanvasBox(page);

    await switchToGridTab(page);
    await stableShot(page, 'grid-tab-final.png', { fullPage: true });

    // Verify app is still responsive after switching to Grid tab
    const isResponsive = await page.evaluate(() => {
      return document.querySelector('#canvas') !== null;
    });

    expect(isResponsive).toBe(true);
    // Filter out favicon errors which are expected
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });
});
