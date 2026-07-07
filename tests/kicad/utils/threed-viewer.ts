import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { clickMenuBarItem, clickMenuItemByText, waitUntil } from '../../e2e/utils/element-tracker';
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
    await clickMenuItemByText(page, 'Open');

    await page.waitForFunction(() => {
        const registry = window.wxElementRegistry;
        return !!registry && registry.findAll({ visible: true })
            .some((el) => el.typeName === 'wxFileDialog');
    }, null, { timeout: 15000 });
    // Wait for the filename text input to paint (replaces a fixed 1000ms).
    await waitUntil(page, () => {
        const r = window.wxElementRegistry;
        return !!r && r.findAll({ visible: true }).some((el) => el.typeName === 'wxTextCtrl' && el.name === 'text');
    }, 'file dialog filename input');

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
    // Documented interaction dwells: focus + typed-text registration have no observable signal.
    await page.waitForTimeout(200); // eslint-disable-line -- documented interaction dwell
    await page.keyboard.type(pcbFilename);
    await page.waitForTimeout(300); // eslint-disable-line -- documented interaction dwell
    await page.keyboard.press('Enter');

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
    // Open View → 3D Viewer deterministically (clickMenuItemByText waits for the item to
    // render, then clicks — no fixed post-menu sleep and no Alt+3 fallback that could mask
    // a real menu regression).
    expect(await clickMenuBarItem(page, 'View'), 'View menu should be findable').toBe(true);
    await clickMenuItemByText(page, '3D Viewer');

    // 180s (not 60s): opening the viewer kicks the scene build + first render. On CI
    // (headless SwiftShader software WebGL, 30 contended vCPUs) the raytracer-era run
    // 28649537489 opened in <60s but with little margin; a real GPU returns in ~2s. The
    // larger cap is CI headroom only — it never slows a passing run.
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

// Wait until the NEWEST glcanvas actually shows a rendered scene (> minColors distinct
// colours on a 16×16 grid) instead of sleeping a fixed interval. The viewer's first frame
// can lag the canvas's creation, especially on CI's software WebGL under parallel load —
// sampling too early reads an all-black backbuffer, which is exactly main's live 3D flake
// (run 28698861536: 3d-viewer.spec:26 flaky; run 28666407570: the deadlock spec red with an
// all-zero pixel signature). One full-frame read per 1s poll on a CPU-backed 2D canvas —
// NOT per-pixel getImageData calls, which are a GPU round-trip each and stall SwiftShader
// ("GPU stall due to ReadPixels").
export async function waitForThreeDRender(
    page: Page, minColors = 8, timeoutMs = 90000,
): Promise<void> {
    await page.waitForFunction((min: number) => {
        const list = document.querySelectorAll('canvas[id^="glcanvas-"]');
        const el = list[list.length - 1] as HTMLCanvasElement | undefined;
        if (!el || !el.width || !el.height) return false;
        const tmp = document.createElement('canvas');
        tmp.width = el.width; tmp.height = el.height;
        const ctx = tmp.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(el, 0, 0);
        const img = ctx.getImageData(0, 0, el.width, el.height).data;
        const colors = new Set<string>();
        for (let i = 0; i < 16; i++) {
            for (let j = 0; j < 16; j++) {
                const p = (Math.floor(el.height * j / 16) * el.width
                         + Math.floor(el.width * i / 16)) * 4;
                colors.add(`${img[p]},${img[p + 1]},${img[p + 2]}`);
            }
        }
        return colors.size > min;
    }, minColors, { timeout: timeoutMs, polling: 1000 });
}
