import { test, expect, type Page } from '@playwright/test';
import { clickMenuBarItem, clickMenuItemByText } from '../e2e/utils/element-tracker';

/**
 * File → Quit e2e: quitting an editor must leave it, like the browser Back
 * button — return to wherever the user navigated in from (the project page),
 * falling back to the project page on a deep link with no same-origin history.
 *
 * The wx wasm port notifies the page when the app's top window is destroyed
 * (window.wxAppTopWindowClosed, wxwidgets src/wasm/toplevel.cpp); WasmTool maps
 * that to history.back() / location.assign(projectPath). A quit vetoed by the
 * unsaved-changes prompt never destroys the frame, so it never navigates.
 *
 * URL-only assertions — no screenshots.
 */

/** Scope segment for the demo project (the reference backend serves it for any). */
const SCOPE = 'default';

const EDITOR_URL_RE = /\/default\/projects\/demo\/demo\.kicad_sch/;
// Project overview: path ends at /projects/demo (optionally a query string).
const PROJECT_URL_RE = /\/default\/projects\/demo\/?(\?.*)?$/;

async function waitForToolReady(page: Page, titleRe: RegExp): Promise<void> {
  await expect(page.locator('#canvas')).toBeVisible({ timeout: 120000 });
  await expect
    .poll(() => page.title(), {
      message: `editor never reached title ${titleRe}`,
      timeout: 120000,
      intervals: [1000],
    })
    .toMatch(titleRe);
  // The menu helpers drive the rendered-element registry.
  await page.waitForFunction(
    () =>
      !!(window as unknown as { wxElementRegistry?: { findAllRendered?: unknown } })
        .wxElementRegistry,
    null,
    { timeout: 30000 }
  );
  // The boot and eager-library overlays (WasmTool, `absolute inset-0 z-30`)
  // cover the whole editor including the menubar — synthetic menu clicks land
  // on them until they clear (eeschema hydrates the full symbol set post-boot).
  await expect(page.locator("div.absolute.inset-0.z-30")).toHaveCount(0, {
    timeout: 180000,
  });
}

async function quitViaFileMenu(page: Page): Promise<void> {
  expect(await clickMenuBarItem(page, 'File'), 'File menubar item clickable').toBe(true);
  await clickMenuItemByText(page, 'Quit');
}

test.describe('web app — File → Quit leaves the editor', () => {
  test('quit after entering from the project page navigates back to it', async ({ page }) => {
    test.setTimeout(300000); // full wasm boot

    // Enter the editor the way a user does: the project page's "Open in …"
    // link is a hard navigation, creating the history entry Quit pops.
    await page.goto(`/${SCOPE}/projects/demo`);
    await page
      .getByRole('link', { name: /Open in Schematic Editor/i })
      .first()
      .click();
    await page.waitForURL(EDITOR_URL_RE, { timeout: 30000 });
    await waitForToolReady(page, /demo — Schematic Editor/i);

    await quitViaFileMenu(page);

    await page.waitForURL(PROJECT_URL_RE, { timeout: 30000 });
  });

  test('quit on a deep-linked editor falls back to the project page', async ({ page }) => {
    test.setTimeout(300000);

    // Direct entry: no same-origin referrer, nothing meaningful to go back to —
    // quit must land on the project page via the fallback URL.
    await page.goto(`/${SCOPE}/projects/demo/demo.kicad_sch`);
    await waitForToolReady(page, /demo — Schematic Editor/i);

    await quitViaFileMenu(page);

    await page.waitForURL(PROJECT_URL_RE, { timeout: 30000 });
  });
});
