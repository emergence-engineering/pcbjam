import { test, expect, type Page } from '@playwright/test';
import { waitForRegistry } from '../e2e/utils/element-tracker';

/**
 * 0009-B footprint READ path: does the footprint editor browse + LOAD a real,
 * ingested KiCad-10.0.3 footprint through PCB_IO_PCBJAM_FP — i.e. does the fork's
 * footprint parser accept the version-capped (20260206→20251028) body? This is
 * the end-to-end proof of the 0009-A "version cap only, no token strip" finding.
 *
 * Boots the project-scoped footprint_editor against the GPL example backend
 * (:3060) serving curated footprint fixtures (LIBS_DIR=/tmp/fp-fixtures). Boot
 * generates the fp-lib-table from `listLibs?kind=footprint`; the test expands a
 * lib in the tree (FootprintEnumerate) and opens a footprint (FootprintLoad →
 * Parse). Pass: the footprint OPENS (title = lib:footprint) — which requires
 * Parse to have succeeded; a FUTURE_FORMAT/token error would make FootprintLoad
 * return null and nothing would open.
 *
 * The LIB_TREE's rendered dataviewitem Y is offset by a constant (the rows live
 * below the column header); we calibrate that offset from the "Item" header +
 * row pitch, then double-click true positions.
 */

const SHOT = (name: string) => `test-results/fpbrowse-${name}.png`;
const LIB = 'Resistor_SMD';

async function bootFootprintEditor(page: Page): Promise<void> {
  await page.goto('/p/demo/footprint_editor/');
  await expect(page.locator('#canvas')).toBeVisible({ timeout: 180000 });
  await waitForRegistry(page, 180000);
  await page.waitForFunction(
    () => !!window.wxElementRegistry && window.wxElementRegistry.findAll({}).length > 5,
    null,
    { timeout: 180000 },
  );
  await page.waitForFunction(() => !!(window as any).kicadLibs, null, { timeout: 60000 });
  await page.waitForTimeout(2000);
}

/** Map a rendered tree row's offset Y to its true screen Y (see header note). */
async function treeGeom(page: Page) {
  return page.evaluate(() => {
    const rd = window.wxElementRegistry.findAllRendered({});
    const hdr = rd.find((e: any) => e.elementType === 'columnheader' && e.label === 'Item');
    const rows = rd
      .filter((e: any) => e.elementType === 'dataviewitem')
      .sort((a: any, b: any) => a.centerY - b.centerY);
    if (!hdr || rows.length === 0) return null;
    const pitch = rows.length > 1 ? rows[1].centerY - rows[0].centerY : 17;
    // True center of the first visible row sits just below the header.
    const firstTrue = hdr.centerY + hdr.height / 2 + pitch / 2;
    const offset = firstTrue - rows[0].centerY;
    return {
      offset,
      rows: rows.map((r: any) => ({ label: r.label, cx: r.centerX, cy: r.centerY })),
    };
  });
}

async function dblclickRow(page: Page, re: RegExp): Promise<string | null> {
  const geom = await treeGeom(page);
  if (!geom) return null;
  const row = geom.rows.find((r) => re.test(r.label || ''));
  if (!row) return null;
  await page.mouse.dblclick(row.cx, row.cy + geom.offset);
  return row.label;
}

test('footprint editor browses + loads a real ingested footprint (read path / version cap)', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  await bootFootprintEditor(page);
  await page.screenshot({ path: SHOT('01-boot'), scale: 'css' });

  const geom0 = await treeGeom(page);
  logs.push(`[spec] tree geom: ${JSON.stringify(geom0)}`);

  // Expand the footprint lib (FootprintEnumerate) by double-clicking its row.
  const libClicked = await dblclickRow(page, new RegExp(`^${LIB}$`));
  logs.push(`[spec] expanded lib: ${libClicked}`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: SHOT('02-expanded'), scale: 'css' });

  // Open a footprint child (FootprintLoad → Parse). SMD fixtures carry "Metric".
  const fpClicked = await dblclickRow(page, /Metric/);
  logs.push(`[spec] opened footprint: ${fpClicked}`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOT('03-loaded'), scale: 'css' });

  const title = await page.title();
  logs.push(`[spec] title after open: ${title}`);
  // Diagnostics BEFORE assertions so a failure stays legible.
  console.log('--- console + spec log ---\n' + logs.join('\n'));

  // fp-lib-table worked: the footprint origin is in the tree.
  expect(geom0?.rows.some((r) => r.label === LIB), 'footprint lib row present').toBe(true);
  // Enumerate worked end-to-end through the fork: a footprint child appeared.
  expect(fpClicked, 'footprint row present after expand (FootprintEnumerate)').toBeTruthy();
  // Parse SUCCEEDED: the editor opened a footprint from the capped 10.0.3 data.
  expect(title, 'a footprint opened (FootprintLoad + Parse on capped data)').toContain(LIB);
  expect(title, 'opened footprint name in title').toMatch(/Metric/);

  // No parser rejection of the capped data, no wedge.
  expect(logs.some((l) => /FUTURE_FORMAT|too recent|Expecting\(|Unexpected/i.test(l)), 'no parse/format error').toBe(false);
  expect(logs.some((l) => l.includes('Aborted(')), 'no WASM abort').toBe(false);
  expect(new URL(page.url()).searchParams.get('oomRetry'), 'no OOM respawn').toBeNull();
});
