/**
 * Central config for the screenshot regression + review tooling.
 *
 * The comparison engine (compare.ts), the churn-free updater (promote.ts) and
 * the Discord reporter (post-discord.ts) all read their knobs from here so
 * there is exactly one place to tune thresholds and paths.
 *
 * Paths are relative to the `tests/` directory (that is the working directory
 * the npm scripts and CI steps run from).
 */

/**
 * Committed baseline directory. Single dir on purpose: `e2e/baseline-screenshots/`
 * used to also hold a few names (grid-tab-final, wxgrid-*) that ALSO live here with
 * different bytes — so they got silently shadowed. Consolidated to one dir.
 */
export const BASELINE_DIRS = ['baseline-screenshots'] as const;

/** Where Playwright writes the current run's screenshots (gitignored). */
export const RESULTS_DIR = 'test-results';

/** Where compare.ts writes diff/heatmap/triptych artifacts (gitignored). */
export const DIFF_OUT_DIR = 'test-results/screenshot-diff';

/** The manifest that records every expected screenshot + which engine renders it. */
export const MANIFEST_PATH = 'screenshot-manifest.json';

/**
 * pixelmatch per-pixel settings.
 *  - `threshold` is the YIQ perceptual distance (0..1) below which two pixels
 *    are considered equal. 0.1 tolerates gamma/AA jitter but catches real colour
 *    change.
 *  - `includeAA: false` (the pixelmatch default) means anti-aliased edge pixels
 *    are DETECTED AND IGNORED — exactly the sub-pixel/AA noise the old
 *    `maxDiff>16` counter was dominated by (see screenshot-compare.ts:36-43).
 */
export const PIXELMATCH = { threshold: 0.1, includeAA: false } as const;

/** Colour pixelmatch paints a real (non-AA) diff pixel with — the mask reads this back. */
export const DIFF_COLOR: [number, number, number] = [255, 0, 0];

/** Connected-component clustering ("where to look") parameters. */
export const CLUSTER = {
    dilate: 2, // grow the mask so fragmented glyph pixels merge into one box
    minBoxArea: 16, // drop specks smaller than this (px²)
    maxBoxes: 6, // draw at most this many (largest-first) red boxes
    boxColor: [255, 0, 0] as [number, number, number],
} as const;

/** Horizontal montage layout for the old | new+boxes | heatmap triptych. */
export const TRIPTYCH = {
    gap: 8,
    bg: [24, 24, 24, 255] as [number, number, number, number],
    padFill: [40, 0, 40, 255] as [number, number, number, number], // magenta pad on dim-mismatch
} as const;

/**
 * Per-engine verdict floors. A screenshot is CHANGED when its AA-excluded
 * changed-pixel ratio exceeds `changedRatio`. `meanChannelGuard` is recorded
 * for the drift-vs-regression heuristic (broad + low-intensity ⇒ environment
 * drift, not a localized regression), not for the primary verdict.
 *
 * Set to 0.5% — the re-baseline run showed 355/356 images intra-CI-stable well
 * under this, but a couple of runs since had sub-1% inter-run flakiness, so 0.5%
 * gives headroom while still catching real localized changes. (`npm run
 * screenshots:noise` on two CI renders can refine per-engine numbers later.)
 */
export type EngineFloor = { changedRatio: number; meanChannelGuard: number };

export const FLOORS: Record<string, EngineFloor> = {
    'firefox-llvmpipe': { changedRatio: 0.005, meanChannelGuard: 2.0 },
    'chromium-swiftshader': { changedRatio: 0.005, meanChannelGuard: 2.0 },
    default: { changedRatio: 0.005, meanChannelGuard: 2.0 },
};

/**
 * Optional per-file rectangles to ignore before diffing (e.g. a live clock).
 * Keyed by screenshot filename. Empty for now.
 */
export const IGNORE_REGIONS: Record<string, Array<{ x: number; y: number; width: number; height: number }>> = {};

/**
 * Screenshots excluded from comparison entirely (not compared, not counted as
 * changed/added/removed, not put in the manifest). For nondeterministic captures
 * that can't be a stable baseline — e.g. `retinascale-01-loaded` is a `fullPage`
 * HiDPI test whose captured height + DPR scaling vary run-to-run (~60% inter-run
 * diff observed), a flaky test rather than render noise.
 */
export const IGNORE_SCREENSHOTS = new Set<string>(['retinascale-01-loaded.png']);

/** True if a screenshot is excluded from comparison. */
export function isIgnored(name: string): boolean {
    return IGNORE_SCREENSHOTS.has(name);
}

/** Bottom caption strip baked onto each posted composite (status + name + spec). */
export const LABEL = {
    maxScale: 3, // bitmap-font scale; auto-fit picks the largest that fits the width
    vpad: 5,
    hpad: 8,
    text: [255, 255, 255] as [number, number, number], // white
    colors: {
        added: [46, 125, 50] as [number, number, number], // green
        removed: [198, 40, 40] as [number, number, number], // red
        changed: [239, 108, 0] as [number, number, number], // orange
    },
};

export type LabelStatus = 'added' | 'removed' | 'changed';

/** Caption text: `CHANGED  name.png · kicad/pcbnew.spec.ts` (spec omitted if unknown). */
export function labelText(status: LabelStatus, name: string, spec: string | null): string {
    const s = status.toUpperCase();
    return spec ? `${s}  ${name} · ${spec}` : `${s}  ${name}`;
}

export type ManifestEntry = { name: string; engine: string };
export type Manifest = { screenshots: ManifestEntry[] };

/** Resolve the verdict floor for a screenshot via the manifest's engine tag. */
export function floorFor(name: string, manifest?: Manifest): EngineFloor {
    const engine = manifest?.screenshots.find((e) => e.name === name)?.engine;
    return (engine && FLOORS[engine]) || FLOORS.default;
}
