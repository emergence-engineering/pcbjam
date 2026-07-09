import { test, expect } from './fixtures';
import { waitForPcbnew } from './utils/pcbnew-ready';

// KiCad-level reproduction of the wxWidgets DOM-port "caret/selection never
// reaches the DOM input" bug family (parity audit H-3/#30/#31), fixed in
// wxwidgets/src/wasm/textentry.cpp + include/wx/wasm/private/dom.h +
// build/wasm/wx-dom.js, plus a one-line KiCad gate widening.
//
// Native behavior: when a DIALOG_SHIM opens, its first paint runs
// SelectAllInTextCtrls() and then focuses the initial-focus control
// (common/dialog_shim.cpp:1343-1357) — so the pre-filled text of the focused
// field is selected and typing REPLACES the value ("type-to-replace").
//
// In the WASM build this is double-broken:
//  1. The SelectAll() inside SelectAllInTextCtrls is gated
//     `#if defined(__WXMAC__) || defined(__WXMSW__)` (dialog_shim.cpp:901) and
//     the wasm build defines __WXWASM__/__WXUNIVERSAL__ — compiled out.
//  2. Even where SelectAll()/SetSelection() IS called, the wasm port only
//     writes a C++-side cache (src/wasm/textentry.cpp:150-178) — nothing calls
//     setSelectionRange on the real DOM <input> (#30), and the accessors never
//     read selectionStart/End back (H-3).
// So the DOM input has no selection, and typing INSERTS at the browser caret
// instead of replacing the field.
//
// Surface: pcbnew Track & Via Properties on a board with a single TRACK. With
// tracks in the selection the dialog sets initial focus on m_TrackWidthCtrl
// (dialog_track_via_properties.cpp:845-846), a plain wxTextCtrl pre-filled
// with the track width — and wxWindowWasm::SetFocus() does reach the DOM
// (window.cpp:967 wxDomFocus), so keystrokes land in the real <input> without
// any click.
//
//   RED  (bug present): typing "5" into the just-opened dialog INSERTS into
//                       the pre-filled width (e.g. "50.25" / "0.255").
//   GREEN (fixed):      typing "5" REPLACES the selected width -> value "5".

const DOC_DIR = `/home/kicad/documents`;
const PCB_PATH = `${DOC_DIR}/selectonopen.kicad_pcb`;
const TRACK_WIDTH_MM = 0.25;

// A minimal board with a single track segment of a distinctive width. Ctrl+A
// selects exactly the track, satisfying the tracks/vias-only condition of
// PCB_ACTIONS::properties and making m_tracks true (initial focus -> width).
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
	(net 0 "")
	(segment (start 100 100) (end 120 100) (width ${TRACK_WIDTH_MM}) (layer "F.Cu") (net 0)
		(uuid "88888888-0000-0000-0000-000000000001"))
)
`;

// Open the board directly through the embind bridge (present in pcbnew.wasm).
async function openBoard(page: import('@playwright/test').Page): Promise<void> {
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

// The bounding box of the visible GAL WebGL canvas (some glcanvas-* are hidden).
async function visibleGlCanvasBox(page: import('@playwright/test').Page) {
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

test.describe('pcbnew dialog select-all-on-open — caret/selection DOM bridge (H-3)', () => {
  test.describe.configure({ timeout: 240000 });

  test('typing into the just-opened Track Properties replaces the width value', async ({
    page,
    testLogger,
  }) => {
    await page.goto('/kicad/pcbnew.html');
    await waitForPcbnew(page);

    await openBoard(page);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/select-on-open-00-loaded.png', scale: 'device' });

    // Focus the GAL canvas with a real click on an empty spot, Select All grabs
    // the only track, E opens Track & Via Properties (proven C-1 harness).
    const glBox = await visibleGlCanvasBox(page);
    await page.mouse.click(
      Math.round(glBox.x + glBox.width * 0.5),
      Math.round(glBox.y + glBox.height * 0.2),
    );
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(700);
    await page.keyboard.press('e');

    // Dialog open signal: a visible wxDialog in the registry.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const r = window.wxElementRegistry;
            return (r?.findAll({ visible: true }) ?? []).some((e) => /Dialog/i.test(e.typeName));
          }),
        { timeout: 30000, message: 'Track & Via Properties dialog should open' },
      )
      .toBe(true);

    // Precondition (separates harness failure from RED): initial focus really
    // landed on the pre-filled track-width <input>. Match by parseFloat, not
    // string equality (unit-binder formatting may vary).
    await expect
      .poll(
        async () =>
          page.evaluate((expected: number) => {
            const a = document.activeElement as HTMLInputElement | null;
            if (!a || a.tagName !== 'INPUT') return null;
            if (Math.abs(parseFloat(a.value) - expected) > 0.02) return null;
            if (!a.id) a.id = '__h3_width_input';
            return a.value;
          }, TRACK_WIDTH_MM),
        {
          timeout: 20000,
          message: `initial focus should land on the pre-filled width <input> (≈${TRACK_WIDTH_MM})`,
        },
      )
      .not.toBeNull();

    const before = await page.evaluate(
      () => (document.getElementById('__h3_width_input') as HTMLInputElement).value,
    );
    console.log(`[H3] width field value at dialog open: "${before}"`);
    await page.screenshot({ path: 'test-results/select-on-open-01-dialog.png', scale: 'device' });

    // Type WITHOUT clicking — the dialog's open-time select-all must make this
    // replace the whole value, exactly as on native.
    await page.keyboard.type('5');
    await page.waitForTimeout(500);

    const after = await page.evaluate(
      () => (document.getElementById('__h3_width_input') as HTMLInputElement).value,
    );
    console.log(`[H3] width field value after typing "5": "${after}"`);
    await page.screenshot({ path: 'test-results/select-on-open-02-typed.png', scale: 'device' });

    const aborted = [...testLogger.consoleLogs, ...testLogger.errors].some((l) =>
      l.includes('Aborted('),
    );
    expect(aborted, 'WASM module should not abort').toBe(false);

    // RED: "5" is inserted into the pre-filled value (e.g. "50.25" / "0.255").
    // GREEN: the selected pre-fill is replaced -> exactly "5".
    expect(
      after,
      `typing must replace the selected width value (got "${after}" from pre-fill "${before}")`,
    ).toBe('5');

    // Teardown: Escape twice (first may revert the field edit, second cancels).
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });
});
