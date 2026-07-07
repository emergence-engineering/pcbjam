import { test, expect } from './fixtures';
import { waitForEditorReady, stableShot } from '../e2e/utils/element-tracker';

/**
 * Symbol Editor WASM E2E Tests
 *
 * The symbol editor (FRAME_SCH_SYMBOL_EDITOR) is served by the eeschema kiface;
 * the standalone `symbol_editor` launcher opens that frame directly. symbol_editor.html
 * seeds a default KiCad config in preRun, so the shared first-run setup wizard never
 * opens — the editor comes straight up. Scope is launch-only: the editor must start,
 * paint a canvas + toolbars, populate the element registry, and produce no WASM abort.
 *
 * Determinism: no waitForTimeout, no wizard click-through loop, screenshots via
 * stableShot (stabilizes before comparing).
 */

function hasAbort(testLogger: { consoleLogs: string[]; errors: string[] }): boolean {
    return [...testLogger.consoleLogs, ...testLogger.errors].some(line => line.includes('Aborted('));
}

test.describe('symbol_editor WASM', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/kicad/symbol_editor.html');
    });

    test('app loads, canvas visible, no WASM abort', async ({ page, testLogger }) => {
        await waitForEditorReady(page);
        await stableShot(page, 'symbol_editor-01-loaded.png');

        expect(hasAbort(testLogger), 'no WASM abort during load').toBe(false);

        const canvasCount = await page.locator('canvas').count();
        expect(canvasCount).toBeGreaterThan(0);
    });

    test('canvas + toolbar metrics look sane', async ({ page, testLogger }) => {
        await waitForEditorReady(page);

        const metrics = await page.evaluate(() => {
            const registry = window.wxElementRegistry!;
            const all = registry.findAll({ visible: true });
            const toolbars = all.filter((el) => /ToolBar/.test(el.typeName));
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

        await stableShot(page, 'symbol_editor-02-metrics.png');

        expect(metrics.registryTotal, 'registry should be populated').toBeGreaterThan(10);
        expect(metrics.toolbarCount, 'at least one toolbar should be visible').toBeGreaterThanOrEqual(1);
        expect(metrics.mainCanvasOk, 'main canvas has nonzero dimensions').toBe(true);
        expect(metrics.glCanvasOk, 'GL canvas has nonzero dimensions').toBe(true);
        expect(hasAbort(testLogger)).toBe(false);
    });
});
