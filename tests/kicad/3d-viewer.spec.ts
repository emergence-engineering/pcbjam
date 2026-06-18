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

// pic_programmer frames correctly in the default 3D camera (the microwave demo
// has a known board-bounding-box scale bug that projects it off-screen — a
// separate follow-up). Loads cleanly in this harness (see 2D load tests).
const DEMO = { name: 'pic_programmer', dir: 'pic_programmer', stem: 'pic_programmer' } as const;

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

        // The 3D reload + raytrace run through asyncify; give them time to build
        // the scene and render a few progressive passes.
        await page.waitForTimeout(5000);

        await page.screenshot({ path: `test-results/3d-viewer-${DEMO.name}.png`, scale: 'device' });

        // Read the 3D viewer canvas (the newest glcanvas) directly from its backing
        // store: copy it onto a 2D canvas with drawImage and sample pixels. This is
        // reliable thanks to preserveDrawingBuffer=true, whereas Playwright's CDP
        // screenshot of a WebGL canvas on swiftshader comes back blank. We save the
        // copy as a PNG (the real visual artifact) and assert the board rendered by
        // checking the canvas is not a single uniform colour.
        const render = await page.evaluate(() => {
            const list = document.querySelectorAll('canvas[id^="glcanvas-"]');
            const el = list[list.length - 1] as HTMLCanvasElement;
            const tmp = document.createElement('canvas');
            tmp.width = el.width;
            tmp.height = el.height;
            const ctx = tmp.getContext('2d')!;
            ctx.drawImage(el, 0, 0);

            const colors = new Set<string>();
            for (let i = 0; i < 16; i++) {
                for (let j = 0; j < 16; j++) {
                    const d = ctx.getImageData(Math.floor(el.width * i / 16),
                                               Math.floor(el.height * j / 16), 1, 1).data;
                    colors.add(`${d[0]},${d[1]},${d[2]}`);
                }
            }
            return { id: el.id, w: el.width, h: el.height, distinctColors: colors.size,
                     dataUrl: tmp.toDataURL('image/png') };
        });
        console.log(`[TEST] 3D canvas ${render.id} ${render.w}x${render.h}, distinct colours: ${render.distinctColors}`);

        const b64 = render.dataUrl.replace(/^data:image\/png;base64,/, '');
        require('fs').writeFileSync(`test-results/3d-viewer-${DEMO.name}-render.png`,
                                    Buffer.from(b64, 'base64'));

        // A blank/uniform canvas yields ~1 colour; the rendered board has many.
        expect(render.distinctColors,
            'the 3D viewer canvas should render the board (many colours), not a blank fill')
            .toBeGreaterThan(8);

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
