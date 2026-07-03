import * as fs from 'fs';
import * as path from 'path';
import type { Page } from '@playwright/test';

/**
 * Install a REAL `globalThis.occService` provider into a harness page — the
 * same worker-backed occ_service boot the standalone app does, minus the CDN
 * manifest resolution: the harness serves occ_service.{js,wasm} same-origin
 * next to the tool page (tests/scripts/setup-kicad-wasm.sh copies them from
 * output/).
 *
 * The worker-side wrapper is the SHARED source of truth
 * (web/standalone/src/wasm/occ-worker.js — the standalone imports it via vite
 * `?raw`; the harness reads it off disk and injects it verbatim), so the
 * trap-prone boot logic (blob worker + locateFile absolutization + pthread
 * mainScriptUrlOrBlob) cannot drift between app and tests.
 *
 * Differences from the app provider, for assertability:
 *  - export results are captured into window.__occExports (name, size, magic
 *    prefix) instead of triggering a browser download;
 *  - installed as an init script (kicad fixtures do this for every page), so
 *    it exists from document start on every navigation — standalone parity,
 *    where boot.ts installs the provider whenever the editor bundle boots.
 *
 * The worker fetches occ_service.js lazily on the FIRST request — specs can
 * assert the lazy-load boundary by watching network requests.
 */

const OCC_WORKER_SRC = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '..',
        'web', 'standalone', 'src', 'wasm', 'occ-worker.js'),
    'utf8');

export async function installOccServiceStub(page: Page): Promise<void> {
    await page.addInitScript((workerSrc: string) => {
        if ((globalThis as any).occService) return;

        (window as any).__occExports = [];

        let workerP: Promise<Worker> | null = null;
        const pending = new Map<number, (res: any) => void>();
        let nextId = 1;

        const ensureWorker = (): Promise<Worker> => {
            if (!workerP) {
                workerP = (async () => {
                    const glue = new URL('occ_service.js', window.location.href).href;
                    console.log(`[TEST-OCC] booting occ_service from ${glue}`);
                    const worker = new Worker(URL.createObjectURL(new Blob(
                        [`self.OCC_GLUE_URL = ${JSON.stringify(glue)};\n`, workerSrc],
                        { type: 'text/javascript' })));
                    worker.onmessage = (e) => {
                        const { id, res } = e.data ?? {};
                        if (typeof id !== 'number') return;
                        const resolve = pending.get(id);
                        if (resolve) { pending.delete(id); resolve(res); }
                    };
                    await new Promise<void>((resolve, reject) => {
                        const onFirst = (e: MessageEvent) => {
                            if (e.data?.ready) { worker.removeEventListener('message', onFirst); resolve(); }
                            else if (e.data?.bootError) reject(new Error(e.data.bootError));
                        };
                        worker.addEventListener('message', onFirst);
                    });
                    console.log('[TEST-OCC] occ_service ready');
                    return worker;
                })().catch((e) => { workerP = null; throw e; });
            }
            return workerP;
        };

        const request = async (req: any) => {
            let worker: Worker;
            try {
                worker = await ensureWorker();
            } catch (e) {
                return { ok: false, report: `occ_service unavailable: ${e}` };
            }
            const id = nextId++;
            const transfer = req.kind === 'export' ? [req.board.buffer] : [req.bytes.buffer];
            const res: any = await new Promise((resolve) => {
                pending.set(id, resolve);
                worker.postMessage({ id, req }, transfer);
            });
            if (req.kind === 'export') {
                if (res.ok && res.bytes?.length) {
                    const magic = new TextDecoder().decode(res.bytes.slice(0, 16));
                    (window as any).__occExports.push({
                        name: req.fileName || res.fileName,
                        size: res.bytes.length,
                        magic,
                    });
                    console.log(`[TEST-OCC] export captured: ${req.fileName} ${res.bytes.length}B "${magic}"`);
                }
                return { ok: res.ok, report: res.report, fileName: res.fileName };
            }
            return res;
        };

        (globalThis as any).occService = { request };
    }, OCC_WORKER_SRC);
}
