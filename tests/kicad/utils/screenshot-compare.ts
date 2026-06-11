import * as fs from 'fs';
import * as path from 'path';
import { expect, type Page } from '@playwright/test';
import { clickByLabel } from '../../e2e/utils/element-tracker';

/**
 * Shared screenshot-comparison and app-startup helpers for the KiCad specs
 * (extracted from pcbnew.spec.ts so dark-mode.spec.ts and future specs don't
 * carry their own copies of the pixel-diff logic and thresholds).
 */

export type ReferenceRegion = {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    maxDiffRatio: number;
    maxMeanChannelDiff: number;
};

export type ReferenceComparison = {
    name: string;
    actualWidth: number;
    actualHeight: number;
    referenceWidth: number;
    referenceHeight: number;
    diffPixels: number;
    diffRatio: number;
    meanChannelDiff: number;
};

/** Post-wizard pcbnew baseline screenshot (committed) and its toolbar region. */
export const PCBNEW_REFERENCE = path.resolve(__dirname, '../../wizard-04-finish-headless.png');
export const PCBNEW_HEADER_REGION: ReferenceRegion = {
    name: 'header', x: 0, y: 0, width: 1280, height: 90, maxDiffRatio: 0.12, maxMeanChannelDiff: 12,
};

/**
 * Crop `region` out of both images and pixel-diff them inside the page (the
 * Node side has no canvas). Returns Infinity diffs on size mismatch.
 */
export async function compareToReference(
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

/**
 * Click through the first-run setup wizard until Finish (or until no wizard
 * page is showing). With `screenshots: true`, saves the per-step
 * test-results/wizard-NN[-finish].png series pcbnew.spec.ts captures.
 */
export async function completeWizard(page: Page, opts: { screenshots?: boolean } = {}): Promise<void> {
    await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });
    await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 90000 });
    // The registry OBJECT exists as soon as wx.js initializes — long before the
    // app wasm boots (slow on CI: ~190M module on baseline-JIT + software GL).
    // Wait for actual UI entries (the wizard is the first window) before the
    // bounded click loop below, which otherwise starts too early and gives up.
    await page.waitForFunction(() => {
        const registry = window.wxElementRegistry;
        return !!registry && registry.findAll({}).length > 0;
    }, null, { timeout: 150000 });
    await page.waitForTimeout(2000);

    if (opts.screenshots) {
        await page.screenshot({ path: 'test-results/wizard-00-initial.png', scale: 'device' });
    }

    for (let i = 1; i <= 10; i++) {
        const clicked = await clickByLabel(page, 'Next >');

        if (!clicked) {
            const finished = await clickByLabel(page, 'Finish');

            if (finished && opts.screenshots) {
                await page.waitForTimeout(500);
                await page.screenshot({
                    path: `test-results/wizard-${String(i).padStart(2, '0')}-finish.png`,
                    scale: 'device'
                });
            }

            break;
        }

        await page.waitForTimeout(500);

        if (opts.screenshots) {
            await page.screenshot({
                path: `test-results/wizard-${String(i).padStart(2, '0')}.png`,
                scale: 'device'
            });
        }
    }

    await page.waitForTimeout(2000);
}

/** Hide the mouse cursor so screenshots are stable. */
export async function hideCursor(page: Page): Promise<void> {
    await page.evaluate(() => {
        document.documentElement.style.cursor = 'none';
        document.body.style.cursor = 'none';
    });
}
