import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { clickMenuBarItem, clickMenuItem } from '../e2e/utils/element-tracker';
import { injectFromSubmodule } from './utils/fs-inject';
import { waitForBoardLoaded } from './utils/board-ready';
import { waitForPcbnew } from './utils/pcbnew-ready';

/**
 * 3D viewer e2e: load a real board in pcbnew, open the native 3D viewer
 * (View → 3D Viewer / Alt+3), and verify a second top-level frame with its own
 * WebGL canvas appears and renders the board.
 *
 * The 3D viewer (EDA_3D_VIEWER_FRAME) is a separate modeless KIWAY_PLAYER frame.
 * In the wasm DOM port that surfaces as a new `#window-1` div in
 * `#window-container` plus a dedicated `<canvas id="glcanvas-N">` (the main
 * pcbnew board view is itself a wxGLCanvas, so we detect the viewer by the
 * GL-canvas COUNT increasing, not by mere presence).
 *
 * Enabled by the WASM 3D-viewer build (BUILD_3D_VIEWER=ON →
 * KICAD_BUILD_3D_VIEWER_WASM). With the bare board (no component STEP/WRL
 * models — deferred), the viewer shows copper/silk/mask/edge geometry in 3D.
 */

const KICAD_VERSION_DIR = '9.99';
const PROJECT_DIR_MEMFS = `/home/kicad/documents/kicad/${KICAD_VERSION_DIR}/projects`;

// Small, no-external-libs RF board — fast to load, no missing-libs dialog.
const DEMO = { name: 'microwave', dir: 'microwave', stem: 'microwave' } as const;

async function loadBoard(page: Page, testLogger: { consoleLogs: string[]; errors: string[] }): Promise<void> {
    const pcbFilename = `${DEMO.stem}.kicad_pcb`;
    const proFilename = `${DEMO.stem}.kicad_pro`;

    await injectFromSubmodule(page, `kicad/demos/${DEMO.dir}/${pcbFilename}`,
        `${PROJECT_DIR_MEMFS}/${pcbFilename}`);
    await injectFromSubmodule(page, `kicad/demos/${DEMO.dir}/${proFilename}`,
        `${PROJECT_DIR_MEMFS}/${proFilename}`);

    expect(await clickMenuBarItem(page, 'File'), 'File menu should be findable').toBe(true);
    await page.waitForTimeout(400);
    expect(await clickMenuItem(page, 'Open...'), 'Open… menu item should be findable').toBe(true);

    await page.waitForFunction(() => {
        const registry = window.wxElementRegistry;
        return !!registry && registry.findAll({ visible: true })
            .some((el) => el.typeName === 'wxFileDialog');
    }, null, { timeout: 15000 });
    await page.waitForTimeout(1000);

    const filenameInput = await page.evaluate(() => {
        const registry = window.wxElementRegistry;
        if (!registry) return null;
        const text = registry.findAll({ visible: true })
            .find((el) => el.typeName === 'wxTextCtrl' && el.name === 'text');
        return text ? { x: text.centerX, y: text.centerY } : null;
    });
    expect(filenameInput, 'filename text input should be visible').not.toBeNull();
    if (!filenameInput) throw new Error('filename text input not found');

    await page.mouse.click(filenameInput.x, filenameInput.y);
    await page.waitForTimeout(200);
    await page.keyboard.type(pcbFilename);
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    const result = await waitForBoardLoaded(page, testLogger, 60000);
    console.log(`[TEST] ${DEMO.name} board-ready result: ${result}`);
}

function countGlCanvases(page: Page): Promise<number> {
    return page.evaluate(() => document.querySelectorAll('canvas[id^="glcanvas-"]').length);
}

test.describe('3D viewer from pcbnew', () => {
    // One 187 MB wasm runtime is already heavy; keep this serial and generous.
    test.describe.configure({ mode: 'serial' });
    test.setTimeout(240000);

    test('opens the 3D viewer over a loaded board and renders it', async ({ page, testLogger }) => {
        await page.goto('/kicad/pcbnew.html');
        await waitForPcbnew(page);

        await loadBoard(page, testLogger);
        await page.screenshot({ path: `test-results/3d-viewer-00-board-loaded.png`, scale: 'device' });

        const glBefore = await countGlCanvases(page);
        console.log(`[TEST] glcanvas count before opening 3D viewer: ${glBefore}`);

        // ── Open the 3D viewer: View → 3D Viewer, with an Alt+3 fallback. ──
        let opened = false;
        if (await clickMenuBarItem(page, 'View')) {
            await page.waitForTimeout(400);
            opened = await clickMenuItem(page, '3D Viewer');
        }
        if (!opened) {
            console.log('[TEST] View → 3D Viewer not found via menu; trying Alt+3');
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
            await page.keyboard.press('Alt+3');
        }

        // ── Wait for the secondary frame + a NEW GL canvas to appear. ──────
        await page.waitForFunction(() => {
            // A new top-level window div beyond the main pcbnew frame.
            return !!document.querySelector('#window-container [id^="window-"]')
                || document.querySelectorAll('canvas[id^="glcanvas-"]').length > 0;
        }, null, { timeout: 60000 });

        await page.waitForFunction((before: number) =>
            document.querySelectorAll('canvas[id^="glcanvas-"]').length > before,
            glBefore, { timeout: 60000 });

        const glAfter = await countGlCanvases(page);
        console.log(`[TEST] glcanvas count after opening 3D viewer: ${glAfter}`);
        expect(glAfter, 'a new WebGL canvas should appear for the 3D viewer').toBeGreaterThan(glBefore);

        // The 3D reload runs through asyncify; give it time to build & render the
        // board, then screenshot for visual validation (per CLAUDE.md).
        await page.waitForTimeout(4000);
        await page.screenshot({ path: `test-results/3d-viewer-${DEMO.name}.png`, scale: 'device' });

        // The newest GL canvas is the 3D viewer's — screenshot it on its own too.
        const newCanvas = page.locator('canvas[id^="glcanvas-"]').last();
        if (await newCanvas.isVisible().catch(() => false)) {
            await newCanvas.screenshot({ path: `test-results/3d-viewer-${DEMO.name}-canvas.png` })
                .catch((e: unknown) => console.log(`[TEST] canvas screenshot failed: ${e}`));
        }

        // ── Console-clean gates (same signatures load-pcb.spec.ts guards). ──
        const allLines = [...testLogger.consoleLogs, ...testLogger.errors];
        const aborts = allLines.filter((l) => l.includes('Aborted('));
        expect(aborts, `WASM aborted while opening the 3D viewer:\n${aborts.join('\n\n')}`).toEqual([]);

        const asyncifySignatures = [
            'index out of bounds', 'indirect call to null', 'uncaught exception: unwind',
            'invalid state', 'is not a function',
        ];
        const asyncifyErrors = allLines.filter((l) =>
            asyncifySignatures.some((sig) => l.toLowerCase().includes(sig)));
        expect(asyncifyErrors,
            `Asyncify corruption surfaced opening the 3D viewer:\n${asyncifyErrors.join('\n\n')}`)
            .toEqual([]);

        // The 3D viewer stub logs this when the real viewer is NOT compiled in —
        // its presence means BUILD_3D_VIEWER=ON didn't take effect.
        const stubbed = allLines.filter((l) => l.includes('3D Viewer is not available'));
        expect(stubbed,
            `3D viewer is still stubbed (build not enabled?):\n${stubbed.join('\n')}`).toEqual([]);
    });
});
