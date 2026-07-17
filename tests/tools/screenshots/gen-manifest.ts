/**
 * Generate tests/screenshot-manifest.json — the canonical list of expected
 * screenshots. Each entry is {name, engine}, read STRAIGHT from the per-engine
 * baseline tree (baseline-screenshots/<engine>/<name>.png) — the engine is the
 * directory, no spec-scanning guesswork.
 *
 * The list is what lets compare/promote tell an intentional REMOVAL from a
 * flaky/absent render. promote.ts regenerates it automatically after applying;
 * --check keeps CI honest if baselines are ever edited by hand.
 *
 * CLI (from tests/):  tsx tools/screenshots/gen-manifest.ts [--check]
 *   --check exits 1 if the committed manifest is stale (for CI hygiene).
 */
import * as fs from 'fs';
import * as path from 'path';
import { BASELINE_ROOT, MANIFEST_PATH, isIgnored, listEngineKeys, splitKey, type Manifest } from './config';

/** Render the manifest JSON for the current baseline tree. */
export function manifestJson(root: string): string {
    const screenshots = listEngineKeys(path.join(root, BASELINE_ROOT))
        .filter((key) => !isIgnored(key))
        .map((key) => splitKey(key))
        .map(({ engine, name }) => ({ name, engine }))
        .sort((a, b) => a.engine.localeCompare(b.engine) || a.name.localeCompare(b.name));

    const manifest: Manifest & { _note: string } = {
        _note: 'Generated from baseline-screenshots/<engine>/ — run `npm run screenshots:manifest`. The name list is authoritative for removed-screenshot detection.',
        screenshots,
    };
    return JSON.stringify(manifest, null, 2) + '\n';
}

/** Regenerate the manifest on disk (used by the CLI and by promote.ts after apply). */
export function writeManifest(root: string): void {
    fs.writeFileSync(path.join(root, MANIFEST_PATH), manifestJson(root));
}

function main(): void {
    const check = process.argv.includes('--check');
    const root = process.cwd();
    const json = manifestJson(root);
    const outPath = path.join(root, MANIFEST_PATH);
    const count = (JSON.parse(json) as Manifest).screenshots.length;

    console.log(`[manifest] ${count} screenshots across engines`);

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
