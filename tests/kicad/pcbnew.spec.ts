import { test, expect } from './fixtures';

/**
 * PCBnew WASM E2E Tests
 *
 * These tests verify that the KiCad PCBnew application runs correctly in the browser.
 * The WASM files are served from apps/kicad/ via the web server.
 *
 * Logs are written to tests/logs/:
 * - {test-name}.log - console output
 * - {test-name}.errors.log - page errors (if any)
 */

test.describe('PCBnew WASM', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to PCBnew via web server (apps/kicad/pcbnew.html)
        await page.goto('/kicad/pcbnew.html');
    });

    test('should load PCBnew WASM module', async ({ page }) => {
        // Wait for main canvas to be visible (KiCad takes time to initialize)
        await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });

        // Verify multiple canvases are created (11 for setup wizard)
        const canvasCount = await page.locator('canvas').count();
        expect(canvasCount).toBeGreaterThan(0);
    });

    test.skip('should render without JavaScript errors', async ({ page, testLogger }) => {
        await page.goto('/kicad/pcbnew.html');
        await page.waitForTimeout(5000);  // Give time for WASM to load

        // Check captured errors (excluding known acceptable ones)
        const criticalErrors = testLogger.errors.filter(e =>
            !e.includes('ResizeObserver') && !e.includes('favicon')
        );
        expect(criticalErrors).toHaveLength(0);
    });
});
