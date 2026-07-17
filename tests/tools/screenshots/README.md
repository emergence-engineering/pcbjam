# Screenshot regression + Discord review tooling

One comparison engine + a churn-free updater + a Discord reporter for the e2e
screenshots. Design and rationale: `~/.claude/plans/…snowglobe.md` (or ask).

**Source of truth = CI's Linux render.** The dev never authors baselines on the
Mac (Mac fonts/GL ≠ CI). Instead, CI renders on every push; when a render change
is intentional you *promote* CI's artifact into the committed baselines. The
environment isn't pinned — if the host's Mesa/fonts drift, the gate lights up in
Discord and you just re-promote (broad + low-intensity change ⇒ likely drift).

**Everything is per-engine.** Specs write `test-results/<engine>/<name>.png`
(engine derived from the running browser via `stableShot`/`shotPath`); baselines
live in `baseline-screenshots/<engine>/`; the canonical key everywhere in this
tooling is `<engine>/<name>` and captions/attachments carry the engine label.
The same spec on chromium + firefox is two independent gated screenshots.

## Files
- `config.ts` — thresholds, baseline dirs, per-engine floors (calibrate!), clustering knobs.
- `image-ops.ts` — PNG load/save, pixelmatch diff (AA-excluded), connected-component boxes, triptych compositing, size-cap resize.
- `compare.ts` — the comparison engine: classify per-engine baselines vs `test-results/<engine>/` → `test-results/screenshot-diff/report.json` + triptych/heatmap PNGs. `--pair` diffs two files.
- `promote.ts` — churn-free updater: pull a CI run's shots (`gh run download`) or `--from DIR`; overwrite a baseline only when pixels differ beyond the floor (verbatim bytes, no re-encode) → no git churn.
- `perf-report.ts` — renders the track-only runtime-perf table (loadMs/openMs/FPS) with Δ vs the previous main run (fetched via `gh`).
- `post-discord.ts` — the always-on CI-on-main report: SHA + e2e status + perf table, then screenshot triptychs (batched, size-capped, flood-collapsed).
- `changelog.ts` — Discord trigger B: git-history diff of committed baseline PNGs (no build/GPU).
- `noise.ts` — calibration: diff two identical-input renders → per-engine noise floor.
- `gen-manifest.ts` — regenerate `screenshot-manifest.json` (canonical {name, engine} list) from the committed per-engine baseline tree; `--check` (gating in CI) fails if it drifts.
- `spec-map.ts` — best-effort screenshot-name → spec-file attribution for captions (scans `stableShot`/`shotPath` literals).

## npm scripts (run from `tests/`)
```
npm run screenshots:check      # gate: baselines vs test-results → report.json (exit 0; add --fail-on-change to gate)
npm run screenshots:promote -- --run <ci-run-id>   # churn-free re-baseline from a CI run (or --from DIR)
npm run screenshots:report -- --e2e pass           # post the CI report to Discord (main+push only; needs DISCORD_WEBHOOK_URL)
npm run screenshots:changelog                       # post the baseline changelog (main+push only)
npm run screenshots:noise -- run1/ run2/            # calibrate floors
npm run screenshots:manifest                        # regenerate the manifest (--check to verify it's fresh)
```

## Activation checklist
- [x] `screenshot-manifest.json` generated ({name, engine} authoritative — derived from the per-engine baseline tree).
- [x] `scale:'device'`→`'css'` normalized (no-op at CI's DSF=1).
1. Add the `DISCORD_WEBHOOK_URL` repo secret — until then everything is inert.
2. Calibrate: run the suite twice in CI, `screenshots:noise` the two dirs, set `FLOORS` in `config.ts`.
3. First re-baseline: `promote` a clean CI run's render, commit (expect a big, one-time chrome-font diff vs the Mac baselines).
4. Delete the old `scripts/{compare,update-baseline}-screenshots.sh`.
5. Once floors are proven stable, flip the gate to `--fail-on-change`.
