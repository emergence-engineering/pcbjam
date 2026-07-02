/**
 * Generate tests/screenshot-manifest.json — the canonical list of expected
 * screenshots + the engine that renders each.
 *
 * The NAME list is authoritative (it's the committed baseline set) and is what
 * lets compare/promote tell an intentional REMOVAL from a flaky/absent render.
 * The ENGINE tag is best-effort (spec-map.ts attributes each name to the spec that
 * writes it, and that spec's project/engine) and only feeds the per-engine floors.
 *
 * CLI (from tests/):  tsx tools/screenshots/gen-manifest.ts [--check]
 *   --check exits 1 if the committed manifest is stale (for CI hygiene).
 */
import * as fs from 'fs';
import * as path from 'path';
import { BASELINE_DIRS, MANIFEST_PATH, isIgnored, type Manifest } from './config';
import { buildSpecResolver } from './spec-map';

function listBaselines(root: string): string[] {
    const names = new Set<string>();
    for (const dir of BASELINE_DIRS) {
        const abs = path.join(root, dir);
        if (!fs.existsSync(abs)) continue;
        for (const f of fs.readdirSync(abs)) if (f.toLowerCase().endsWith('.png') && !isIgnored(f)) names.add(f);
    }
    return [...names].sort();
}

function main(): void {
    const check = process.argv.includes('--check');
    const root = process.cwd();
    const resolver = buildSpecResolver(root);

    let unmatched = 0;
    const screenshots = listBaselines(root).map((name) => {
        if (resolver.specFor(name) === null) unmatched++;
        return { name, engine: resolver.engineFor(name) };
    });

    const manifest: Manifest & { _note: string } = {
        _note: 'engine tags are best-effort (spec-map.ts); the name list is authoritative. Refine engines after calibration.',
        screenshots,
    };
    const json = JSON.stringify(manifest, null, 2) + '\n';
    const outPath = path.join(root, MANIFEST_PATH);

    const dist = screenshots.reduce<Record<string, number>>((d, s) => ((d[s.engine] = (d[s.engine] ?? 0) + 1), d), {});
    console.log(`[manifest] ${screenshots.length} screenshots; engines=${JSON.stringify(dist)}; default-assigned=${unmatched}`);

    if (check) {
        const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
        if (current !== json) {
            console.error('[manifest] STALE — run `npm run screenshots:manifest` and commit');
            process.exitCode = 1;
        } else {
            console.log('[manifest] up to date');
        }
        return;
    }
    fs.writeFileSync(outPath, json);
    console.log(`[manifest] wrote ${MANIFEST_PATH}`);
}

if (require.main === module) main();
