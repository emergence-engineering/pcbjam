import { test, expect } from '@playwright/test';

/**
 * Editor-unification runtime-frame validation.
 *
 * After unification the library editors are no longer separate .wasm bundles:
 *   - the Symbol Editor   is the eeschema bundle booted with --frame=symedit
 *   - the Footprint Editor is the pcbnew  bundle booted with --frame=fpedit
 * The frame token is threaded through Module.arguments and parsed in
 * kicad/common/single_top.cpp (mirroring kicad/kicad.cpp's --frame parser).
 *
 * This asserts the decisive fact the launch-smoke specs don't: that the shared
 * bundle actually opens the LIBRARY editor frame, not its parent editor. The
 * window title is the discriminator — the parent bundle's default frame would
 * title itself "Schematic Editor" / "PCB Editor".
 */

interface FrameCase {
  harness: string;
  /** title the library-editor frame settles on */
  titleRe: RegExp;
  /** the parent editor's title — must NOT appear (would mean --frame was ignored) */
  parentRe: RegExp;
}

const CASES: FrameCase[] = [
  { harness: 'symbol_editor.html',    titleRe: /Symbol Editor/i,    parentRe: /Schematic Editor/i },
  { harness: 'footprint_editor.html', titleRe: /Footprint Editor/i, parentRe: /PCB Editor/i },
];

test.describe('editor-unification runtime frame (--frame)', () => {
  for (const tc of CASES) {
    test(`${tc.harness} opens the library editor frame from its parent bundle`, async ({ page }) => {
      const consoleLines: string[] = [];
      page.on('console', (m) => consoleLines.push(m.text()));
      page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));

      await page.goto(`/kicad/${tc.harness}`);

      // The runtime came up.
      await expect(page.locator('#canvas')).toBeVisible({ timeout: 120000 });

      // The frame sets the document title once it is up; poll until it settles.
      await expect
        .poll(() => page.title(), {
          message: `${tc.harness}: never reached the expected library-editor title`,
          timeout: 120000,
          intervals: [1000],
        })
        .toMatch(tc.titleRe);

      const title = await page.title();
      // eslint-disable-next-line no-console
      console.log(`[frame-runtime] ${tc.harness} -> title=${JSON.stringify(title)}`);

      // The runtime --frame flag actually switched frames: the parent editor's
      // title must not be what we ended up on.
      expect(title, `${tc.harness}: opened the library editor, not its parent`).not.toMatch(tc.parentRe);

      // No WASM abort during load.
      const aborted = consoleLines.some((l) => /Aborted\(/.test(l));
      expect(aborted, 'no WASM abort during load').toBe(false);

      await page.screenshot({ path: `test-results/frame-runtime-${tc.harness}.png`, scale: 'device' });
    });
  }
});
