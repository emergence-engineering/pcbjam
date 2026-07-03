import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { clickMenuBarItem, clickMenuItem } from '../e2e/utils/element-tracker';
import { injectFromSubmodule } from './utils/fs-inject';
import { waitForBoardLoaded } from './utils/board-ready';
import { waitForPcbnew } from './utils/pcbnew-ready';

/**
 * STEP export through the occ_service worker (docs/features/occ-split/):
 * pcbnew.wasm carries no OCC — DIALOG_EXPORT_STEP's browser branch runs
 * EXPORTER_STEP, whose WASM shadow suspends via EM_ASYNC_JS and hands the
 * job to `globalThis.occService` (worker with its own OCC-linked module).
 *
 * Asserted end to end:
 *   1. occ_service.{js,wasm} is NOT fetched at boot or board load — only the
 *      export click triggers it (the lazy-load boundary).
 *   2. The (unchanged) export dialog drives the whole chain: menu → dialog →
 *      Export button → worker → STEP bytes.
 *   3. The result is a real STEP file (ISO-10303-21 magic, non-trivial size),
 *      captured by the provider stub where the app would download it.
 */

const KICAD_VERSION_DIR = '10.0';
const PROJECT_DIR_MEMFS = `/home/kicad/documents/kicad/${KICAD_VERSION_DIR}/projects`;

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

/** Click a visible wx button by label; returns whether it was found. */
async function clickWxButton(page: Page, label: string): Promise<boolean> {
    const pos = await page.evaluate((wanted: string) => {
        const registry = window.wxElementRegistry;
        if (!registry) return null;
        const el = registry.findAll({ visible: true })
            .find((e) => (e.label === wanted || e.label === `&${wanted}`)
                && (e.typeName ?? '').includes('Button'));
        return el ? { x: el.centerX, y: el.centerY } : null;
    }, label);
    if (!pos) return false;
    await page.mouse.click(pos.x, pos.y);
    return true;
}

test.describe('OCC export via occ_service worker', () => {
    test.describe.configure({ mode: 'serial' });
    test.setTimeout(240000);

    test('export dialog produces a valid STEP; occ_service fetches lazily', async ({ page, testLogger }) => {
        // Track occ_service fetches from the very start — the lazy boundary is
        // the core assertion.
        const occFetches: string[] = [];
        page.on('request', (r) => {
            if (r.url().includes('occ_service')) occFetches.push(r.url());
        });

        await page.goto('/kicad/pcbnew.html');
        await waitForPcbnew(page);
        await loadBoard(page, testLogger);

        expect(occFetches, 'occ_service must NOT be fetched before the export').toHaveLength(0);

        // File → Export → STEP/GLB/…
        expect(await clickMenuBarItem(page, 'File'), 'File menu').toBe(true);
        await page.waitForTimeout(400);
        expect(await clickMenuItem(page, 'Export'), 'Export submenu').toBe(true);
        await page.waitForTimeout(400);
        expect(await clickMenuItem(page, 'STEP/GLB/BREP/XAO/PLY/STL...'),
            'STEP export menu item').toBe(true);

        // The (unchanged) DIALOG_EXPORT_STEP: wait for its Export button.
        await page.waitForFunction(() => {
            const registry = window.wxElementRegistry;
            return !!registry && registry.findAll({ visible: true })
                .some((el) => (el.label === 'Export' || el.label === '&Export')
                    && (el.typeName ?? '').includes('Button'));
        }, null, { timeout: 20000 });
        await page.waitForTimeout(800);
        await page.screenshot({ path: 'test-results/occ-export-dialog.png', scale: 'css' });

        expect(await clickWxButton(page, 'Export'), 'Export button click').toBe(true);

        // The provider stub captures the bytes where the app would download.
        await page.waitForFunction(
            () => ((window as any).__occExports?.length ?? 0) > 0,
            null, { timeout: 180000 });

        const exports = await page.evaluate(() => (window as any).__occExports as Array<{
            name: string; size: number; magic: string;
        }>);
        console.log(`[TEST] captured exports: ${JSON.stringify(exports)}`);

        expect(exports).toHaveLength(1);
        expect(exports[0].name, 'download name comes from the dialog')
            .toMatch(/\.step$/i);
        expect(exports[0].magic.startsWith('ISO-10303-21'), 'STEP magic').toBe(true);
        expect(exports[0].size, 'non-trivial STEP body').toBeGreaterThan(10_000);

        expect(occFetches.length, 'occ_service was fetched lazily by the export')
            .toBeGreaterThan(0);

        // Dismiss the "Export complete" report dialog if present.
        await page.waitForTimeout(1000);
        await clickWxButton(page, 'OK');

        await page.screenshot({ path: 'test-results/occ-export-done.png', scale: 'css' });
    });
});
