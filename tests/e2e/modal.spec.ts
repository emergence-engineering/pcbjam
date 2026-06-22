// Modal dialog styling + drag tests — regression coverage for pcbjam #22.
//
// A wxWidgets top-level window (every modal dialog) is rendered by the wx.js
// runtime glue as `<div class="window toplevel">` (the page-positioned frame)
// containing a `<canvas class="window-canvas">` that C++ paints into. The main
// app frame is id=0 (the page's #canvas) and is NOT a `.window`, so a visible
// `#window-container .window.toplevel` is exactly a dialog.
//
// Two bugs, each asserted here:
//   1. No border/shadow — the `.window` CSS had no border or box-shadow, so
//      dialogs looked flat. Fixed by a `.window.toplevel` rule in the shell
//      template (and the production shells).
//   2. Black background on drag — `setWindowRect` unconditionally reset
//      `canvas.width/height` on every move, clearing the canvas to transparent;
//      the `.window` div's `background-color:black` then showed through with no
//      repaint queued. Fixed by only resizing the canvas on a real size change.
import { test, expect, tryLoadApp, waitForRegistry, clickByLabel, findByType } from './utils/fixtures';

const DIALOG_APP = '/standalone/dialog/dialog_test.html';

// Selector for the (single) visible modal frame.
const MODAL_SEL = '#window-container .window.toplevel';

// Wait until a visible modal `.window.toplevel` exists, then return its
// page-space rect (the div keeps a real getBoundingClientRect even though it is
// pointer-events:none).
async function waitForModalRect(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    (sel) =>
      Array.from(document.querySelectorAll(sel)).some((w) => {
        const el = w as HTMLElement;
        return el.style.display !== 'none' && el.getBoundingClientRect().width > 0;
      }),
    MODAL_SEL,
    { timeout: 5000 }
  );
  const rect = await page.evaluate((sel) => {
    const el = Array.from(document.querySelectorAll(sel)).find((w) => {
      const e = w as HTMLElement;
      return e.style.display !== 'none' && e.getBoundingClientRect().width > 0;
    }) as HTMLElement | undefined;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, MODAL_SEL);
  return rect;
}

// Sample the modal's own canvas and report what fraction of a client-area band
// is opaque (alpha) and non-black. With the drag bug the canvas is cleared to
// transparent (alpha 0) → the black div shows through → opaqueFrac ≈ 0.
async function sampleModalCanvas(page: import('@playwright/test').Page) {
  return page.evaluate((sel) => {
    const modal = Array.from(document.querySelectorAll(sel)).find((w) => {
      const e = w as HTMLElement;
      return e.style.display !== 'none' && e.getBoundingClientRect().width > 0;
    }) as HTMLElement | undefined;
    if (!modal) return null;
    const canvas = modal.querySelector('canvas.window-canvas') as HTMLCanvasElement | null;
    if (!canvas || !canvas.width || !canvas.height) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Band across the client area, just below the title bar; skip the edges.
    const x0 = Math.floor(canvas.width * 0.1);
    const y0 = Math.floor(canvas.height * 0.2);
    const w = Math.max(1, Math.floor(canvas.width * 0.8));
    const h = Math.max(1, Math.floor(canvas.height * 0.25));
    const data = ctx.getImageData(x0, y0, w, h).data;
    let opaque = 0;
    let nonBlack = 0;
    const total = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a > 128) {
        opaque++;
        if (data[i] > 24 || data[i + 1] > 24 || data[i + 2] > 24) nonBlack++;
      }
    }
    return {
      total,
      opaqueFrac: opaque / total,
      nonBlackFrac: nonBlack / total,
      canvasW: canvas.width,
      canvasH: canvas.height,
    };
  }, MODAL_SEL);
}

test.describe('Modal dialog border + drag (pcbjam #22)', () => {
  test('modal has a visible border and shadow', async ({ page, testLogger }) => {
    await page.goto(DIALOG_APP);
    expect(await tryLoadApp(page), 'App should load').toBe(true);
    await waitForRegistry(page);

    await clickByLabel(page, 'Custom Dialog');
    const rect = await waitForModalRect(page);
    expect(rect, 'modal should be visible').not.toBeNull();
    await page.waitForTimeout(400);

    await page.screenshot({ path: 'test-results/modal-01-border.png', fullPage: true });

    const style = await page.evaluate((sel) => {
      const el = Array.from(document.querySelectorAll(sel)).find((w) => {
        const e = w as HTMLElement;
        return e.style.display !== 'none' && e.getBoundingClientRect().width > 0;
      }) as HTMLElement | undefined;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        borderTopStyle: cs.borderTopStyle,
        borderTopWidth: cs.borderTopWidth,
        boxShadow: cs.boxShadow,
      };
    }, MODAL_SEL);

    expect(style, 'modal element should exist').not.toBeNull();
    testLogger.consoleLogs.push(`[MODAL_BORDER] ${JSON.stringify(style)}`);

    const hasBorder = style!.borderTopStyle !== 'none' && parseFloat(style!.borderTopWidth) > 0;
    const hasShadow = style!.boxShadow !== 'none' && style!.boxShadow !== '';

    expect(hasBorder, `expected a visible border, got ${JSON.stringify(style)}`).toBe(true);
    expect(hasShadow, `expected a box-shadow, got ${JSON.stringify(style)}`).toBe(true);
  });

  test('modal background stays painted (not black) after drag', async ({ page, testLogger }) => {
    await page.goto(DIALOG_APP);
    expect(await tryLoadApp(page), 'App should load').toBe(true);
    await waitForRegistry(page);

    await clickByLabel(page, 'Custom Dialog');
    await waitForModalRect(page); // wait for the .window.toplevel to exist
    await page.waitForTimeout(400);

    // The modal's INPUT model and VISUAL position are decoupled: the wasm places
    // the dialog at its registry screen coords (mouse events route through the
    // full-viewport #canvas), while the `.window` div renders lower because
    // #window-container flows below #main-window. So grab the title bar at the
    // registry coords, NOT getBoundingClientRect.
    const dlgBefore = (await findByType(page, 'wxDialog'))[0];
    expect(dlgBefore, 'dialog should be in the registry').toBeTruthy();

    // Sanity: the freshly painted modal canvas is opaque.
    const beforeStats = await sampleModalCanvas(page);
    testLogger.consoleLogs.push(
      `[MODAL_DRAG] before=${JSON.stringify(beforeStats)} dlg=${JSON.stringify(dlgBefore)}`
    );
    await page.screenshot({ path: 'test-results/modal-02-before-drag.png', fullPage: true });

    // Grab the title-bar strip (top TITLE_BAR_HEIGHT=22px), away from the close
    // button at top-right. The wasm pointer-move handler is asyncified, so dwell
    // after the first move to let the hovered window settle before pressing
    // (same pattern the GAL draw tests need).
    const startX = dlgBefore.centerX;
    const startY = dlgBefore.screenY + 8;
    await page.mouse.move(startX, startY);
    await page.waitForTimeout(350);
    await page.mouse.down();
    await page.waitForTimeout(150);

    // Drag in many small steps, sampling the modal canvas immediately after each
    // move. Each move calls setWindowRect, which clears the canvas; the dialog's
    // own content is NOT marked for repaint by a move (DoMoveWindow only
    // refreshes the parent), so with the bug the canvas stays transparent and
    // the black `.window` div shows through. We track the WORST (minimum) opaque
    // fraction seen across the drag.
    let minOpaque = 1;
    let lowFrames = 0;
    const STEPS = 16;
    for (let i = 1; i <= STEPS; i++) {
      await page.mouse.move(startX + i * 4, startY + i * 3);
      const s = await sampleModalCanvas(page);
      if (s) {
        if (s.opaqueFrac < minOpaque) minOpaque = s.opaqueFrac;
        if (s.opaqueFrac < 0.5) lowFrames++;
      }
    }

    await page.mouse.up();
    await page.waitForTimeout(600); // let any repaint settle

    const dlgAfter = (await findByType(page, 'wxDialog'))[0];
    const afterStats = await sampleModalCanvas(page);
    const moved = dlgAfter
      ? Math.abs(dlgAfter.screenX - dlgBefore.screenX) + Math.abs(dlgAfter.screenY - dlgBefore.screenY)
      : 0;
    testLogger.consoleLogs.push(
      `[MODAL_DRAG] minOpaque=${minOpaque} lowFrames=${lowFrames}/${STEPS} after=${JSON.stringify(afterStats)} moved=${moved} dlgAfter=${JSON.stringify(dlgAfter)}`
    );
    await page.screenshot({ path: 'test-results/modal-03-after-drag.png', fullPage: true });

    // Sanity: the drag must actually have moved the modal, otherwise the
    // black-background assertion below is meaningless (the bug only triggers on
    // a real move).
    expect(moved, 'drag did not move the modal — title-bar grab failed').toBeGreaterThan(10);

    // With the bug: the canvas is cleared on each move and shows black before any
    // repaint → minOpaque drops toward 0. After the fix: the canvas is never
    // cleared on a position-only move, so it stays painted throughout.
    expect(
      minOpaque,
      `modal canvas went transparent/black during drag (minOpaque=${minOpaque}, lowFrames=${lowFrames})`
    ).toBeGreaterThan(0.8);
  });
});
