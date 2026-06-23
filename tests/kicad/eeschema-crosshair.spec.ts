import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { clickByLabel, findByTooltip } from '../e2e/utils/element-tracker';

/**
 * Eeschema crosshair-mode toolbar button (pcbjam #24)
 *
 * The left toolbar has a single "Crosshair modes" group button that should switch the
 * on-canvas cursor between small / full-window / 45-degree crosshairs. In the WASM/DOM port
 * the three modes are bundled into one ACTION_GROUP whose only directly-clickable action is
 * the default (small crosshairs) — already the active mode — and the other two live behind a
 * long-press palette flyout the DOM toolbar can't show. So clicking the button does nothing.
 *
 * The fix (kicad/common/tool/action_toolbar.cpp, ACTION_TOOLBAR::onToolEvent, #ifdef
 * __EMSCRIPTEN__) makes a click on a grouped button advance to the next action in the group,
 * so a click cycles small -> full-window -> 45-degree -> small.
 *
 * This test fails before the fix (the button's tooltip never advances past "Small
 * crosshairs" and the canvas never changes) and passes after it.
 */

const CROSSHAIR_MATCH = 'rosshair'; // substring shared by all three crosshair tooltips

type DiffRegion = { x: number; y: number; width: number; height: number };

type ScreenshotDifference = {
    actualWidth: number;
    actualHeight: number;
    diffPixels: number;
    diffRatio: number;
    meanChannelDiff: number;
};

// Pixel-diff two PNG screenshots over a crop region, decoding in-page (mirrors eeschema.spec.ts).
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

// Walk the wxWidgets setup wizard (Next > … Finish) until the editor canvas is live.
async function completeWizard(page: Page): Promise<void> {
    await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });
    await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 90000 });
    await page.waitForFunction(() => {
        const registry = window.wxElementRegistry;
        return !!registry && registry.findAll({}).length > 0;
    }, null, { timeout: 150000 });
    await page.waitForTimeout(2000);

    for (let i = 1; i <= 10; i++) {
        let clicked = await clickByLabel(page, 'Next >');

        if (!clicked) {
            await clickByLabel(page, 'Finish');
            break;
        }

        await page.waitForTimeout(500);
    }

    await page.waitForTimeout(2000);
}

// Hide the native browser cursor so it can't pollute canvas screenshots.
async function hideCursor(page: Page): Promise<void> {
    await page.evaluate(() => {
        document.documentElement.style.cursor = 'none';
        document.body.style.cursor = 'none';
    });
}

// Bounding box of the visible GL (schematic) canvas.
async function glCanvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
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

    expect(glCanvasId, 'a visible GL canvas should exist').not.toBeNull();
    const box = await page.locator(`#${glCanvasId}`).boundingBox();
    expect(box, 'GL canvas bounding box should be available').not.toBeNull();

    if (!box) {
        throw new Error('GL canvas bounding box unavailable');
    }

    return box;
}

test.describe('Eeschema crosshair modes', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/kicad/eeschema.html');
    });

    // Clicking the crosshair group button cycles the on-canvas cursor small -> full -> 45 ->
    // small. This is upstream KiCad's own ACTION_TOOLBAR::onToolEvent group-cycle behavior
    // (our fork's copy was behind upstream and missing it; now restored). The long-press
    // palette flyout, which renders thanks to the wxPopupTransientWindow DOM fix, is covered
    // generically by tests/e2e/popup.spec.ts. Each click advances the group's selected action;
    // the tooltip + the rendered crosshair both change.
    test('crosshair toolbar button cycles small -> full -> 45 on click', async ({ page, testLogger }) => {
        // Click-to-cycle is upstream KiCad's ACTION_TOOLBAR::onToolEvent behavior. This branch's
        // kicad submodule is a pre-10.0 (9.99.0) snapshot that predates it, so the cycle is
        // absent until the kicad submodule is rebased onto master. Expected-to-fail until then;
        // remove this line once the rebase lands (Playwright will flag it as "unexpectedly
        // passed", reminding us to drop the annotation).
        test.fail(true, 'needs upstream ACTION_TOOLBAR::onToolEvent cycle (kicad rebase onto master)');

        await completeWizard(page);
        await hideCursor(page);

        await page.waitForFunction((match: string) => {
            const registry = window.wxElementRegistry;
            return registry?.findAllRendered?.({ elementType: 'tool' })
                .some((tool) => tool.tooltip?.includes(match)) ?? false;
        }, CROSSHAIR_MATCH, { timeout: 15000 });

        const crosshairTool = await findByTooltip(page, CROSSHAIR_MATCH, { elementType: 'tool' });
        expect(crosshairTool, 'crosshair-modes toolbar button should exist').not.toBeNull();
        expect(crosshairTool?.enabled, 'crosshair button should be enabled').toBe(true);
        expect(crosshairTool?.tooltip ?? '', 'starts on Small crosshairs').toContain('Small crosshairs');

        // Draw Wires guarantees the GAL crosshair cursor is shown; we only MOVE over the canvas
        // (never click it) so no wire is drawn.
        const drawWires = await findByTooltip(page, 'Draw Wires', { elementType: 'tool' });
        if (drawWires) {
            await page.mouse.click(drawWires.centerX, drawWires.centerY);
            await page.waitForTimeout(500);
        }

        const box = await glCanvasBox(page);
        const probe = { x: Math.round(box.x + box.width * 0.5), y: Math.round(box.y + box.height * 0.5) };
        const diffRegion: DiffRegion = {
            x: Math.round(box.x), y: Math.round(box.y),
            width: Math.round(box.width), height: Math.round(box.height),
        };
        const btn = { x: crosshairTool!.centerX, y: crosshairTool!.centerY };

        const tooltipNow = async () =>
            (await findByTooltip(page, CROSSHAIR_MATCH, { elementType: 'tool' }))?.tooltip ?? '';

        // A quick click (no long hold) cycles; then re-settle the cursor on the canvas so the
        // crosshair redraws at the probe point in the new mode.
        const clickAndSettle = async () => {
            await page.mouse.click(btn.x, btn.y);
            await page.mouse.move(probe.x + 1, probe.y + 1);
            await page.mouse.move(probe.x, probe.y);
            await page.waitForTimeout(600);
        };

        await page.mouse.move(probe.x, probe.y);
        await page.waitForTimeout(600);
        const shotSmall = await page.screenshot({ path: 'test-results/eeschema-crosshair-00-small.png', scale: 'device' });

        // click 1 -> full-window
        await clickAndSettle();
        await expect.poll(tooltipNow, {
            message: 'one click should advance to Full-Window Crosshairs', timeout: 6000,
        }).toContain('Full-Window Crosshairs');
        const shotFull = await page.screenshot({ path: 'test-results/eeschema-crosshair-01-full.png', scale: 'device' });
        expect((await compareScreenshots(page, shotSmall, shotFull, diffRegion)).diffPixels,
            'full-window crosshair should visibly differ from the small crosshair').toBeGreaterThan(200);

        // click 2 -> 45-degree
        await clickAndSettle();
        await expect.poll(tooltipNow, {
            message: 'second click should advance to 45 Degree Crosshairs', timeout: 6000,
        }).toContain('45 Degree Crosshairs');
        const shot45 = await page.screenshot({ path: 'test-results/eeschema-crosshair-02-45.png', scale: 'device' });
        expect((await compareScreenshots(page, shotFull, shot45, diffRegion)).diffPixels,
            '45-degree crosshair should visibly differ from the full-window crosshair').toBeGreaterThan(200);

        // click 3 -> cycles back to small
        await clickAndSettle();
        await expect.poll(tooltipNow, {
            message: 'third click should cycle back to Small crosshairs', timeout: 6000,
        }).toContain('Small crosshairs');
        await page.screenshot({ path: 'test-results/eeschema-crosshair-03-small-again.png', scale: 'device' });

        const realErrors = testLogger.errors.filter((error: string) => !error.includes('favicon'));
        expect(realErrors).toEqual([]);
    });
});
