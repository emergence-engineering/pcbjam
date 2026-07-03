import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { clickMenuBarItem, clickMenuItem } from '../../e2e/utils/element-tracker';
import { injectFromSubmodule } from './fs-inject';
import { waitForBoardLoaded } from './board-ready';

// Shared helpers for the 3D-viewer specs (3d-viewer.spec.ts + 3d-viewer-deadlock.spec.ts).

// KiCad 10 stores projects under /home/kicad/documents/kicad/10.0/projects.
export const KICAD_VERSION_DIR = '10.0';
export const PROJECT_DIR_MEMFS = `/home/kicad/documents/kicad/${KICAD_VERSION_DIR}/projects`;

// pic_programmer frames correctly in the default 3D camera (the microwave demo
// has a known board-bounding-box scale bug that projects it off-screen — a
// separate follow-up). Loads cleanly in this harness (see 2D load tests).
export const DEMO = { name: 'pic_programmer', dir: 'pic_programmer', stem: 'pic_programmer' } as const;

export async function loadBoard(
    page: Page,
    testLogger: { consoleLogs: string[]; errors: string[] },
): Promise<void> {
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

export function countGlCanvases(page: Page): Promise<number> {
    return page.evaluate(() => document.querySelectorAll('canvas[id^="glcanvas-"]').length);
}

// Resource-diagnostic snapshot for the heavy 3D-viewer specs. On CI these can kill the tab
// (renderer OOM, a lost WebGL context when the shared GPU process passes its ~16-context cap,
// or a raytracer pthread deadlock) and the failure surfaces identically ("Target crashed" /
// black canvas). Logging hardwareConcurrency, the emscripten pthread-pool ledger, the live
// GL-canvas count, and the wasm/JS heap sizes right before an interaction makes any recurrence
// attributable (GL-context exhaustion vs heap-OOM vs deadlock) — and confirms, on the real CI
// VM, what navigator.hardwareConcurrency actually is (the whole 2N+8 pool sizing depends on it).
// Best-effort: never throws, so it can't itself fail a spec.
export async function logThreeDDiag(page: Page, label: string): Promise<void> {
    const snap = await page.evaluate(() => {
        const w = window as unknown as { Module?: Record<string, unknown> };
        const M = (w.Module ?? {}) as Record<string, unknown>;
        const P = (M.PThread ?? {}) as { unusedWorkers?: unknown[]; runningWorkers?: unknown[] };
        const heap = M.HEAPU8 as { length?: number } | undefined;
        const perf = (performance as unknown as { memory?: Record<string, number> }).memory ?? {};
        const mb = (b?: number) => (typeof b === 'number' ? Math.round(b / 1048576) : null);
        return {
            hardwareConcurrency: navigator.hardwareConcurrency,
            // emscripten pool ledger: pre-warmed-but-idle + currently-running Workers.
            pthreadUnused: Array.isArray(P.unusedWorkers) ? P.unusedWorkers.length : null,
            pthreadRunning: Array.isArray(P.runningWorkers) ? P.runningWorkers.length : null,
            glCanvases: document.querySelectorAll('canvas[id^="glcanvas-"]').length,
            canvases: document.querySelectorAll('canvas').length,
            wasmHeapMB: mb(heap?.length),
            jsHeapUsedMB: mb(perf.usedJSHeapSize),
            jsHeapLimitMB: mb(perf.jsHeapSizeLimit),
        };
    }).catch((e: unknown) => ({ error: String(e) }));
    console.log(`[DIAG ${label}] ${JSON.stringify(snap)}`);
}

// Open the 3D viewer (View → 3D Viewer, with an Alt+3 fallback) and wait for the
// secondary frame + its NEW `glcanvas-*` to appear. The main pcbnew board view is
// itself a wxGLCanvas, so the viewer is detected by the GL-canvas COUNT increasing.
// Returns the glcanvas count after opening. `glBefore` is the count beforehand.
export async function openThreeDViewer(page: Page, glBefore: number): Promise<number> {
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

    // 180s (not 60s): opening the viewer kicks the FIRST full board raytrace, which on CI's
    // software WebGL (Mesa llvmpipe, GPU-less VM) takes ~60s — right at the old limit. Real GPU
    // returns in ~2s, so the larger cap is only a CI headroom.
    await page.waitForFunction(() => {
        // A new top-level window div beyond the main pcbnew frame.
        return !!document.querySelector('#window-container [id^="window-"]')
            || document.querySelectorAll('canvas[id^="glcanvas-"]').length > 0;
    }, null, { timeout: 180000 });

    await page.waitForFunction((before: number) =>
        document.querySelectorAll('canvas[id^="glcanvas-"]').length > before,
        glBefore, { timeout: 180000 });

    const glAfter = await countGlCanvases(page);
    console.log(`[TEST] glcanvas count after opening 3D viewer: ${glAfter}`);
    expect(glAfter, 'a new WebGL canvas should appear for the 3D viewer').toBeGreaterThan(glBefore);
    return glAfter;
}
