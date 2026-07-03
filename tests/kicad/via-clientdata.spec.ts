import { test, expect } from './fixtures';
import { clickByLabel } from '../e2e/utils/element-tracker';
import type { Page } from '@playwright/test';

// KiCad-level reproduction of the wxWidgets DOM-port "selection events carry no
// per-item client data" bug (parity audit C-1, the audit's single Critical),
// fixed in src/wasm/{choice,combobox,listbox}.cpp by calling
// InitCommandEventWithItems() before dispatch.
//
// pcbnew's Track & Via Properties dialog is the ONLY KiCad surface that reads
// per-item client data off a wxChoice *selection event* (an exhaustive sweep of
// the tree found exactly one such consumer). It populates the "predefined via
// sizes" choice with a VIA_DIMENSION* as client data
// (dialog_track_via_properties.cpp:767-781) and, on selection, does with NO null
// guard (dialog_track_via_properties.cpp:1674-1680):
//
//     VIA_DIMENSION* v = static_cast<VIA_DIMENSION*>( aEvent.GetClientData() );
//     m_viaDiameter.ChangeValue( v->m_Diameter );   // v is NULL when the bug is present
//     m_viaDrill.ChangeValue( v->m_Drill );
//
// With the DOM-port bug, event.GetClientData() is always NULL; in WASM a null
// deref at a small offset reads 0 (no trap — see memory wasm-null-deref-reads-zero),
// so picking a predefined via size sets the Via diameter/drill fields to 0
// instead of the predefined value.
//
//   RED  (bug present): after picking "0.9 / 0.45", the Via diameter field -> 0
//                       (or the module aborts).
//   GREEN (fixed):      the Via diameter field -> 0.9 (the predefined value).
//
// The predefined via sizes are seeded from the board file's
// (setup (user_via <dia_mm> <drill_mm>) ...) so no Board Setup interaction is
// needed. The board contains ONLY the via, so Edit -> Select All selects exactly
// the via (satisfying the tracks/vias-only condition the Properties action needs)
// with no fragile canvas-pixel clicking.

const DOC_DIR = `/home/kicad/documents`;
const PCB_PATH = `${DOC_DIR}/via_clientdata.kicad_pcb`;

// A minimal board: two predefined via sizes (0.9/0.45 and 1.1/0.55 mm) plus a
// single via whose own size (0.7/0.35) is distinct from both predefined sizes
// and from 0 — so the diameter field visibly changes on selection.
const BOARD = `(kicad_pcb
	(version 20241229)
	(generator "pcbnew")
	(generator_version "9.0")
	(general (thickness 1.6))
	(paper "A4")
	(layers
		(0 "F.Cu" signal)
		(2 "B.Cu" signal)
	)
	(setup
		(user_via 0.9 0.45)
		(user_via 1.1 0.55)
	)
	(net 0 "")
	(via (at 100 100) (size 0.7) (drill 0.35) (layers "F.Cu" "B.Cu") (net 0)
		(uuid "77777777-0000-0000-0000-000000000001"))
)
`;

async function waitForPcbnew(page: Page): Promise<void> {
  await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });
  await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 90000 });
  await page.waitForFunction(
    () => {
      const r = window.wxElementRegistry;
      return !!r && r.findAll({}).length > 0;
    },
    null,
    { timeout: 150000 },
  );
  await page.waitForTimeout(2500);
  // dismiss the first-run setup wizard (Next > … Finish); no-op if absent
  for (let i = 0; i < 12; i++) {
    const advanced = await clickByLabel(page, 'Next >');
    if (!advanced) break;
    await page.waitForTimeout(400);
  }
  await clickByLabel(page, 'Finish');
  await page.waitForTimeout(800);
  await page.waitForFunction(
    () => {
      const r = window.wxElementRegistry;
      if (!r) return false;
      return r.findAll({ visible: true }).some((el) => el.name === 'PcbFrame');
    },
    null,
    { timeout: 90000 },
  );
  await page.waitForTimeout(1500);
}

// Open the board directly through the embind bridge (present in pcbnew.wasm).
async function openBoard(page: Page): Promise<void> {
  await page.evaluate(
    ({ dir, path, content }) => {
      const w = window as unknown as {
        FS: { mkdirTree(p: string): void; writeFile(p: string, d: string): void };
        Module: { kicadOpenFile(p: string): unknown };
      };
      try {
        w.FS.mkdirTree(dir);
      } catch {
        /* exists */
      }
      w.FS.writeFile(path, content);
      w.Module.kicadOpenFile(path);
    },
    { dir: DOC_DIR, path: PCB_PATH, content: BOARD },
  );
}

// Snapshot the id + option texts of every single-select <select> on the page.
// Stamps a stable unique id on each so before/after sets can be diffed (the
// dialog's predefined-via-size choice is a NEW <select> vs the toolbar ones).
async function dumpSelects(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __vsc?: number };
    w.__vsc = w.__vsc ?? 0;
    return Array.from(document.querySelectorAll('select:not([multiple])')).map((sel) => {
      const s = sel as HTMLSelectElement;
      if (!s.id) s.id = `__vsel_${w.__vsc!++}`;
      return { id: s.id, options: Array.from(s.options).map((o) => o.text) };
    });
  });
}

// The bounding box of the visible GAL WebGL canvas (some glcanvas-* are hidden).
async function visibleGlCanvasBox(page: Page) {
  const id = await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('[id^="glcanvas-"]'))
      .map((el) => el as HTMLCanvasElement)
      .find((el) => {
        const rect = el.getBoundingClientRect();
        return window.getComputedStyle(el).display !== 'none' && rect.width > 0 && rect.height > 0;
      });
    return c?.id ?? null;
  });
  expect(id, 'a visible GL canvas').not.toBeNull();
  const box = await page.locator(`#${id}`).boundingBox();
  expect(box, 'GL canvas bounding box').not.toBeNull();
  return box!;
}

test.describe('pcbnew Track & Via Properties — selection-event client data (C-1)', () => {
  test.describe.configure({ timeout: 240000 });

  test('predefined via size sets the diameter field (not 0)', async ({ page, testLogger }) => {
    await page.goto('/kicad/pcbnew.html');
    await waitForPcbnew(page);

    // Load the crafted board and let it settle.
    await openBoard(page);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/via-clientdata-00-loaded.png', scale: 'device' });

    // Record the toolbar <select>s (they also list via sizes with "N / N mm")
    // so the dialog's predefined-via-size choice can be told apart as a NEW one.
    const beforeSelIds = new Set((await dumpSelects(page)).map((s) => s.id));

    // Give the GAL canvas keyboard focus with a real mouse click on an empty
    // spot (keyboard events only reach pcbnew after a canvas interaction — see
    // pcbnew-move.spec.ts). Then Select All (Ctrl+A) grabs the only via and E
    // (PCB_ACTIONS::properties) opens its dialog.
    const glBox = await visibleGlCanvasBox(page);
    await page.mouse.click(Math.round(glBox.x + glBox.width * 0.5), Math.round(glBox.y + glBox.height * 0.2));
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(700);
    await page.keyboard.press('e');

    // Wait for the dialog: a NEW <select> (not a toolbar one) whose options look
    // like via sizes ("0.9 / 0.45 …") can only appear when the dialog opens.
    await expect
      .poll(
        async () => {
          return (await dumpSelects(page)).some(
            (s) => !beforeSelIds.has(s.id) && s.options.some((o) => /\d\s*\/\s*\d/.test(o)),
          );
        },
        {
          timeout: 30000,
          message: 'Track & Via Properties dialog with the predefined-via-size choice should open',
        },
      )
      .toBe(true);

    await page.screenshot({ path: 'test-results/via-clientdata-01-dialog.png', scale: 'device' });

    const selects = await dumpSelects(page);
    const viaSelect = selects.find(
      (s) => !beforeSelIds.has(s.id) && s.options.some((o) => /\d\s*\/\s*\d/.test(o)),
    );
    expect(viaSelect, 'dialog predefined-via-size <select> present').toBeTruthy();
    const targetOption = viaSelect!.options.find((o) => o.includes('0.9'))!;
    console.log(`[VIA] predefined options: ${JSON.stringify(viaSelect!.options)}; picking "${targetOption}"`);

    // Record the diameter field: the dialog <input> whose value ≈ 0.7 (the via's
    // current diameter, distinct from every other field and from 0).
    const diameterBefore = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
      const hit = inputs.find((el) => Math.abs(parseFloat(el.value) - 0.7) < 0.02);
      if (hit && !hit.id) hit.id = '__via_diameter_input';
      return hit ? { id: hit.id, value: hit.value } : null;
    });
    console.log('[VIA] diameter field before: ' + JSON.stringify(diameterBefore));
    expect(diameterBefore, 'via diameter field (≈0.7) found before selection').toBeTruthy();

    // Pick the predefined via size -> fires DOM change -> wxChoice::OnDomEvent ->
    // onViaSelect reads event.GetClientData().
    await page.locator(`#${viaSelect!.id}`).selectOption({ label: targetOption });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/via-clientdata-02-selected.png', scale: 'device' });

    const diameterAfter = await page.evaluate((id: string) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      return el ? el.value : null;
    }, diameterBefore!.id);
    const numAfter = parseFloat(diameterAfter ?? 'NaN');
    console.log(`[VIA] diameter field after: "${diameterAfter}" (${numAfter})`);

    const aborted = [...testLogger.consoleLogs, ...testLogger.errors].some((l) =>
      l.includes('Aborted('),
    );
    expect(aborted, 'the WASM module must not abort on the via-size selection').toBe(false);

    // RED (bug): diameter -> 0. GREEN (fixed): diameter -> 0.9 (the predefined value).
    expect(
      numAfter,
      `predefined via size 0.9 mm must land in the diameter field (got "${diameterAfter}")`,
    ).toBeCloseTo(0.9, 2);
  });
});
