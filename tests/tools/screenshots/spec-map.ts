/**
 * Resolve a screenshot name → the spec that writes it (and the engine that renders
 * it), by scanning the specs for `page.screenshot({ path: 'test-results/<prefix>…' })`
 * literals. Shared by gen-manifest.ts (engine tags) and compare/changelog (caption
 * labels).
 *
 * Attribution is longest-prefix (`pcbnew-loaded` → the spec that writes `pcbnew-…`).
 * Names written only by a helper (e.g. `wizard-*` via completeWizard, which lives in
 * a util not a *.spec.ts) don't match → specFor returns null (the caption then just
 * shows the name).
 */
import * as fs from 'fs';
import * as path from 'path';

export const CHROMIUM = 'chromium-swiftshader';
export const FIREFOX = 'firefox-llvmpipe';
export const DEFAULT_ENGINE = CHROMIUM; // baseline-screenshots is dominated by the wx suite

function listSpecs(dir: string): string[] {
    const out: string[] = [];
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...listSpecs(p));
        // Only *.spec.ts — a literal in a util would be mis-attributed to the util's dir.
        else if (e.name.endsWith('.spec.ts')) out.push(p);
    }
    return out;
}

/** pcbnew-family spec basenames (routed to chromium-ci on CI), read from the config. */
function pcbnewFamily(root: string): Set<string> {
    const cfg = fs.readFileSync(path.join(root, 'playwright-kicad.config.ts'), 'utf8');
    const block = cfg.match(/PCBNEW_FAMILY_SPECS\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
    return new Set([...block.matchAll(/'[^']*?([\w.-]+\.spec\.ts)'/g)].map((m) => m[1]));
}

function engineForSpec(root: string, specPath: string, family: Set<string>): string {
    const rel = path.relative(root, specPath);
    const base = path.basename(specPath);
    if (rel.startsWith('e2e/')) return CHROMIUM;
    if (rel.startsWith('web/')) return FIREFOX;
    if (rel.startsWith('kicad/')) return family.has(base) ? CHROMIUM : FIREFOX;
    return DEFAULT_ENGINE;
}

type PrefixEntry = { prefix: string; engine: string; spec: string };

/** prefix → {engine, spec-rel-to-tests}, longest-prefix first. */
function prefixMap(root: string, family: Set<string>): PrefixEntry[] {
    const map = new Map<string, { engine: string; spec: string }>();
    for (const dir of ['e2e', 'kicad', 'web']) {
        for (const spec of listSpecs(path.join(root, dir))) {
            const engine = engineForSpec(root, spec, family);
            const rel = path.relative(root, spec); // e.g. 'kicad/pcbnew.spec.ts'
            const content = fs.readFileSync(spec, 'utf8');
            for (const m of content.matchAll(/test-results\/([A-Za-z0-9_-]+)/g)) {
                const prefix = m[1];
                if (!map.has(prefix)) map.set(prefix, { engine, spec: rel }); // first writer wins
            }
        }
    }
    return [...map.entries()]
        .map(([prefix, v]) => ({ prefix, ...v }))
        .sort((a, b) => b.prefix.length - a.prefix.length);
}

export type SpecResolver = { specFor(name: string): string | null; engineFor(name: string): string };

/** Build a name→spec/engine resolver by scanning the specs under `root` once. */
export function buildSpecResolver(root: string): SpecResolver {
    const prefixes = prefixMap(root, pcbnewFamily(root));
    const match = (name: string): PrefixEntry | undefined => {
        const stem = name.replace(/\.png$/i, '');
        return prefixes.find((p) => stem === p.prefix || stem.startsWith(p.prefix));
    };
    return {
        specFor: (name) => match(name)?.spec ?? null,
        engineFor: (name) => match(name)?.engine ?? DEFAULT_ENGINE,
    };
}
