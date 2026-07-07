import { test, expect, type Page } from '@playwright/test';
import { clickMenuBarItem, clickMenuItemByText, stableShot } from '../e2e/utils/element-tracker';

/**
 * Tool-switch e2e: eeschema Tools → "Switch to PCB Editor" (and the reverse)
 * must navigate the browser to the other tool's URL.
 *
 * Native KiCad spawns a process for this via ExecuteFile (common/gestfich.cpp);
 * the WASM build delegates to window.kicadWebOpenTool (WasmTool.tsx), which
 * maps the MEMFS file path to the project-relative file and calls
 * location.assign(/p/demo/<tool>/<file>). Each direction is a full page
 * navigation followed by a fresh wasm boot — hence the generous timeouts.
 */

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
}

async function switchTool(
  page: Page,
  menuLabel: string,
  expectedUrl: RegExp,
  expectedTitle: RegExp
): Promise<void> {
  expect(await clickMenuBarItem(page, 'Tools'), 'Tools menubar item clickable').toBe(true);
  await clickMenuItemByText(page, menuLabel);

  await page.waitForURL(expectedUrl, { timeout: 30000 });
  await waitForToolReady(page, expectedTitle);
}

test.describe('web app — tool switching', () => {
  test('eeschema → Switch to PCB Editor navigates to pcbnew', async ({ page }) => {
    test.setTimeout(420000); // two full wasm boots

    await page.goto('/p/demo/eeschema/demo.kicad_sch');
    await waitForToolReady(page, /demo — Schematic Editor/i);

    await switchTool(
      page,
      'Switch to PCB Editor',
      /\/p\/demo\/pcbnew\/demo\.kicad_pcb/,
      /demo — PCB Editor/i
    );

    await stableShot(page, 'web-switch-sch-to-pcb.png');
  });

  test('pcbnew → Switch to Schematic Editor navigates to eeschema', async ({ page }) => {
    test.setTimeout(420000);

    await page.goto('/p/demo/pcbnew/demo.kicad_pcb');
    await waitForToolReady(page, /demo — PCB Editor/i);

    await switchTool(
      page,
      'Switch to Schematic Editor',
      /\/p\/demo\/eeschema\/demo\.kicad_sch/,
      /demo — Schematic Editor/i
    );

    await stableShot(page, 'web-switch-pcb-to-sch.png');
  });
});
