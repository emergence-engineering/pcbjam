import { test, expect } from './fixtures';
import { shotPath } from '../e2e/utils/element-tracker';

/**
 * Minimal occ_service probe (no pcbnew boot): drive occExport directly from
 * the page with a small fixture board, in whatever engine the project runs.
 * Isolates worker/module behavior from the editor entirely — when export
 * breaks, it answers "service module or editor-side bridge?" in seconds.
 * The provider itself arrives via the fixtures' ambient init script.
 */
test.describe('occ_service probe', () => {
    test.setTimeout(180000);

    test('occExport of the demo board completes', async ({ page }) => {
        // Any harness page gives the COI (COOP/COEP) context; don't wait for wasm.
        await page.goto('/kicad/pcbnew.html', { waitUntil: 'domcontentloaded' });

        const fs = require('fs') as typeof import('fs');
        const path = require('path') as typeof import('path');
        const board = fs.readFileSync(
            path.resolve(__dirname, '..', 'fixtures', 'demo', 'demo.kicad_pcb'), 'utf8');

        const res = await page.evaluate(async (boardText: string) => {
            const svc = (globalThis as any).occService;
            const bytes = new TextEncoder().encode(boardText);
            const t0 = performance.now();
            const r = await svc.request({
                kind: 'export', board: bytes,
                jobJson: JSON.stringify({ format: 'step' }),
                fileName: 'probe.step',
            });
            return { ok: r.ok, report: r.report, ms: Math.round(performance.now() - t0) };
        }, board);

        console.log(`[PROBE] ok=${res.ok} in ${res.ms}ms report=${(res.report || '').slice(0, 300)}`);
        const captured = await page.evaluate(() => (window as any).__occExports);
        console.log(`[PROBE] captured: ${JSON.stringify(captured)}`);
        await page.screenshot({ path: shotPath(page, 'occ-probe-done.png'), scale: 'css' });
        expect(res.ok, 'demo board exports').toBe(true);
    });

    // Every format the export dialog offers must round-trip through the worker.
    // Validated against kicad-cli 10.0.4 (2026-07-03): STEP/STPZ/BREP/XAO/PLY/
    // STL/GLB geometrically exact-equal; U3D same structure (quantizer float
    // LSBs differ cross-platform); PDF structurally equal. GLB regressed once
    // already (OCC built without RapidJSON compiles the glTF writer out) —
    // this matrix is the net for that class of build-flag loss.
    test('format matrix: every dialog format exports through the worker', async ({ page }) => {
        await page.goto('/kicad/pcbnew.html', { waitUntil: 'domcontentloaded' });

        const fs = require('fs') as typeof import('fs');
        const path = require('path') as typeof import('path');
        const board = fs.readFileSync(
            path.resolve(__dirname, '..', 'fixtures', 'demo', 'demo.kicad_pcb'), 'utf8');

        // format -> expected magic prefix of the produced bytes (utf8-decoded).
        const TEXT_MAGIC: Record<string, string> = {
            step: 'ISO-10303-21',
            // The file leads with "\nCASCADE Topology V1…" and the stub captures
            // only 16 bytes — match the leading-newline-trimmed prefix.
            brep: 'CASCADE Topolog',
            xao: '<?xml',
            ply: 'ply',
            stl: 'solid',
            glb: 'glTF',
            u3d: 'U3D',
            pdf: '%PDF',
        };

        for (const [fmt, magic] of Object.entries(TEXT_MAGIC)) {
            const r = await page.evaluate(async ({ boardText, fmt }) => {
                const svc = (globalThis as any).occService;
                return await svc.request({
                    kind: 'export',
                    board: new TextEncoder().encode(boardText),
                    jobJson: JSON.stringify({ format: fmt, export_components: false }),
                    fileName: `probe.${fmt}`,
                });
            }, { boardText: board, fmt });
            expect(r.ok, `${fmt} export reports ok`).toBe(true);
        }

        // stpz is gzip — binary magic, checked by charcode below.
        const rz = await page.evaluate(async (boardText: string) => {
            const svc = (globalThis as any).occService;
            return await svc.request({
                kind: 'export',
                board: new TextEncoder().encode(boardText),
                jobJson: JSON.stringify({ format: 'stpz', export_components: false }),
                fileName: 'probe.stpz',
            });
        }, board);
        expect(rz.ok, 'stpz export reports ok').toBe(true);

        const captured: Array<{ name: string; size: number; magic: string }> =
            await page.evaluate(() => (window as any).__occExports);
        console.log(`[PROBE] formats captured: ${JSON.stringify(captured.map(
            (c) => ({ name: c.name, size: c.size })))}`);

        for (const [fmt, magic] of Object.entries(TEXT_MAGIC)) {
            const hit = captured.find((c) => c.name === `probe.${fmt}`);
            expect(hit, `${fmt} bytes captured`).toBeTruthy();
            expect(hit!.magic.trimStart().startsWith(magic), `${fmt} magic "${magic}"`).toBe(true);
            expect(hit!.size, `${fmt} non-trivial size`).toBeGreaterThan(1000);
        }
        const z = captured.find((c) => c.name === 'probe.stpz');
        expect(z, 'stpz bytes captured').toBeTruthy();
        expect(z!.magic.charCodeAt(0), 'stpz gzip magic byte 0').toBe(0x1f);
        expect(z!.size, 'stpz non-trivial size').toBeGreaterThan(1000);
    });
});
