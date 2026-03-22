import * as fs from 'fs';
import * as path from 'path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { clickByLabel } from '../e2e/utils/element-tracker';

/**
 * PCBnew WASM E2E Tests
 */

const PCBNEW_REFERENCE = path.resolve(__dirname, '../wizard-04-finish-headless.png');
const REFERENCE_REGIONS = [
    { name: 'header', x: 0, y: 0, width: 1280, height: 90, maxDiffRatio: 0.12, maxMeanChannelDiff: 12 },
] as const;

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
    auiParts: Array<{
        id: string;
        subType: string;
        label: string;
        screenX: number;
        screenY: number;
        width: number;
        height: number;
    }>;
};

type ReferenceComparison = {
    name: string;
    actualWidth: number;
    actualHeight: number;
    referenceWidth: number;
    referenceHeight: number;
    diffPixels: number;
    diffRatio: number;
    meanChannelDiff: number;
};

type ReferenceRegion = typeof REFERENCE_REGIONS[number];

async function compareToReference(
    page: Page,
    actualPng: Buffer,
    referencePath: string,
    region: ReferenceRegion
): Promise<ReferenceComparison> {
    const referencePng = fs.readFileSync(referencePath);

    return page.evaluate(async ({ actualBase64, referenceBase64, crop }) => {
        const loadImage = async (base64: string): Promise<HTMLImageElement> => {
            const image = new Image();
            image.src = `data:image/png;base64,${base64}`;
            await image.decode();
            return image;
        };

        const [actual, reference] = await Promise.all([
            loadImage(actualBase64),
            loadImage(referenceBase64),
        ]);

        if (actual.width !== reference.width || actual.height !== reference.height) {
            return {
                name: crop.name,
                actualWidth: actual.width,
                actualHeight: actual.height,
                referenceWidth: reference.width,
                referenceHeight: reference.height,
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

        context.drawImage(actual, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
        const actualData = context.getImageData(0, 0, canvas.width, canvas.height).data;

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(reference, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
        const referenceData = context.getImageData(0, 0, canvas.width, canvas.height).data;

        let diffPixels = 0;
        let totalChannelDiff = 0;

        for (let i = 0; i < actualData.length; i += 4) {
            const dr = Math.abs(actualData[i] - referenceData[i]);
            const dg = Math.abs(actualData[i + 1] - referenceData[i + 1]);
            const db = Math.abs(actualData[i + 2] - referenceData[i + 2]);
            const da = Math.abs(actualData[i + 3] - referenceData[i + 3]);
            const maxDiff = Math.max(dr, dg, db, da);

            totalChannelDiff += dr + dg + db + da;

            if (maxDiff > 16) {
                diffPixels += 1;
            }
        }

        return {
            name: crop.name,
            actualWidth: actual.width,
            actualHeight: actual.height,
            referenceWidth: reference.width,
            referenceHeight: reference.height,
            diffPixels,
            diffRatio: diffPixels / (canvas.width * canvas.height),
            meanChannelDiff: totalChannelDiff / actualData.length,
        };
    }, {
        actualBase64: actualPng.toString('base64'),
        referenceBase64: referencePng.toString('base64'),
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
                auiParts: [],
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

        const auiParts = registry.findAllRendered
            ? registry.findAllRendered({ elementType: 'auipart' })
                .map((part) => ({
                    id: part.id,
                    subType: part.subType,
                    label: part.label,
                    screenX: part.screenX,
                    screenY: part.screenY,
                    width: part.width,
                    height: part.height,
                }))
            : [];

        return {
            elementStats: registry.getStats(),
            renderedStats: registry.getRenderedStats ? registry.getRenderedStats() : null,
            toolbars,
            auiParts,
        };
    });
}

test.describe('PCBnew WASM', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/kicad/pcbnew.html');
    });

    test('click through setup wizard to load PCBnew', async ({ page }) => {
        await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });
        await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 90000 });
        await page.waitForTimeout(2000);

        await page.screenshot({ path: 'test-results/wizard-00-initial.png', scale: 'device' });

        for (let i = 1; i <= 10; i++) {
            let clicked = await clickByLabel(page, 'Next >');

            if (!clicked) {
                clicked = await clickByLabel(page, 'Finish');

                if (clicked) {
                    await page.waitForTimeout(500);
                    await page.screenshot({
                        path: `test-results/wizard-${String(i).padStart(2, '0')}-finish.png`,
                        scale: 'device'
                    });
                }

                break;
            }

            await page.waitForTimeout(500);
            await page.screenshot({
                path: `test-results/wizard-${String(i).padStart(2, '0')}.png`,
                scale: 'device'
            });
        }

        await page.waitForTimeout(2000);
        const metrics = await getCanvasMetrics(page);
        const registryMetrics = await getRegistryMetrics(page);

        expect(metrics.dpr).toBeGreaterThan(1);
        expect(metrics.mainCanvas).not.toBeNull();
        expect(metrics.glCanvas).not.toBeNull();
        expect(registryMetrics.toolbars.length).toBeGreaterThanOrEqual(4);

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

        const verticalToolbars = registryMetrics.toolbars.filter((toolbar) => toolbar.height > 100);
        expect(verticalToolbars).toHaveLength(2);

        for (const toolbar of verticalToolbars) {
            expect(toolbar.width).toBeLessThanOrEqual(40);
        }

        const appearancePane = registryMetrics.auiParts.find((part) =>
            part.subType === 'content' && part.label === 'Appearance'
        );
        expect(appearancePane).toBeTruthy();

        if (!appearancePane) {
            throw new Error('Appearance pane metrics unavailable');
        }

        expect(appearancePane.width).toBeGreaterThanOrEqual(200);
        expect(appearancePane.width).toBeLessThanOrEqual(240);

        await page.evaluate(() => {
            document.documentElement.style.cursor = 'none';
            document.body.style.cursor = 'none';
        });

        const cssScreenshot = await page.screenshot({
            path: 'test-results/pcbnew-loaded-css.png',
            scale: 'css'
        });
        for (const region of REFERENCE_REGIONS) {
            const reference = await compareToReference(page, cssScreenshot, PCBNEW_REFERENCE, region);

            expect(reference.actualWidth).toBe(reference.referenceWidth);
            expect(reference.actualHeight).toBe(reference.referenceHeight);
            expect(reference.diffRatio, `${reference.name} diff ratio`).toBeLessThan(region.maxDiffRatio);
            expect(reference.meanChannelDiff, `${reference.name} mean channel diff`).toBeLessThan(region.maxMeanChannelDiff);
        }

        await page.screenshot({ path: 'test-results/pcbnew-loaded.png', scale: 'device' });

        const canvasCount = await page.locator('canvas').count();
        expect(canvasCount).toBeGreaterThan(0);
    });
});
