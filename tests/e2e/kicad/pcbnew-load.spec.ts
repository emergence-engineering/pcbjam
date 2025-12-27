import { test, expect } from '../utils/fixtures';

test.describe('KiCad PCBnew WASM', () => {

  test('WASM runtime initializes', async ({ page, testLogger }) => {
    // Navigate to KiCad app
    await page.goto('/kicad/pcbnew.html');

    // Wait for runtime initialization (longer timeout for KiCad - 15MB WASM)
    await page.waitForFunction(() => {
      return (document.querySelector('#canvas') as HTMLElement)?.style.display === 'block';
    }, { timeout: 120000 }); // 2 min timeout for large WASM

    // Verify canvas is visible
    const canvas = page.locator('#canvas');
    await expect(canvas).toBeVisible();

    // Check for successful initialization logs
    const initLog = testLogger.consoleLogs.find(l =>
      l.includes('[KICAD] Runtime initialized')
    );
    expect(initLog).toBeTruthy();

    // Check that app started creating
    const appLog = testLogger.consoleLogs.find(l =>
      l.includes('[KICAD_OUT] Creating app')
    );
    expect(appLog).toBeTruthy();

    // Take screenshot of initial state
    await page.screenshot({
      path: 'test-results/kicad-pcbnew-01-initial.png',
      fullPage: true
    });

    // Log any errors for debugging (but don't fail on WASM exceptions yet)
    const errors = testLogger.errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('SharedArrayBuffer')
    );

    if (errors.length > 0) {
      console.log('Errors during initialization:', errors);
    }

    // For now, we expect initialization errors due to incomplete port
    // The test passes if runtime initializes - we track errors for debugging
  });

  test('canvas is properly sized', async ({ page }) => {
    await page.goto('/kicad/pcbnew.html');

    // Wait for load
    await page.waitForFunction(() => {
      return (document.querySelector('#canvas') as HTMLElement)?.style.display === 'block';
    }, { timeout: 120000 });

    // Wait for initial render
    await page.waitForTimeout(2000);

    // Get canvas and verify it's sized properly
    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);

    // Screenshot for visual inspection
    await page.screenshot({
      path: 'test-results/kicad-pcbnew-02-rendered.png',
      fullPage: true
    });
  });

  // This test documents the current state - expect to fail until port is complete
  test.skip('loads without errors', async ({ page, testLogger }) => {
    await page.goto('/kicad/pcbnew.html');

    await page.waitForFunction(() => {
      return (document.querySelector('#canvas') as HTMLElement)?.style.display === 'block';
    }, { timeout: 120000 });

    await page.waitForTimeout(2000);

    // Check for errors
    const errors = testLogger.errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('SharedArrayBuffer')
    );

    // This will fail until KiCad WASM port is complete
    // Current known issue: WASM exception during wxWidgets initialization
    expect(errors).toHaveLength(0);
  });

});
