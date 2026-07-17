/**
 * Churn-free baseline updater — "promote CI's render".
 *
 * CI's x86 render is the source of truth. This pulls a CI run's screenshots
 * (`gh run download`) — or a local dir via --from — and, for each one, overwrites
 * the committed baseline ONLY when the decoded pixels differ beyond the per-engine
 * floor. Unchanged baselines are left byte-identical (never re-encoded), so git
 * sees no churn. New shots are added; baselines with no render are reported as
 * removal candidates and only deleted with --prune.
 *
 * CLI (from tests/):
 *   tsx tools/screenshots/promote.ts --run <ci-run-id> [--repo owner/repo] [--prune] [--dry-run]
 *   tsx tools/screenshots/promote.ts --from <dir> [--prune] [--dry-run]
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { BASELINE_ROOT, MANIFEST_PATH, floorFor, isIgnored, listEngineKeys, splitKey, type Manifest } from './config';
import { writeManifest } from './gen-manifest';
import { diffImages, loadPng } from './image-ops';

/** key (`<engine>/<name>`) → absolute committed baseline path. */
function baselineIndex(root: string): Map<string, string> {
    const abs = path.join(root, BASELINE_ROOT);
    const index = new Map<string, string>();
    for (const key of listEngineKeys(abs)) index.set(key, path.join(abs, key));
    return index;
}

function loadManifest(root: string): Manifest | undefined {
    const p = path.join(root, MANIFEST_PATH);
    if (!fs.existsSync(p)) return undefined;
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8')) as Manifest;
    } catch {
        return undefined;
    }
}

/** Download a CI run's artifact and return the top-level test-results dir holding the shots. */
function downloadRun(runId: string, repo?: string): string {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-'));
    const repoArgs = repo ? ['--repo', repo] : [];
    execFileSync('gh', ['run', 'download', runId, '-D', tmp, ...repoArgs], { stdio: 'inherit' });
    // The artifact stores test-results/** — find that dir; its immediate *.png are the shots
    // (exclude the nested screenshot-diff/ triptychs).
    const stack = [tmp];
    while (stack.length) {
        const dir = stack.pop()!;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        if (path.basename(dir) === 'test-results') return dir;
        for (const e of entries) if (e.isDirectory()) stack.push(path.join(dir, e.name));
    }
    throw new Error(`no test-results/ dir found in the downloaded artifact under ${tmp}`);
}

type Plan = { updated: string[]; added: string[]; unchanged: string[]; removedCandidates: string[] };

function buildPlan(root: string, renderDir: string, manifest?: Manifest): { plan: Plan; apply: () => void } {
    const baselines = baselineIndex(root);
    const rendered = new Set(listEngineKeys(renderDir));
    // Never promote excluded screenshots (e.g. the flaky retinascale fullPage shot).
    for (const key of [...rendered]) if (isIgnored(key)) rendered.delete(key);
    for (const key of [...baselines.keys()]) if (isIgnored(key)) baselines.delete(key);
    const plan: Plan = { updated: [], added: [], unchanged: [], removedCandidates: [] };
    const actions: Array<() => void> = [];

    for (const key of rendered) {
        const src = path.join(renderDir, key);
        const existing = baselines.get(key);
        if (!existing) {
            const dest = path.join(root, BASELINE_ROOT, key);
            plan.added.push(key);
            actions.push(() => {
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                fs.copyFileSync(src, dest); // verbatim bytes
            });
            continue;
        }
        const d = diffImages(loadPng(existing), loadPng(src));
        const floor = floorFor(key);
        if (!d.dimsMatch || d.changedRatio > floor.changedRatio) {
            plan.updated.push(key);
            actions.push(() => fs.copyFileSync(src, existing)); // verbatim bytes, no re-encode → no churn
        } else {
            plan.unchanged.push(key); // leave the committed file untouched
        }
    }

    // Removal candidates: a committed baseline the manifest expects but this render didn't produce.
    for (const [key, abs] of baselines) {
        if (rendered.has(key)) continue;
        const { engine, name } = splitKey(key);
        if (manifest && !manifest.screenshots.some((e) => e.name === name && e.engine === engine)) continue;
        plan.removedCandidates.push(key);
        actions.push(() => {}); // pruning is opt-in (see main)
        void abs;
    }

    return { plan, apply: () => actions.forEach((a) => a()) };
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
    const out: Record<string, string | boolean> = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--run') out.run = argv[++i];
        else if (a === '--from') out.from = argv[++i];
        else if (a === '--repo') out.repo = argv[++i];
        else if (a === '--prune') out.prune = true;
        else if (a === '--dry-run') out.dryRun = true;
    }
    return out;
}

function main(): void {
    const args = parseArgs(process.argv.slice(2));
    const root = process.cwd();
    if (!args.run && !args.from) {
        console.error('usage: promote.ts --run <ci-run-id> [--repo owner/repo] | --from <dir> [--prune] [--dry-run]');
        process.exitCode = 2;
        return;
    }
    const renderDir = args.from ? (args.from as string) : downloadRun(args.run as string, args.repo as string);
    const manifest = loadManifest(root);
    const { plan, apply } = buildPlan(root, renderDir, manifest);

    console.log(
        `[promote] updated=${plan.updated.length} added=${plan.added.length} ` +
            `unchanged=${plan.unchanged.length} removal-candidates=${plan.removedCandidates.length}`
    );
    for (const n of plan.updated) console.log(`  UPDATE ${n}`);
    for (const n of plan.added) console.log(`  ADD    ${n}`);
    for (const n of plan.removedCandidates) console.log(`  REMOVE? ${n}${args.prune ? ' (pruning)' : ' (use --prune to delete)'}`);

    if (args.dryRun) {
        console.log('[promote] dry-run — no files written');
        return;
    }
    apply();
    if (args.prune) {
        const baselines = baselineIndex(root);
        for (const n of plan.removedCandidates) fs.rmSync(baselines.get(n)!, { force: true });
    }
    // Keep the manifest in lockstep with the baseline tree — a stale manifest silently
    // disables removed-screenshot detection for anything added after the last regen.
    writeManifest(root);
    console.log('[promote] done (manifest regenerated) — review `git status` and commit');
}

if (require.main === module) main();
