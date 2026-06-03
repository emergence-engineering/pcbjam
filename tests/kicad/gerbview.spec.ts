import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { clickByLabel } from '../e2e/utils/element-tracker';

/**
 * Gerber Viewer (gerbview) WASM E2E Tests
 *
 * gerbview is its own standalone kiface (FRAME_GERBER), launched via single_top
 * like pcbnew/pl_editor. It runs the same shared first-run setup wizard, so the
 * launch flow mirrors symbol_editor.spec.ts: wait for the canvas, click through the
 * wizard, then assert the viewer chrome built. Scope is launch-only — the viewer
 * must start, paint a canvas + toolbars (incl. the layers manager), populate the
 * element registry, and produce no WASM abort. Loading actual Gerber files is out
 * of scope here.
 */

async function completeWizard(page: Page): Promise<void> {
    await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });
    await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 90000 });
    // The frame builds its UI a beat after the registry object appears; wait for
    // the registry to actually have entries before driving it.
    await page.waitForFunction(() => {
        const registry = window.wxElementRegistry;
        return !!registry && registry.findAll({}).length > 0;
    }, null, { timeout: 90000 });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/gerbview-wizard-00-initial.png', scale: 'device' });

    for (let i = 1; i <= 10; i++) {
        let clicked = await clickByLabel(page, 'Next >');

        if (!clicked) {
            clicked = await clickByLabel(page, 'Finish');

            if (clicked) {
                await page.waitForTimeout(500);
                await page.screenshot({
                    path: `test-results/gerbview-wizard-${String(i).padStart(2, '0')}-finish.png`,
                    scale: 'device'
                });
            }

            break;
        }

        await page.waitForTimeout(500);
        await page.screenshot({
            path: `test-results/gerbview-wizard-${String(i).padStart(2, '0')}.png`,
            scale: 'device'
        });
    }

    await page.waitForTimeout(2000);
}

function hasAbort(testLogger: { consoleLogs: string[]; errors: string[] }): boolean {
    return [...testLogger.consoleLogs, ...testLogger.errors].some(line => line.includes('Aborted('));
}

test.describe('gerbview WASM', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/kicad/gerbview.html');
    });

    test('app loads, canvas visible, no WASM abort', async ({ page, testLogger }) => {
        await completeWizard(page);
        await page.screenshot({ path: 'test-results/gerbview-01-loaded.png', scale: 'device' });

        expect(hasAbort(testLogger), 'no WASM abort during load').toBe(false);

        const canvasCount = await page.locator('canvas').count();
        expect(canvasCount).toBeGreaterThan(0);
    });

    test('canvas + toolbar metrics look sane', async ({ page, testLogger }) => {
        await completeWizard(page);

        const metrics = await page.evaluate(() => {
            const registry = window.wxElementRegistry;
            const all = registry ? registry.findAll({ visible: true }) : [];
            const toolbars = all.filter((el: { typeName: string }) => /ToolBar/.test(el.typeName));
            const glCanvas = document.querySelector('canvas[id^="glcanvas-"]') as HTMLCanvasElement | null;

            return {
                registryTotal: all.length,
                toolbarCount: toolbars.length,
                mainCanvasOk: (() => {
                    const c = document.getElementById('canvas') as HTMLCanvasElement | null;
                    return !!c && c.width > 0 && c.height > 0;
                })(),
                glCanvasOk: !!glCanvas && glCanvas.width > 0 && glCanvas.height > 0,
            };
        });

        await page.screenshot({ path: 'test-results/gerbview-02-metrics.png', scale: 'device' });

        expect(metrics.registryTotal, 'registry should be populated').toBeGreaterThan(10);
        expect(metrics.toolbarCount, 'at least one toolbar should be visible').toBeGreaterThanOrEqual(1);
        expect(metrics.mainCanvasOk, 'main canvas has nonzero dimensions').toBe(true);
        expect(metrics.glCanvasOk, 'GL canvas has nonzero dimensions').toBe(true);
        expect(hasAbort(testLogger)).toBe(false);
    });
});
