import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { clickByLabel, clickByTooltip, findByTooltip } from '../e2e/utils/element-tracker';

/**
 * Eeschema (schematic editor) WASM E2E Tests
 *
 * Mirrors pcbnew.spec.ts. The wxWidgets setup wizard is shared infrastructure,
 * so the wizard flow is identical. Editor-specific checks (Appearance pane,
 * exact toolbar count, reference-image diff, etc.) are intentionally omitted
 * here until the eeschema UI surface is empirically pinned down.
 */

type CanvasMetrics = {
    dpr: number;
    mainCanvas: null | {
        width: number;
        height: number;
        rectWidth: number;
        rectHeight: number;
    };
    glCanvas: null | {
        id: string;
        width: number;
        height: number;
        rectWidth: number;
        rectHeight: number;
        viewport: number[] | null;
    };
};

type RegistryMetrics = {
    elementStats: null | {
        total: number;
        byType: Record<string, number>;
    };
    renderedStats: null | {
        total: number;
        byType: Record<string, number>;
    };
    toolbars: Array<{
        id: string;
        typeName: string;
        screenX: number;
        screenY: number;
        width: number;
        height: number;
        label: string;
        name: string;
    }>;
};

type DiffRegion = {
    x: number;
    y: number;
    width: number;
    height: number;
};

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

        const [before, after] = await Promise.all([
            loadImage(beforeBase64),
            loadImage(afterBase64),
        ]);

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

        if (!context) {
            throw new Error('2D canvas context unavailable for screenshot comparison');
        }

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
            const maxDiff = Math.max(dr, dg, db, da);

            totalChannelDiff += dr + dg + db + da;

            if (maxDiff > 16) {
                diffPixels += 1;
            }
        }

        return {
            actualWidth: after.width,
            actualHeight: after.height,
            diffPixels,
            diffRatio: diffPixels / (canvas.width * canvas.height),
            meanChannelDiff: totalChannelDiff / beforeData.length,
        };
    }, {
        beforeBase64: beforePng.toString('base64'),
        afterBase64: afterPng.toString('base64'),
        crop: region,
    });
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
                }) ??
            document.querySelector('[id^="glcanvas-"]') as HTMLCanvasElement | null;

        const mainRect = mainCanvas?.getBoundingClientRect();
        const glRect = glCanvas?.getBoundingClientRect();
        const gl =
            glCanvas?.getContext('webgl2') ||
            glCanvas?.getContext('webgl');
        const viewport = gl ? Array.from(gl.getParameter(gl.VIEWPORT) as Int32Array | number[]) : null;

        return {
            dpr,
            mainCanvas: mainCanvas && mainRect ? {
                width: mainCanvas.width,
                height: mainCanvas.height,
                rectWidth: mainRect.width,
                rectHeight: mainRect.height,
            } : null,
            glCanvas: glCanvas && glRect ? {
                id: glCanvas.id,
                width: glCanvas.width,
                height: glCanvas.height,
                rectWidth: glRect.width,
                rectHeight: glRect.height,
                viewport,
            } : null,
        };
    });
}

async function getRegistryMetrics(page: Page): Promise<RegistryMetrics> {
    return page.evaluate(() => {
        const registry = window.wxElementRegistry;

        if (!registry) {
            return {
                elementStats: null,
                renderedStats: null,
                toolbars: [],
            };
        }

        const allElements = registry.findAll({ visible: true });
        const toolbars = allElements
            .filter((element) => /ToolBar/.test(element.typeName))
            .map((element) => ({
                id: element.id,
                typeName: element.typeName,
                screenX: element.screenX,
                screenY: element.screenY,
                width: element.width,
                height: element.height,
                label: element.label,
                name: element.name,
            }));

        return {
            elementStats: registry.getStats(),
            renderedStats: registry.getRenderedStats ? registry.getRenderedStats() : null,
            toolbars,
        };
    });
}

async function completeWizard(page: Page): Promise<void> {
    await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });
    await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 90000 });
    // Registry object ≠ app booted: wait for real UI entries (the wizard is the
    // first window) so the bounded click loop below doesn't start too early.
    // CI boots slower (baseline-JIT wasm + software GL under xvfb).
    await page.waitForFunction(() => {
        const registry = window.wxElementRegistry;
        return !!registry && registry.findAll({}).length > 0;
    }, null, { timeout: 150000 });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/eeschema-wizard-00-initial.png', scale: 'device' });

    for (let i = 1; i <= 10; i++) {
        let clicked = await clickByLabel(page, 'Next >');

        if (!clicked) {
            clicked = await clickByLabel(page, 'Finish');

            if (clicked) {
                await page.waitForTimeout(500);
                await page.screenshot({
                    path: `test-results/eeschema-wizard-${String(i).padStart(2, '0')}-finish.png`,
                    scale: 'device'
                });
            }

            break;
        }

        await page.waitForTimeout(500);
        await page.screenshot({
            path: `test-results/eeschema-wizard-${String(i).padStart(2, '0')}.png`,
            scale: 'device'
        });
    }

    await page.waitForTimeout(2000);
}

async function hideCursor(page: Page): Promise<void> {
    await page.evaluate(() => {
        document.documentElement.style.cursor = 'none';
        document.body.style.cursor = 'none';
    });
}

test.describe('Eeschema WASM', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/kicad/eeschema.html');
    });

    test('click through setup wizard to load Eeschema', async ({ page }) => {
        await completeWizard(page);
        const metrics = await getCanvasMetrics(page);
        const registryMetrics = await getRegistryMetrics(page);

        // Headless Firefox runs at dpr=1; pcbnew's stricter `> 1` check assumes a
        // Retina-aware run. The eeschema MVP just needs to verify dpr is sane.
        expect(metrics.dpr).toBeGreaterThanOrEqual(1);
        expect(metrics.mainCanvas).not.toBeNull();
        expect(metrics.glCanvas).not.toBeNull();
        expect(registryMetrics.toolbars.length).toBeGreaterThanOrEqual(2);

        if (!metrics.mainCanvas || !metrics.glCanvas) {
            throw new Error('KiCad canvases not initialized');
        }

        expect(Math.round(metrics.mainCanvas.rectWidth * metrics.dpr)).toBe(metrics.mainCanvas.width);
        expect(Math.round(metrics.mainCanvas.rectHeight * metrics.dpr)).toBe(metrics.mainCanvas.height);
        expect(metrics.glCanvas.rectWidth).toBeGreaterThan(800);
        expect(metrics.glCanvas.rectHeight).toBeGreaterThan(500);
        expect(Math.round(metrics.glCanvas.rectWidth * metrics.dpr)).toBe(metrics.glCanvas.width);
        expect(Math.round(metrics.glCanvas.rectHeight * metrics.dpr)).toBe(metrics.glCanvas.height);

        const viewport = metrics.glCanvas.viewport;
        expect(viewport).not.toBeNull();

        if (!viewport) {
            throw new Error('WebGL viewport unavailable');
        }

        expect(viewport[2]).toBe(metrics.glCanvas.width);
        expect(viewport[3]).toBe(metrics.glCanvas.height);

        await hideCursor(page);

        // Capture a CSS-scale screenshot for visual review; no reference image
        // is wired up yet (eeschema's chrome differs enough from pcbnew that
        // sharing pcbnew's baseline isn't viable). Add a dedicated baseline
        // here once the layout is finalised.
        await page.screenshot({
            path: 'test-results/eeschema-loaded-css.png',
            scale: 'css'
        });
        await page.screenshot({ path: 'test-results/eeschema-loaded.png', scale: 'device' });

        const canvasCount = await page.locator('canvas').count();
        expect(canvasCount).toBeGreaterThan(0);
    });

    test('select draw wires and draw on the schematic', async ({ page, testLogger }) => {
        await completeWizard(page);
        await hideCursor(page);

        await page.evaluate(() => {
            const canvases = Array.from(document.querySelectorAll('canvas')).map((canvas) => {
                const rect = canvas.getBoundingClientRect();
                const style = window.getComputedStyle(canvas);
                return {
                    id: canvas.id,
                    className: canvas.className,
                    display: style.display,
                    visibility: style.visibility,
                    width: canvas.width,
                    height: canvas.height,
                    rectX: rect.x,
                    rectY: rect.y,
                    rectWidth: rect.width,
                    rectHeight: rect.height,
                    shouldBeVisible: (canvas as HTMLCanvasElement).dataset?.shouldBeVisible ?? null,
                };
            });

            console.log(`[TEST] canvas summary ${JSON.stringify(canvases)}`);

            const registry = window.wxElementRegistry;
            const topLevels = (registry?.findAll?.({}) ?? [])
                .filter((item) => /Frame|Dialog|Wizard/.test(item.typeName))
                .slice(0, 20)
                .map((item) => ({
                    id: item.id,
                    typeName: item.typeName,
                    label: item.label,
                    name: item.name,
                    visible: item.visible,
                    enabled: item.enabled,
                    screenX: item.screenX,
                    screenY: item.screenY,
                    width: item.width,
                    height: item.height,
                }));
            const rendered = registry?.findAllRendered?.({}) ?? [];
            const byType = rendered.reduce<Record<string, number>>((acc, item) => {
                acc[item.elementType] = (acc[item.elementType] ?? 0) + 1;
                return acc;
            }, {});
            const tools = rendered
                .filter((item) => item.elementType === 'tool')
                .slice(0, 20)
                .map((item) => ({
                    id: item.id,
                    label: item.label,
                    tooltip: item.tooltip,
                    checked: item.checked,
                    enabled: item.enabled,
                }));

            console.log(`[TEST] top-level summary ${JSON.stringify(topLevels)}`);
            console.log(`[TEST] rendered summary ${JSON.stringify({ count: rendered.length, byType, tools })}`);
        });

        await page.waitForFunction(() => {
            const registry = window.wxElementRegistry;
            if (!registry?.findAllRendered) {
                return false;
            }

            return registry.findAllRendered({ elementType: 'tool' })
                .some((tool) => tool.tooltip?.includes('Draw Wires'));
        }, null, { timeout: 15000 });

        const drawWiresTool = await findByTooltip(page, 'Draw Wires', { elementType: 'tool' });
        expect(drawWiresTool).not.toBeNull();

        if (!drawWiresTool) {
            throw new Error('Draw Wires tool not found in rendered element registry');
        }

        // The registry carries checked state via a " [checked]" label suffix
        // appended by wxAuiToolBar::OnPaint on Emscripten — no schema change.
        const isToolChecked = (t: { label?: string } | null | undefined) =>
            (t?.label ?? '').includes('[checked]');

        expect(drawWiresTool.enabled).toBe(true);
        expect(isToolChecked(drawWiresTool)).toBe(false);
        const baselineErrorCount = testLogger.errors.length;

        await page.screenshot({
            path: 'test-results/eeschema-draw-wires-00-before-tool-click.png',
            scale: 'device'
        });

        expect(await clickByTooltip(page, 'Draw Wires', { elementType: 'tool' })).toBe(true);

        await expect.poll(async () => {
            const tool = await findByTooltip(page, 'Draw Wires', { elementType: 'tool' });
            return isToolChecked(tool);
        }, {
            message: 'Draw Wires tool should stay selected after the click',
            timeout: 5000,
        }).toBe(true);

        await page.mouse.move(640, 360);
        await page.waitForTimeout(600);

        const selectedDrawWiresTool = await findByTooltip(page, 'Draw Wires', { elementType: 'tool' });
        expect(isToolChecked(selectedDrawWiresTool)).toBe(true);

        const afterToolClick = await page.screenshot({
            path: 'test-results/eeschema-draw-wires-01-after-click.png',
            scale: 'device'
        });

        const glCanvasId = await page.evaluate(() => {
            const glCanvas =
                Array.from(document.querySelectorAll('[id^="glcanvas-"]'))
                    .map((canvas) => canvas as HTMLCanvasElement)
                    .find((canvas) => {
                        const rect = canvas.getBoundingClientRect();
                        const style = window.getComputedStyle(canvas);
                        return style.display !== 'none' && rect.width > 0 && rect.height > 0;
                    }) ??
                document.querySelector('[id^="glcanvas-"]') as HTMLCanvasElement | null;

            return glCanvas?.id ?? null;
        });

        expect(glCanvasId).not.toBeNull();

        if (!glCanvasId) {
            throw new Error('Visible GL canvas not found');
        }

        const glCanvasBox = await page.locator(`#${glCanvasId}`).boundingBox();
        expect(glCanvasBox).not.toBeNull();

        if (!glCanvasBox) {
            throw new Error('GL canvas bounding box unavailable');
        }

        const startPoint = {
            x: Math.round(glCanvasBox.x + glCanvasBox.width * 0.28),
            y: Math.round(glCanvasBox.y + glCanvasBox.height * 0.36),
        };
        const endPoint = {
            x: Math.round(glCanvasBox.x + glCanvasBox.width * 0.48),
            y: Math.round(glCanvasBox.y + glCanvasBox.height * 0.47),
        };

        await page.mouse.click(startPoint.x, startPoint.y);
        await page.waitForTimeout(250);
        await page.mouse.click(endPoint.x, endPoint.y);
        await page.waitForTimeout(750);

        const afterDrawing = await page.screenshot({
            path: 'test-results/eeschema-draw-wires-02-after-drawing.png',
            scale: 'device'
        });

        const diffRegion: DiffRegion = {
            x: Math.max(0, Math.min(startPoint.x, endPoint.x) - 24),
            y: Math.max(0, Math.min(startPoint.y, endPoint.y) - 24),
            width: Math.abs(endPoint.x - startPoint.x) + 48,
            height: Math.abs(endPoint.y - startPoint.y) + 48,
        };

        const drawingDiff = await compareScreenshots(page, afterToolClick, afterDrawing, diffRegion);

        expect(drawingDiff.diffPixels).toBeGreaterThan(120);
        expect(drawingDiff.diffRatio).toBeGreaterThan(0.01);
        expect(drawingDiff.meanChannelDiff).toBeGreaterThan(1);

        const realErrors = testLogger.errors
            .slice(baselineErrorCount)
            .filter((error) => !error.includes('favicon') && !error.includes('uncaught exception: unwind'));
        expect(realErrors).toEqual([]);
    });
});
