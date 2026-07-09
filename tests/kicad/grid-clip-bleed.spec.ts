import { test, expect } from './fixtures';
import { clickMenuBarItem, clickTreeItem, findTreeItem, findGridCell } from '../e2e/utils/element-tracker';
import { waitForPcbnew } from './utils/pcbnew-ready';
import type { Page } from '@playwright/test';

// KiCad-level reproduction of the "rectangular DC clip is a silent no-op" bug
// (parity audit H-2), fixed in wxwidgets/src/wasm/dc.cpp.
//
// wxWasmDCImpl::DoSetClippingRegion(x,y,w,h) (src/wasm/dc.cpp:292-304) calls
// the base wxDCImpl::DoSetClippingRegion and then feeds m_clipX1..m_clipY2 to
// the JS clipRect. But the modern base class stores the clip box only in the
// *private* m_devClipX1.. members — m_clipX1.. stay at their ctor value of 0 —
// so JS always receives clipRect(id, 0,0,0,0), which wx.js treats as
// "uninitialized" and resets the clip to the whole context. Every wxDC-level
// rectangular clip (wxDCClipper, SetClippingRegion(wxRect)) is silently
// ignored. (The wxRegion overload works; only the coordinate overload is
// broken.)
//
// KiCad surface: wxGrid cell text is clipped to its cell via exactly this path
// (wxGrid::DrawTextRectangle -> wxDCClipper, src/generic/grid.cpp:7336), and
// KiCad's WX_GRID disables cell overflow (common/widgets/wx_grid.cpp:214
// SetDefaultCellOverflow(false)), so text longer than its column must be
// truncated at the cell edge — even when the neighboring cell is empty.
// wxGrid paints cells in descending order (grid.cpp:6497), so with the bug the
// long text is painted *after* its right-hand neighbor and the unclipped
// overflow survives the paint pass, visibly bleeding across the next column.
//
// The surface is Board Setup > Net Classes: its grid has fixed column widths
// (no WX_GRID::SetupColumnAutosizer, which on e.g. the Text Variables grid
// auto-fits the column to its content and would mask the bug), and a newly
// added netclass row has an EMPTY Clearance cell next to the Name cell.
//
//   RED  (bug present): dark text pixels ("ink") inside the empty Clearance
//                       cell — the Name text bleeds across the column edge.
//   GREEN (fixed):      the Clearance cell interior stays background-only;
//                       the Name text is clipped at its own cell edge.

const PAYLOAD = 'W'.repeat(70); // ~700px of text vs a ~130px Name column

interface CssRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function insetRect(r: { screenX: number; screenY: number; width: number; height: number },
                   by: number): CssRect {
  return {
    x: r.screenX + by,
    y: r.screenY + by,
    width: Math.max(1, r.width - 2 * by),
    height: Math.max(1, r.height - 2 * by),
  };
}

// Measure "ink" (dark, text-colored) pixels and mean luminance of a
// viewport-CSS-coordinate rect in a device-scale screenshot. Grid cell
// backgrounds are white/near-white; text is black — luminance < 128 cleanly
// separates them. The mean guards against measuring a row that is still
// selected (dark navy row highlight), which would fake ink.
async function measureCell(
  page: Page,
  png: Buffer,
  rect: CssRect,
): Promise<{ ink: number; mean: number }> {
  return page.evaluate(
    async ({ b64, rect }) => {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('screenshot decode failed'));
        img.src = 'data:image/png;base64,' + b64;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      // The screenshot is viewport-sized at device scale; derive the ratio
      // instead of trusting devicePixelRatio so both scales work.
      const scale = img.width / window.innerWidth;
      const data = ctx.getImageData(
        Math.round(rect.x * scale),
        Math.round(rect.y * scale),
        Math.max(1, Math.round(rect.width * scale)),
        Math.max(1, Math.round(rect.height * scale)),
      ).data;
      let ink = 0;
      let lumSum = 0;
      const pixels = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        lumSum += lum;
        if (lum < 128) ink++;
      }
      return { ink, mean: lumSum / pixels };
    },
    { b64: png.toString('base64'), rect },
  );
}

// Open the File menu and click the menu item whose label matches `re`.
async function clickFileMenuItem(page: Page, re: RegExp): Promise<boolean> {
  expect(await clickMenuBarItem(page, 'File'), 'File menu should open').toBe(true);
  await page.waitForTimeout(600);
  const items = await page.evaluate(() => {
    const r = window.wxElementRegistry;
    const all = r?.findAllRendered?.({}) ?? [];
    return all
      .filter((e) => e.elementType === 'menuitem')
      .map((e) => ({ label: e.label, x: e.centerX, y: e.centerY }));
  });
  console.log('[H2] File menu items: ' + JSON.stringify(items.map((i) => i.label)));
  const target = items.find((i) => re.test(i.label));
  if (!target) return false;
  await page.mouse.click(target.x, target.y);
  return true;
}

async function pollCellLabel(
  page: Page,
  row: number,
  col: number,
  expected: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const cell = await findGridCell(page, row, col);
    if (cell && cell.label === expected) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

test.describe('pcbnew Board Setup Net Classes grid — DC rect clip (H-2)', () => {
  test.describe.configure({ timeout: 240000 });

  test('long netclass name does not bleed into the empty Clearance cell', async ({ page, testLogger }) => {
    await page.goto('/kicad/pcbnew.html');
    await waitForPcbnew(page);

    // --- File > Board Setup... ---
    expect(
      await clickFileMenuItem(page, /board setup/i),
      'File menu should contain Board Setup',
    ).toBe(true);

    // Dialog is open once its treebook renders; all nodes are expanded on open
    // (dialog_board_setup.cpp:265), so the Net Classes item is clickable.
    await expect
      .poll(async () => (await findTreeItem(page, 'Net Classes')) !== null, {
        timeout: 30000,
        message: 'Board Setup dialog tree should render the Net Classes item',
      })
      .toBe(true);
    await page.screenshot({ path: 'test-results/grid-clip-bleed-01-dialog.png', scale: 'device' });

    expect(await clickTreeItem(page, 'Net Classes')).toBe(true);

    // The lazily-built PANEL_SETUP_NETCLASSES page holds two grids: the
    // netclass grid on top, the assignment grid below — take the topmost.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const r = window.wxElementRegistry;
            return (r?.findAll({ visible: true }) ?? []).filter((e) => e.typeName === 'wxGrid').length;
          }),
        { timeout: 30000, message: 'Net Classes grids should appear' },
      )
      .toBeGreaterThan(0);
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/grid-clip-bleed-02-page.png', scale: 'device' });

    const grid = await page.evaluate(() => {
      const r = window.wxElementRegistry;
      const grids = (r?.findAll({ visible: true }) ?? [])
        .filter((e) => e.typeName === 'wxGrid')
        .sort((a, b) => a.screenY - b.screenY);
      const g = grids[0];
      return g
        ? { screenX: g.screenX, screenY: g.screenY, width: g.width, height: g.height }
        : null;
    });
    expect(grid, 'netclass wxGrid should be in the registry').not.toBeNull();
    console.log(`[H2] netclass grid rect: (${grid!.screenX},${grid!.screenY}) ${grid!.width}x${grid!.height}`);

    // --- add a row ---
    // The panel's "+" STD_BITMAP_BUTTON is a custom-painted wxPanel and never
    // enters the element registry, so click it blind: it is the leftmost
    // button in the strip directly below the grid's bottom-left corner
    // (offsets verified against the registry grid rect on the Text Variables
    // page, which uses the identical sizer layout). OnAddNetclassClick ->
    // WX_GRID::OnAddRow inserts a row at the TOP (row 0) and auto-opens the
    // cell editor on (0, Name); the new row's Clearance cell stays empty.
    const addBtn = { x: grid!.screenX + 13, y: grid!.screenY + grid!.height + 16 };
    const editorFocused = () =>
      page
        .waitForFunction(
          () => {
            const a = document.activeElement;
            return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
          },
          null,
          { timeout: 10000 },
        )
        .then(() => true)
        .catch(() => false);

    await page.mouse.click(addBtn.x, addBtn.y);
    const editorOpen = await editorFocused();
    if (!editorOpen) {
      await page.screenshot({ path: 'test-results/grid-clip-bleed-03-no-editor.png', scale: 'device' });
    }
    expect(editorOpen, 'add-row should open the (0, Name) cell editor').toBe(true);

    await page.keyboard.type(PAYLOAD, { delay: 15 });
    await page.screenshot({ path: 'test-results/grid-clip-bleed-03-typed.png', scale: 'device' });

    // Commit the editor. Keys typed into a DOM editable are consumed by the
    // browser and never reach wx (audit #43/#55), so Enter cannot commit.
    // Click the "+" button again instead: WX_GRID::OnAddRow first calls
    // CommitPendingChanges() (mouse events do reach wx), committing the
    // payload row — which the new top insertion shifts down to ROW 1 — and
    // moving the cursor/row-selection highlight to the fresh row 0. Row 1 is
    // then unhighlighted and stable for pixel measurement.
    await page.mouse.click(addBtn.x, addBtn.y);
    const committed = await pollCellLabel(page, 1, 0, PAYLOAD, 15000);
    expect(committed, 'Name cell (1,0) should hold the committed payload').toBe(true);

    // --- measure ---
    await page.waitForTimeout(1000); // let the post-commit repaint settle
    const cellName = await findGridCell(page, 1, 0);
    const cellClearance = await findGridCell(page, 1, 1);
    expect(cellName, 'gridcell (1,0) should be registered').not.toBeNull();
    expect(cellClearance, 'gridcell (1,1) should be registered').not.toBeNull();
    console.log(
      `[H2] cell rects: name=(${cellName!.screenX},${cellName!.screenY},${cellName!.width}x${cellName!.height}) ` +
        `clearance=(${cellClearance!.screenX},${cellClearance!.screenY},${cellClearance!.width}x${cellClearance!.height})`,
    );

    const png = await page.screenshot({
      path: 'test-results/grid-clip-bleed-04-committed.png',
      scale: 'device',
    });

    // 4px inset keeps gridlines, the cell-cursor border, and clip-edge
    // antialiasing out of both samples.
    const nameStats = await measureCell(page, png, insetRect(cellName!, 4));
    const clearanceStats = await measureCell(page, png, insetRect(cellClearance!, 4));
    console.log(
      `[H2] name cell: ink=${nameStats.ink} mean=${nameStats.mean.toFixed(1)}; ` +
        `clearance cell: ink=${clearanceStats.ink} mean=${clearanceStats.mean.toFixed(1)}`,
    );

    // Harness guards: row 1 must not carry the dark row-selection highlight
    // (would fake ink), and the payload really was painted in the Name cell
    // (guards against a vacuous pass from a failed commit).
    expect(
      clearanceStats.mean,
      'Clearance cell background should be light — row still selected?',
    ).toBeGreaterThan(128);
    expect(nameStats.ink, 'Name cell should contain painted text').toBeGreaterThan(50);

    // RED: hundreds of ink pixels — the Name text bleeds across the empty
    // Clearance cell. GREEN: background only.
    expect(
      clearanceStats.ink,
      `empty Clearance cell should contain no text ink (got ${clearanceStats.ink} dark pixels — Name-cell bleed)`,
    ).toBeLessThan(5);

    // --- teardown & stability ---
    await page.keyboard.press('Escape'); // close Board Setup (Cancel)
    await page.waitForTimeout(500);

    const aborted = [...testLogger.consoleLogs, ...testLogger.errors].some((l) =>
      l.includes('Aborted('),
    );
    expect(aborted, 'WASM module should not abort').toBe(false);
  });
});
