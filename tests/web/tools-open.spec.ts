import { test, expect, type Page } from '@playwright/test';

/**
 * Web-app tool open-path e2e.
 *
 * Drives the real React app (not the standalone harness): for each tool, navigate
 * to its route, let WasmTool boot the tool in-document and (for file tools)
 * auto-open the demo file via Module.kicadOpenFile, then assert the editor came up
 * with the expected title, a painted canvas, no first-run wizard, and no WASM abort
 * or URL-regex modal. Fixtures live in the committed "demo" project (seed-data/),
 * ensured by global-setup-web.ts.
 */

interface ToolCase {
  /** URL path after /p/demo/ */
  route: string;
  /** title the document settles on once the tool is up / file is open */
  titleRe: RegExp;
  /** file tools must drop "untitled"; file-less tools just need to boot */
  fileless: boolean;
}

const CASES: Record<string, ToolCase> = {
  eeschema: { route: 'eeschema/demo.kicad_sch', titleRe: /demo — Schematic Editor/i, fileless: false },
  pcbnew: { route: 'pcbnew/demo.kicad_pcb', titleRe: /demo — PCB Editor/i, fileless: false },
  pl_editor: { route: 'pl_editor/demo.kicad_wks', titleRe: /demo — Drawing Sheet Editor/i, fileless: false },
  calculator: { route: 'calculator/', titleRe: /Calculator Tools/i, fileless: true },
  symbol_editor: { route: 'symbol_editor/', titleRe: /Symbol Editor/i, fileless: true },
};

/** Console text that must never appear (wizard-crash + URL-regex modal markers). */
const FORBIDDEN = /Aborted\(|Invalid regular expression|code points 0xd800|func is not a function/i;

async function bootAndAssert(page: Page, tc: ToolCase): Promise<void> {
  const consoleLines: string[] = [];
  page.on('console', (m) => consoleLines.push(m.text()));
  page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));

  await page.goto(`/p/demo/${tc.route}`);

  // boot.ts mounts the Emscripten <canvas id="canvas"> once the runtime starts.
  await expect(page.locator('#canvas')).toBeVisible({ timeout: 120000 });

  // The wasm sets the document title once the frame is up (and, for file tools,
  // once OpenProjectFiles finishes). Poll until it matches.
  await expect
    .poll(() => page.title(), {
      message: `${tc.route}: editor never reached expected title`,
      timeout: 120000,
      intervals: [1000],
    })
    .toMatch(tc.titleRe);

  // File tools must have actually loaded the file (title no longer "untitled").
  if (!tc.fileless) {
    expect(await page.title(), 'file should be open (title not untitled)').not.toMatch(/untitled/i);
  }

  // No first-run setup wizard should be visible (config seed must have skipped it).
  const wizardVisible = await page.evaluate(() => {
    const reg = (window as unknown as { wxElementRegistry?: { findAll(f: object): { typeName: string }[] } })
      .wxElementRegistry;
    if (!reg) return 0;
    return reg.findAll({ visible: true }).filter((e) => /^wxDialog|Wizard/.test(e.typeName)).length;
  });
  expect(wizardVisible, 'no setup wizard/dialog should be visible').toBe(0);

  const offending = consoleLines.filter((l) => FORBIDDEN.test(l));
  expect(offending, `forbidden console output:\n${offending.join('\n')}`).toHaveLength(0);
}

test.describe('web app — tool open paths', () => {
  for (const [tool, tc] of Object.entries(CASES)) {
    test(`${tool}: ${tc.fileless ? 'boots file-less' : 'opens its demo file'} wizard-free`, async ({
      page,
    }) => {
      await bootAndAssert(page, tc);
      await page.screenshot({ path: `test-results/web-${tool}.png`, scale: 'device' });
    });
  }
});
