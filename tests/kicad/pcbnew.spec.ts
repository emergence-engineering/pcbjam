import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
    clickByTooltip,
    findByTooltip,
    waitForCanvasStable,
    waitForEditorReady,
    waitUntil, stableShot, shotPath } from '../e2e/utils/element-tracker';
import { hideCursor } from './utils/screenshot-compare';

/**
 * PCBnew WASM E2E Tests
 *
 * pcbnew.html seeds a default KiCad config in preRun, so the first-run setup
 * wizard never opens — the editor comes straight up and we wait deterministically
 * for its canvas + toolbars. The launch shot uses stableShot (stabilizes then
 * compares, replacing the old header-region reference diff). The line-drawing test
 * proves a segment rendered via a functional before/after pixel diff.
 */

type CanvasMetrics = {
    dpr: number;
    mainCanvas: null | { width: number; height: number; rectWidth: number; rectHeight: number };
    glCanvas: null | { id: string; width: number; height: number; rectWidth: number; rectHeight: number; viewport: number[] | null };
};

type RegistryMetrics = {
    toolbars: Array<{ id: string; typeName: string; width: number; height: number; label: string; name: string }>;
    auiParts: Array<{ id: string; subType: string; label: string; width: number; height: number }>;
};

type DiffRegion = { x: number; y: number; width: number; height: number };

type ScreenshotDifference = {
    actualWidth: number;
    actualHeight: number;
    diffPixels: number;
    diffRatio: number;
    meanChannelDiff: number;
};

async function compareScreenshots(
    page: Page,
    beforePng: Buffer,
    afterPng: Buffer,
    region: DiffRegion
): Promise<ScreenshotDifference> {
    return page.evaluate(async ({ beforeBase64, afterBase64, crop }) => {
        const loadImage = async (base64: string): Promise<HTMLImageElement> => {
            const image = new Image();
            image.src = `data:image/png;base64,${base64}`;
            await image.decode();
            return image;
        };

        const [before, after] = await Promise.all([loadImage(beforeBase64), loadImage(afterBase64)]);

        if (before.width !== after.width || before.height !== after.height) {
            return {
                actualWidth: after.width,
                actualHeight: after.height,
                diffPixels: Number.POSITIVE_INFINITY,
                diffRatio: Number.POSITIVE_INFINITY,
                meanChannelDiff: Number.POSITIVE_INFINITY,
            };
        }

        const canvas = document.createElement('canvas');
        canvas.width = crop.width;
        canvas.height = crop.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('2D canvas context unavailable for screenshot comparison');

        context.drawImage(before, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
        const beforeData = context.getImageData(0, 0, canvas.width, canvas.height).data;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(after, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
        const afterData = context.getImageData(0, 0, canvas.width, canvas.height).data;

        let diffPixels = 0;
        let totalChannelDiff = 0;
        for (let i = 0; i < beforeData.length; i += 4) {
            const dr = Math.abs(beforeData[i] - afterData[i]);
            const dg = Math.abs(beforeData[i + 1] - afterData[i + 1]);
            const db = Math.abs(beforeData[i + 2] - afterData[i + 2]);
            const da = Math.abs(beforeData[i + 3] - afterData[i + 3]);
            totalChannelDiff += dr + dg + db + da;
            if (Math.max(dr, dg, db, da) > 16) diffPixels += 1;
        }

        return {
            actualWidth: after.width,
            actualHeight: after.height,
            diffPixels,
            diffRatio: diffPixels / (canvas.width * canvas.height),
            meanChannelDiff: totalChannelDiff / beforeData.length,
        };
    }, { beforeBase64: beforePng.toString('base64'), afterBase64: afterPng.toString('base64'), crop: region });
}

async function getCanvasMetrics(page: Page): Promise<CanvasMetrics> {
    return page.evaluate(() => {
        const dpr = window.devicePixelRatio || 1;
        const mainCanvas = document.querySelector('#canvas') as HTMLCanvasElement | null;
        const glCanvas =
            Array.from(document.querySelectorAll('[id^="glcanvas-"]'))
                .map((canvas) => canvas as HTMLCanvasElement)
                .find((canvas) => {
                    const rect = canvas.getBoundingClientRect();
                    const style = window.getComputedStyle(canvas);
                    return style.display !== 'none' && rect.width > 0 && rect.height > 0;
                }) ?? (document.querySelector('[id^="glcanvas-"]') as HTMLCanvasElement | null);

        const mainRect = mainCanvas?.getBoundingClientRect();
        const glRect = glCanvas?.getBoundingClientRect();
        const gl = glCanvas?.getContext('webgl2') || glCanvas?.getContext('webgl');
        const viewport = gl ? Array.from(gl.getParameter(gl.VIEWPORT) as Int32Array | number[]) : null;

        return {
            dpr,
            mainCanvas: mainCanvas && mainRect ? {
                width: mainCanvas.width, height: mainCanvas.height,
                rectWidth: mainRect.width, rectHeight: mainRect.height,
            } : null,
            glCanvas: glCanvas && glRect ? {
                id: glCanvas.id, width: glCanvas.width, height: glCanvas.height,
                rectWidth: glRect.width, rectHeight: glRect.height, viewport,
            } : null,
        };
    });
}

async function getRegistryMetrics(page: Page): Promise<RegistryMetrics> {
    return page.evaluate(() => {
        const registry = window.wxElementRegistry!;
        const toolbars = registry.findAll({ visible: true })
            .filter((element) => /ToolBar/.test(element.typeName))
            .map((element) => ({
                id: element.id, typeName: element.typeName,
                width: element.width, height: element.height,
                label: element.label, name: element.name,
            }));
        const auiParts = registry.findAllRendered
            ? registry.findAllRendered({ elementType: 'auipart' }).map((part) => ({
                id: part.id, subType: part.subType, label: part.label,
                width: part.width, height: part.height,
            }))
            : [];
        return { toolbars, auiParts };
    });
}

test.describe('PCBnew WASM', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/kicad/pcbnew.html');
    });

    test('loads PCBnew with sane canvas + toolbar + pane metrics', async ({ page }) => {
        await waitForEditorReady(page);
        const metrics = await getCanvasMetrics(page);
        const registryMetrics = await getRegistryMetrics(page);

        expect(metrics.dpr).toBeGreaterThanOrEqual(1);
        expect(metrics.mainCanvas).not.toBeNull();
        expect(metrics.glCanvas).not.toBeNull();
        expect(registryMetrics.toolbars.length).toBeGreaterThanOrEqual(4);

        const mainCanvas = metrics.mainCanvas!;
        const glCanvas = metrics.glCanvas!;

        expect(Math.round(mainCanvas.rectWidth * metrics.dpr)).toBe(mainCanvas.width);
        expect(Math.round(mainCanvas.rectHeight * metrics.dpr)).toBe(mainCanvas.height);
        expect(glCanvas.rectWidth).toBeGreaterThan(800);
        expect(glCanvas.rectHeight).toBeGreaterThan(500);
        expect(Math.round(glCanvas.rectWidth * metrics.dpr)).toBe(glCanvas.width);
        expect(Math.round(glCanvas.rectHeight * metrics.dpr)).toBe(glCanvas.height);

        const viewport = glCanvas.viewport;
        expect(viewport).not.toBeNull();
        expect(viewport![2]).toBe(glCanvas.width);
        expect(viewport![3]).toBe(glCanvas.height);

        const verticalToolbars = registryMetrics.toolbars.filter((toolbar) => toolbar.height > 100);
        expect(verticalToolbars).toHaveLength(2);
        for (const toolbar of verticalToolbars) {
            expect(toolbar.width).toBeLessThanOrEqual(40);
        }

        const appearancePane = registryMetrics.auiParts.find((part) => part.subType === 'content' && part.label === 'Appearance');
        expect(appearancePane, 'Appearance pane present').toBeTruthy();
        expect(appearancePane!.width).toBeGreaterThanOrEqual(200);
        expect(appearancePane!.width).toBeLessThanOrEqual(240);

        await hideCursor(page);
        await stableShot(page, 'pcbnew-loaded-css.png');
        await stableShot(page, 'pcbnew-loaded.png');

        const canvasCount = await page.locator('canvas').count();
        expect(canvasCount).toBeGreaterThan(0);
    });

    test('select draw lines and draw on the board', async ({ page, testLogger }) => {
        await waitForEditorReady(page);
        await hideCursor(page);

        // Wait for the Draw Lines tool to render into the toolbar registry.
        await waitUntil(
            page,
            () => {
                const r = window.wxElementRegistry;
                if (!r?.findAllRendered) return false;
                return r.findAllRendered({ elementType: 'tool' }).some((tool) => tool.tooltip?.includes('Draw Lines'));
            },
            'Draw Lines tool rendered',
        );

        const drawLinesTool = await findByTooltip(page, 'Draw Lines', { elementType: 'tool' });
        expect(drawLinesTool, 'Draw Lines tool present').not.toBeNull();

        const isToolChecked = (t: { label?: string } | null | undefined) => (t?.label ?? '').includes('[checked]');
        expect(drawLinesTool!.enabled).toBe(true);
        expect(isToolChecked(drawLinesTool)).toBe(false);
        const baselineErrorCount = testLogger.errors.length;

        await stableShot(page, 'pcbnew-draw-lines-00-before-tool-click.png');

        expect(await clickByTooltip(page, 'Draw Lines', { elementType: 'tool' })).toBe(true);
        await expect.poll(async () => isToolChecked(await findByTooltip(page, 'Draw Lines', { elementType: 'tool' })), {
            message: 'Draw Lines tool should stay selected after the click',
            timeout: 5000,
        }).toBe(true);

        const glCanvasId = await page.evaluate(() => {
            const glCanvas =
                Array.from(document.querySelectorAll('[id^="glcanvas-"]'))
                    .map((canvas) => canvas as HTMLCanvasElement)
                    .find((canvas) => {
                        const rect = canvas.getBoundingClientRect();
                        const style = window.getComputedStyle(canvas);
                        return style.display !== 'none' && rect.width > 0 && rect.height > 0;
                    }) ?? (document.querySelector('[id^="glcanvas-"]') as HTMLCanvasElement | null);
            return glCanvas?.id ?? null;
        });
        expect(glCanvasId, 'a visible GL canvas exists').not.toBeNull();
        const glSel = `#${glCanvasId}`;

        const glCanvasBox = await page.locator(glSel).boundingBox();
        expect(glCanvasBox, 'GL canvas bounding box available').not.toBeNull();
        const box = glCanvasBox!;

        // Move the crosshair onto the canvas (a visible change → deterministic settle).
        await page.mouse.move(640, 360);
        await waitForCanvasStable(page, glSel);
        const afterToolClick = await page.screenshot({ path: shotPath(page, 'pcbnew-draw-lines-01-after-click.png'), scale: 'css' });

        const startPoint = { x: Math.round(box.x + box.width * 0.28), y: Math.round(box.y + box.height * 0.36) };
        const endPoint = { x: Math.round(box.x + box.width * 0.48), y: Math.round(box.y + box.height * 0.47) };

        // Place the two line vertices with an explicit, settled motion before each button
        // press. KiCad's GAL updates the active tool's world-space cursor from the
        // asyncified pointer-move handler; a bare mouse.click() (move+down+up with no dwell)
        // fires the button before that handler has run, so the vertex lands at a stale
        // position or is dropped and no segment is committed. A short dwell after each move
        // lets the position propagate. This is the one interaction whose commit has no
        // JS-observable signal to poll (see the render-idle plan / eeschema draw-wires) —
        // the dwells are the documented irreducible waits.
        await page.mouse.move(startPoint.x, startPoint.y);
        await page.waitForTimeout(350); // eslint-disable-line -- see comment above
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForTimeout(350); // eslint-disable-line -- see comment above
        await page.mouse.move(endPoint.x, endPoint.y);
        await page.waitForTimeout(350); // eslint-disable-line -- see comment above
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForTimeout(750); // eslint-disable-line -- see comment above

        const afterDrawing = await page.screenshot({ path: shotPath(page, 'pcbnew-draw-lines-02-after-drawing.png'), scale: 'css' });

        const diffRegion: DiffRegion = {
            x: Math.max(0, Math.min(startPoint.x, endPoint.x) - 24),
            y: Math.max(0, Math.min(startPoint.y, endPoint.y) - 24),
            width: Math.abs(endPoint.x - startPoint.x) + 48,
            height: Math.abs(endPoint.y - startPoint.y) + 48,
        };
        const drawingDiff = await compareScreenshots(page, afterToolClick, afterDrawing, diffRegion);

        expect(drawingDiff.diffPixels).toBeGreaterThan(120);
        expect(drawingDiff.diffRatio).toBeGreaterThan(0.005);
        expect(drawingDiff.meanChannelDiff).toBeGreaterThan(0.4);

        const realErrors = testLogger.errors.slice(baselineErrorCount).filter((error) => !error.includes('favicon'));
        expect(realErrors).toEqual([]);
    });
});
