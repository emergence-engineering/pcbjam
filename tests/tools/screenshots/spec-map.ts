/**
 * Resolve a screenshot name → the spec that writes it, by scanning the specs for
 * screenshot-name literals. Used by compare/changelog for the caption strip only —
 * the ENGINE of a screenshot is the directory it lives in (test-results/<engine>/,
 * baseline-screenshots/<engine>/), never guessed from specs.
 *
 * Two literal shapes are scanned:
 *   - stableShot(page, 'name.png' …) / shotPath(page, 'name.png')  — the standard writers
 *   - 'test-results/<prefix>'                                       — legacy direct paths
 *
 * Attribution is longest-prefix (`pcbnew-loaded` → the spec that writes `pcbnew-…`).
 * Names written only by a helper (e.g. `wizard-*` via completeWizard, which lives in
 * a util not a *.spec.ts) don't match → specFor returns null (the caption then just
 * shows the name).
 */
import * as fs from 'fs';
import * as path from 'path';

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

type PrefixEntry = { prefix: string; spec: string };

/** prefix → spec-rel-to-tests, longest-prefix first. */
function prefixMap(root: string): PrefixEntry[] {
    const map = new Map<string, string>();
    for (const dir of ['e2e', 'kicad', 'web']) {
        for (const spec of listSpecs(path.join(root, dir))) {
            const rel = path.relative(root, spec); // e.g. 'kicad/pcbnew.spec.ts'
            const content = fs.readFileSync(spec, 'utf8');
            const add = (prefix: string) => {
                if (prefix && !map.has(prefix)) map.set(prefix, rel); // first writer wins
            };
            // stableShot(page, 'name.png') / shotPath(page, `name-${x}.png`)
            for (const m of content.matchAll(/(?:stableShot|shotPath)\(\s*\w+,\s*[`']([A-Za-z0-9_-]+)/g)) add(m[1]);
            // legacy direct 'test-results/<prefix>' literals
            for (const m of content.matchAll(/test-results\/([A-Za-z0-9_-]+)/g)) add(m[1]);
        }
    }
    return [...map.entries()]
        .map(([prefix, spec]) => ({ prefix, spec }))
        .sort((a, b) => b.prefix.length - a.prefix.length);
}

export type SpecResolver = { specFor(name: string): string | null };

/** Build a name→spec resolver by scanning the specs under `root` once. */
export function buildSpecResolver(root: string): SpecResolver {
    const prefixes = prefixMap(root);
    return {
        specFor: (name) => {
            const stem = name.replace(/\.png$/i, '');
            return prefixes.find((p) => stem === p.prefix || stem.startsWith(p.prefix))?.spec ?? null;
        },
    };
}
