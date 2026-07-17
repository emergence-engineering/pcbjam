# Testing rules

Determinism rules for the Playwright specs (`tests/e2e`, `tests/kicad`, `tests/web`).
Enforced by `npm run lint:determinism` (`tools/lint-determinism.ts`, gating in CI). Run specs
from `tests/` via `npm run test:e2e` (the full CI project set: wx-chromium, kicad-firefox,
kicad-chromium, asyncify-firefox, coroutine-firefox) or `npm run test:kicad` (kicad-firefox
only) — not playwright directly. One spec on one engine:
`npx playwright test --project=kicad-firefox kicad/pcbnew.spec.ts`.

## Waits — never blind

- **No `page.waitForTimeout(n)`.** Wait on a *condition*: `expect.poll(() => predicate)`, a
  web-first assertion (`expect(locator).toBeVisible()`), or `waitUntil(page, fn, desc)` (throws
  loudly on timeout).
- **App readiness:** `waitForWxApp(page)` (canvas visible + element registry populated) for
  widget/editor harnesses; `waitForCanvasApp(page)` for registry-less canvas apps.
- The **only** allowed `waitForTimeout` is an irreducible interaction dwell — a canvas/keyboard
  commit with no JS-observable signal — and it MUST carry a same-line marker:
  `// eslint-disable-line -- documented interaction dwell: <why>`.
- **Menu clicks: wait for the specific item, not a count.** Popup items register in the element
  registry progressively as they paint, so a coarse gate ("N menuitems rendered") can pass before
  the item you're about to click exists — and `clickMenuItem` is single-shot. Before every
  `clickMenuItem(page, 'X')`, `await waitForRenderedByLabel(page, 'X', { elementType: 'menuitem' })`
  (same matcher as the click). `clickMenuItemByText` already waits internally and needs no guard.
  A submenu click needs its own wait: the parent menu's still-rendered items satisfy any count gate
  before the submenu paints.

## No defensive branches

- **No `if (await el.count()) el.click()`.** Assert the element exists, then act:
  `expect(await clickByLabel(page, 'X'), '...').toBe(true)`. Use `clickMenuItemByText` (normalizes
  `&` / `...` / `…`) instead of try-A-else-A…-else-A fallback chains.
- **No swallowed `.catch(() => {})`.** Let it throw, or assert the tolerated outcome. A genuinely
  best-effort op must carry a marker explaining why.

## Screenshots — `stableShot`, compared offline

- Capture with **`stableShot(page, 'name.png', { fullPage })`** — it settles the render (in-page
  canvas-hash over animation frames) then writes a raw PNG to
  `test-results/<engine>/` (`chromium`/`firefox`, derived from the running browser — the same
  spec on two engines writes two files). It does **not** assert. Never use Playwright's
  `toHaveScreenshot`. Raw `page.screenshot`/fs writers must route through
  `shotPath(page, 'name.png')` for the same engine scoping.
- Comparison is offline and per-engine: `npm run screenshots:check` diffs
  `test-results/<engine>/` against the committed baselines in
  `tests/baseline-screenshots/<engine>/` (+ `3d-regression/`, `gal-regression/`).
  `tests/screenshot-manifest.json` (regen: `npm run screenshots:manifest`) is the authoritative
  {name, engine} list — CI fails the lint step if it drifts from the baseline tree.
- **CI's Linux render is the source of truth**; baselines are promoted from CI
  (`npm run screenshots:promote -- --run <ci-run-id>`). A local (Mac) check shows font/render
  noise and is not the gate.
- A continuously-animating state (timer, mid-slide) can't be a stable baseline — drop the shot.

## Retries

- **`retries: 0`** in both configs (`playwright.config.ts` — the merged wasm-suite config —
  and `playwright-web.config.ts`). A failure is real; don't mask it with a retry.

## Every spec runs in CI — `lint:ci-coverage`

`npm run lint:ci-coverage` (`tools/lint-ci-coverage.ts`, gating in CI next to the
determinism lint) proves every `*.spec.ts` under `tests/` is actually executed by CI:
it scrapes the `npm run test:…` invocations from `.github/workflows/`, resolves them
through `package.json` to their `playwright test --config/--project` flags, and asks
Playwright itself (`--list`) which files those runs cover. No hand-maintained lists —
adding a spec in a brand-new directory is exactly what it catches.

When it fires:
- `uncovered-spec` — your new spec matches no CI-run project. Put it in a covered
  `testDir`, adjust a project's `testMatch`, or add the project to a CI npm script.
- `orphan-project` — you added a config project no CI script selects. Wire it into a
  CI script, or (for deliberately-local system-browser projects) add it to
  `LOCAL_ONLY_PROJECTS` in the lint with a comment saying why.

## Where things are

- Per-test logs (JS console + cpp): `tests/logs/{wxwidgets,kicad}/<test-name>/`.
- Guards: `npm run lint:determinism`, `npm run lint:ci-coverage`.
  Screenshot gate: `npm run screenshots:check`.
