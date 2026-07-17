import { test, expect } from '@playwright/test';
import { shotPath } from '../e2e/utils/element-tracker';

/**
 * Editor-unification runtime-frame validation.
 *
 * Since Part 2 ALL FOUR editors are served by the ONE merged kicad_editor bundle
 * (pcbnew + eeschema kifaces statically linked): each harness loads kicad_editor.js
 * with its frame token in Module.arguments —
 *   - PCB Editor       --frame=pcb      (also the bundle's build-time default)
 *   - Footprint Editor --frame=fpedit
 *   - Schematic Editor --frame=sch
 *   - Symbol Editor    --frame=symedit
 * parsed in kicad/common/single_top.cpp (mirroring kicad/kicad.cpp's --frame parser).
 *
 * This asserts the decisive fact the launch-smoke specs don't: that the merged
 * bundle actually opens the REQUESTED frame. The window title is the discriminator —
 * a dropped/ignored token would land on the build default ("PCB Editor") or a
 * sibling editor's title.
 */

interface FrameCase {
  harness: string;
  /** title the requested editor frame settles on */
  titleRe: RegExp;
  /** any OTHER editor's title — must NOT appear (would mean --frame went wrong) */
  wrongRe: RegExp;
}

const CASES: FrameCase[] = [
  { harness: 'pcbnew.html',
    titleRe: /PCB Editor/i,
    wrongRe: /Schematic Editor|Symbol Editor|Footprint Editor/i },
  { harness: 'footprint_editor.html',
    titleRe: /Footprint Editor/i,
    wrongRe: /PCB Editor|Schematic Editor|Symbol Editor/i },
  { harness: 'eeschema.html',
    titleRe: /Schematic Editor/i,
    wrongRe: /PCB Editor|Footprint Editor|Symbol Editor/i },
  { harness: 'symbol_editor.html',
    titleRe: /Symbol Editor/i,
    wrongRe: /PCB Editor|Schematic Editor|Footprint Editor/i },
];

test.describe('editor-unification runtime frame (--frame)', () => {
  for (const tc of CASES) {
    test(`${tc.harness} opens its editor frame from the merged bundle`, async ({ page }) => {
      const consoleLines: string[] = [];
      page.on('console', (m) => consoleLines.push(m.text()));
      page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));

      await page.goto(`/kicad/${tc.harness}`);

      // The runtime came up.
      await expect(page.locator('#canvas')).toBeVisible({ timeout: 120000 });

      // The frame sets the document title once it is up; poll until it settles.
      await expect
        .poll(() => page.title(), {
          message: `${tc.harness}: never reached the expected editor title`,
          timeout: 120000,
          intervals: [1000],
        })
        .toMatch(tc.titleRe);

      const title = await page.title();
      // eslint-disable-next-line no-console
      console.log(`[frame-runtime] ${tc.harness} -> title=${JSON.stringify(title)}`);

      // The runtime --frame flag actually selected the right frame: no sibling
      // editor's title.
      expect(title, `${tc.harness}: opened the requested editor, not a sibling`).not.toMatch(tc.wrongRe);

      // No WASM abort during load — and no duplicate embind registration (the
      // merged dispatcher must register each shared JS name exactly once).
      const aborted = consoleLines.some((l) => /Aborted\(|Cannot register public name/.test(l));
      expect(aborted, 'no WASM abort / duplicate embind registration during load').toBe(false);

      await page.screenshot({ path: shotPath(page, `frame-runtime-${tc.harness}.png`), scale: 'device' });
    });
  }
});
