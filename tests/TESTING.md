# Testing rules

Determinism rules for the Playwright specs (`tests/e2e`, `tests/kicad`, `tests/web`).
Enforced by `npm run lint:determinism` (`tools/lint-determinism.ts`). Run specs from `tests/`
via `npm run test:kicad` (firefox) / `npm run test:e2e` (chromium) — not playwright directly.

## Waits — never blind

- **No `page.waitForTimeout(n)`.** Wait on a *condition*: `expect.poll(() => predicate)`, a
  web-first assertion (`expect(locator).toBeVisible()`), or `waitUntil(page, fn, desc)` (throws
  loudly on timeout).
- **App readiness:** `waitForWxApp(page)` (canvas visible + element registry populated) for
  widget/editor harnesses; `waitForCanvasApp(page)` for registry-less canvas apps.
- The **only** allowed `waitForTimeout` is an irreducible interaction dwell — a canvas/keyboard
  commit with no JS-observable signal — and it MUST carry a same-line marker:
  `// eslint-disable-line -- documented interaction dwell: <why>`.

## No defensive branches

- **No `if (await el.count()) el.click()`.** Assert the element exists, then act:
  `expect(await clickByLabel(page, 'X'), '...').toBe(true)`. Use `clickMenuItemByText` (normalizes
  `&` / `...` / `…`) instead of try-A-else-A…-else-A fallback chains.
- **No swallowed `.catch(() => {})`.** Let it throw, or assert the tolerated outcome. A genuinely
  best-effort op must carry a marker explaining why.

## Screenshots — `stableShot`, compared offline

- Capture with **`stableShot(page, 'name.png', { fullPage })`** — it settles the render (in-page
  canvas-hash over animation frames) then writes a raw PNG to `test-results/`. It does **not**
  assert. Never use Playwright's `toHaveScreenshot`.
- Comparison is offline: `npm run screenshots:check` diffs `test-results/` against the committed
  baselines in `tests/baseline-screenshots/` (+ `3d-regression/`, `gal-regression/`).
- **CI's Linux render is the source of truth**; baselines are promoted from CI
  (`npm run screenshots:promote -- --run <ci-run-id>`). A local (Mac) check shows font/render
  noise and is not the gate.
- A continuously-animating state (timer, mid-slide) can't be a stable baseline — drop the shot.

## Retries

- **`retries: 0`** in both configs. A failure is real; don't mask it with a retry.

## Where things are

- Per-test logs (JS console + cpp): `tests/logs/{wxwidgets,kicad}/<test-name>/`.
- Guard: `npm run lint:determinism`. Screenshot gate: `npm run screenshots:check`.
