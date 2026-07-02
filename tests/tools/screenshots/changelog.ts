/**
 * Baseline changelog (Discord trigger B) — no build, no GPU.
 *
 * On push to main, diff the committed baseline PNGs between two commits and post
 * a "Baseline changelog" to Discord: a triptych (old | new+boxes | heatmap) for
 * each CHANGED file, the image for each ADDED, and a titled line for each REMOVED.
 * "added / removed" only mean anything as a git-history diff, which is why this is
 * separate from the re-render drift gate.
 *
 * CLI (from tests/):
 *   tsx tools/screenshots/changelog.ts [--base REV] [--head REV] [--dry-run] [--force]
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { PNG } from 'pngjs';
import { BASELINE_DIRS, DIFF_OUT_DIR, floorFor, labelText, LABEL } from './config';
import { comparePair, type Report } from './compare';
import { loadPng, savePng, withBottomLabel } from './image-ops';
import { buildSpecResolver } from './spec-map';
import { buildAttachments, paginate, postMessage } from './post-discord';

function git(root: string, args: string[]): string {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function gitBlob(root: string, rev: string, repoPath: string): Buffer | null {
    try {
        return execFileSync('git', ['-C', root, 'show', `${rev}:${repoPath}`], { maxBuffer: 1 << 28 });
    } catch {
        return null;
    }
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
    const out: Record<string, string | boolean> = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dry-run') out.dryRun = true;
        else if (a === '--force') out.force = true;
        else if (a === '--base') out.base = argv[++i];
        else if (a === '--head') out.head = argv[++i];
    }
    return out;
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const cwd = process.cwd();
    const repoRoot = git(cwd, ['rev-parse', '--show-toplevel']);
    const head = (args.head as string) || 'HEAD';
    let base = (args.base as string) || '';
    if (!base) {
        try {
            base = git(cwd, ['rev-parse', `${head}^`]);
        } catch {
            console.log('[changelog] no parent commit — nothing to diff');
            return;
        }
    }

    // Repo-relative baseline dir prefixes (e.g. tests/baseline-screenshots).
    const prefixes = BASELINE_DIRS.map((d) => path.relative(repoRoot, path.join(cwd, d)));
    const diff = git(repoRoot, ['diff', '--name-status', base, head, '--', ...prefixes]);
    if (!diff) {
        console.log('[changelog] no baseline changes between', base.slice(0, 7), 'and', head);
        return;
    }

    const outDir = path.join(cwd, DIFF_OUT_DIR);
    fs.mkdirSync(outDir, { recursive: true });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-'));
    const report: Report = {
        generatedFor: process.env.GITHUB_SHA || head,
        changed: [],
        added: [],
        removed: [],
        unchangedCount: 0,
        driftLikely: false,
    };
    const { specFor } = buildSpecResolver(cwd);

    // Load a git blob (a committed PNG at `rev`) as a decoded PNG, or null if absent.
    const blobPng = (rev: string, p: string): PNG | null => {
        const b = gitBlob(repoRoot, rev, p);
        if (!b) return null;
        const f = path.join(tmp, `${rev.slice(0, 7)}-${path.basename(p)}`);
        fs.writeFileSync(f, b);
        return loadPng(f);
    };
    // Save a single captioned image (added/removed) and record it in the report.
    const saveSingle = (img: PNG, name: string, status: 'added' | 'removed'): void => {
        const suffix = status === 'added' ? 'added' : 'removed';
        const rel = path.join(DIFF_OUT_DIR, `${name}.${suffix}.png`);
        savePng(path.join(cwd, rel), withBottomLabel(img, labelText(status, name, specFor(name)), LABEL.colors[status]));
        report[status].push({ name, image: rel });
    };

    for (const line of diff.split('\n')) {
        const parts = line.split('\t');
        const status = parts[0][0]; // M/A/D/R
        const repoPath = parts[status === 'R' ? 2 : 1];
        const oldPath = status === 'R' ? parts[1] : repoPath;
        const name = path.basename(repoPath);

        if (status === 'A' || status === 'R') {
            const img = blobPng(head, repoPath);
            if (img) saveSingle(img, name, 'added');
            if (status === 'R') {
                const oldName = path.basename(oldPath);
                const oldImg = blobPng(base, oldPath);
                if (oldImg) saveSingle(oldImg, oldName, 'removed');
            }
        } else if (status === 'D') {
            const img = blobPng(base, repoPath);
            if (img) saveSingle(img, name, 'removed');
        } else {
            // Modified: captioned triptych old vs new.
            const oldImg = blobPng(base, repoPath);
            const newImg = blobPng(head, repoPath);
            if (!oldImg || !newImg) continue;
            const { result, heatmap, triptych } = comparePair(oldImg, newImg, name, floorFor(name));
            const triptychRel = path.join(DIFF_OUT_DIR, `${name}.triptych.png`);
            const heatmapRel = path.join(DIFF_OUT_DIR, `${name}.heatmap.png`);
            savePng(path.join(cwd, triptychRel), withBottomLabel(triptych, labelText('changed', name, specFor(name)), LABEL.colors.changed));
            savePng(path.join(cwd, heatmapRel), heatmap);
            report.changed.push({ ...result, triptych: triptychRel, heatmap: heatmapRel });
        }
    }
    report.changed.sort((a, b) => b.changedRatio - a.changedRatio);

    const sha7 = (process.env.GITHUB_SHA || head).slice(0, 7);
    let subject = '';
    try {
        subject = git(cwd, ['log', '-1', '--pretty=%s', head]);
    } catch { /* ignore */ }
    const header =
        `🗂️ **Baseline changelog** · \`${sha7}\`` +
        (subject ? `\n> ${subject}` : '') +
        `\n${report.changed.length} changed, ${report.added.length} added, ${report.removed.length} removed` +
        (report.removed.length ? '\n➖ REMOVED: ' + report.removed.map((r) => `\`${r.name}\``).join(', ') : '');

    const { files, notes } = buildAttachments(cwd, report);
    const messages = paginate(header + (notes.length ? '\n' + notes.join('\n') : ''), files);

    const isMainPush = process.env.GITHUB_REF === 'refs/heads/main' && process.env.GITHUB_EVENT_NAME === 'push';
    if (args.dryRun || (!args.force && !isMainPush)) {
        for (const [i, m] of messages.entries()) {
            console.log(`--- message ${i + 1}/${messages.length} (${m.files.length} files) ---`);
            if (m.content) console.log(m.content);
            for (const f of m.files) console.log(`  [attach] ${f.name} (${f.buffer.length} bytes)`);
        }
        if (!args.dryRun) console.log('[changelog] not a push to main — not posting');
        return;
    }
    const webhook = process.env.DISCORD_WEBHOOK_URL;
    if (!webhook) {
        console.log('[changelog] DISCORD_WEBHOOK_URL unset — skipping');
        return;
    }
    for (const m of messages) await postMessage(webhook, m);
    console.log(`[changelog] posted ${messages.length} message(s)`);
}

if (require.main === module) {
    main().catch((e) => {
        console.error(`[changelog] ${e.message}`);
        process.exitCode = 1;
    });
}
