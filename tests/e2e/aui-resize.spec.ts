// wxAuiManager dock-sash RESIZE UX tests (pcbjam#20).
//
// KiCad's dockable side panels are managed by wxAuiManager; resizing one means
// dragging its dock sash. This spec pins the three reported UX bugs on the
// faithful surface (the default-flag wxAuiManager in aui_test.cpp, exactly how
// KiCad docks panels):
//   1. Hovering the sash must show an east-west resize cursor.
//   2. The pane must resize LIVE during the drag (preview = the real content).
//   3. Dragging must NOT paint grey XOR "resize hint" streaks on the pane.
//
// These are RED before the wasm-layer fix and GREEN after it. See
// features/kicad-resize-panel / docs and the plan for the fix details.

import { test, expect, tryLoadApp, MAIN_CANVAS } from './utils/fixtures';
import {
  waitForRegistry,
  findRenderedByType,
  findAuiPaneContent,
} from './utils/element-tracker';
import type { Page } from '@playwright/test';

const APP = '/standalone/aui/aui_test.html';
const RESIZE_CURSORS = ['ew-resize', 'col-resize', 'e-resize', 'w-resize'];

interface SashPoint {
  x: number;
  y: number;
  source: 'registry-sash' | 'geometry-gap';
}

/**
 * Locate the LEFT (Properties) dock sash — the vertical divider between the
 * Properties pane and the center Event Log. Two-tier and deterministic:
 *  1. Prefer a registry 'sash' element (AUI dock sashes publish as 'sash').
 *  2. Fall back to the geometric gap between the Properties content's right
 *     edge and the center content's left edge.
 */
async function locateLeftSash(page: Page): Promise<SashPoint> {
  const propsContent = await findAuiPaneContent(page, 'Properties');
  const centerContent = await findAuiPaneContent(page, 'Event Log');

  // Tier 1: registry sash, vertical, nearest the Properties pane's right edge.
  const sashes = await findRenderedByType(page, 'sash');
  const vertical = sashes.filter((s) => s.height > s.width);
  if (vertical.length && propsContent) {
    const rightEdge = propsContent.screenX + propsContent.width;
    const candidates = vertical
      .filter((s) => s.centerX >= rightEdge - 8)
      .sort(
        (a, b) =>
          Math.abs(a.centerX - rightEdge) - Math.abs(b.centerX - rightEdge)
      );
    const sash = candidates[0] ?? vertical.sort((a, b) => a.centerX - b.centerX)[0];
    if (sash) {
      return { x: Math.round(sash.centerX), y: Math.round(sash.centerY), source: 'registry-sash' };
    }
  }

  // Tier 2: geometry gap between Properties and center content.
  if (propsContent && centerContent) {
    const x = (propsContent.screenX + propsContent.width + centerContent.screenX) / 2;
    const y = propsContent.centerY;
    return { x: Math.round(x), y: Math.round(y), source: 'geometry-gap' };
  }

  throw new Error('Could not locate the Properties dock sash (no registry sash, no pane content)');
}

/** Read the CSS cursor of the element under (x,y), falling back to #canvas. */
async function readCursorAt(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ({ x, y, canvasSel }) => {
      const hit = document.elementFromPoint(x, y) as HTMLElement | null;
      const el = hit ?? (document.querySelector(canvasSel) as HTMLElement | null);
      return el ? getComputedStyle(el).cursor : '<no-element>';
    },
    { x, y, canvasSel: MAIN_CANVAS }
  );
}

/**
 * Fraction of a screenshot region covered by the XOR "resize hint" stipple — the
 * broken grey-lines artifact. wxAuiManager paints the non-live resize hint with
 * `wxPaneCreateStippleBitmap` under `wxXOR`; on a Canvas2D surface the XOR neither
 * composites nor erases, so a 1px black/light checkerboard is smeared across the
 * pane (and left behind after release). Its signature is a near-black pixel
 * FLANKED by light pixels on both immediate sides (a 1px-period stipple) — which
 * solid panels (no black) and text (contiguous black runs) do not produce.
 *
 * Calibrated: striped frames read ~0.12, clean frames ~0.0013 — see the spec
 * header. NB: relies on 1:1 CSS-pixel screenshots (`scale: 'css'`, dpr 1).
 */
async function stippleFraction(
  page: Page,
  png: Buffer,
  region: { x: number; y: number; w: number; h: number }
): Promise<number> {
  return page.evaluate(
    async ({ b64, region }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const x0 = Math.max(1, Math.round(region.x));
      const x1 = Math.min(img.width - 1, Math.round(region.x + region.w));
      const y0 = Math.max(0, Math.round(region.y));
      const y1 = Math.min(img.height, Math.round(region.y + region.h));
      if (x1 <= x0 || y1 <= y0) return 0;

      const data = ctx.getImageData(0, 0, img.width, img.height).data;
      const luma = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

      let hits = 0;
      let total = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          total++;
          const i = (y * img.width + x) * 4;
          if (luma(i) < 70) {
            const left = luma((y * img.width + (x - 1)) * 4);
            const right = luma((y * img.width + (x + 1)) * 4);
            if (left > 140 && right > 140) hits++; // black flanked by light => stipple, not text
          }
        }
      }
      return total ? hits / total : 0;
    },
    { b64: png.toString('base64'), region }
  );
}

/**
 * Region (CSS px) covering the Properties pane and the sash's drag trail, where
 * a narrow-drag XOR stipple would smear. Spans from the pane's left edge to just
 * past the (pre-drag) sash position, and includes the caption row above.
 */
async function leftPaneTrailRegion(
  page: Page,
  sashStartX: number
): Promise<{ x: number; y: number; w: number; h: number }> {
  const props = await findAuiPaneContent(page, 'Properties');
  if (!props) throw new Error('Properties pane content not found');
  const left = Math.max(0, props.screenX);
  const top = Math.max(0, props.screenY - 30); // include the caption row above content
  const bottom = props.screenY + props.height;
  const right = sashStartX + 6;
  return { x: left, y: top, w: Math.max(1, right - left), h: bottom - top };
}

async function load(page: Page): Promise<void> {
  await page.goto(APP);
  expect(await tryLoadApp(page), 'AUI app should load').toBe(true);
  expect(await waitForRegistry(page), 'element registry should init').toBe(true);
  // Let canvas-island geometry settle before reading positions.
  await page.waitForTimeout(400);
}

test.describe('wxAuiManager dock-sash resize UX (pcbjam#20)', () => {
  test('hovering the dock sash shows a resize cursor', async ({ page }) => {
    await load(page);
    const sash = await locateLeftSash(page);
    console.log(`[aui-resize] sash via ${sash.source} at (${sash.x},${sash.y})`);

    // Move OFF the sash first (into the Properties pane) and confirm no resize cursor.
    const props = await findAuiPaneContent(page, 'Properties');
    if (props) {
      await page.mouse.move(props.centerX, props.centerY);
      await page.waitForTimeout(120);
      const offCursor = await readCursorAt(page, props.centerX, props.centerY);
      console.log(`[aui-resize] cursor off-sash = ${offCursor}`);
      expect(RESIZE_CURSORS, 'cursor should NOT be a resize cursor inside the pane').not.toContain(offCursor);
    }

    // Hover the sash → resize cursor.
    await page.mouse.move(sash.x, sash.y);
    await page.waitForTimeout(150);
    const cursor = await readCursorAt(page, sash.x, sash.y);
    console.log(`[aui-resize] cursor on-sash = ${cursor}`);

    await page.screenshot({ path: 'test-results/aui-resize-01-hover.png' });
    expect(RESIZE_CURSORS, `expected a resize cursor over the sash, got "${cursor}"`).toContain(cursor);
  });

  test('dragging the dock sash resizes the pane LIVE (no deferral to mouse-up)', async ({ page }) => {
    await load(page);
    const sash = await locateLeftSash(page);

    const widthOf = async (): Promise<number | null> =>
      (await findAuiPaneContent(page, 'Properties'))?.width ?? null;

    const before = await widthOf();
    expect(before, 'Properties pane width should be readable').not.toBeNull();

    await page.mouse.move(sash.x, sash.y);
    await page.waitForTimeout(100);
    await page.mouse.down();
    // Widen the pane (move right) without releasing — avoids the MinSize clamp.
    await page.mouse.move(sash.x + 80, sash.y, { steps: 8 });
    await page.waitForTimeout(150);

    const midDrag = await widthOf(); // read while button STILL held
    await page.screenshot({ path: 'test-results/aui-resize-02-mid-drag-live.png' });

    await page.mouse.up();
    await page.waitForTimeout(250);
    const after = await widthOf();

    console.log(`[aui-resize] width before=${before} mid=${midDrag} after=${after}`);

    // LIVE: the pane width already changed mid-drag, before release.
    expect(Math.abs((midDrag ?? 0) - (before ?? 0)), 'pane should resize live during drag').toBeGreaterThan(20);
    // No jump-on-release: the committed width ≈ the mid-drag preview.
    expect(Math.abs((after ?? 0) - (midDrag ?? 0)), 'final width should match the live preview').toBeLessThan(25);
  });

  test('dragging narrower paints no grey XOR stipple (and none left behind)', async ({ page }) => {
    await load(page);
    const sash = await locateLeftSash(page);
    const region = await leftPaneTrailRegion(page, sash.x);

    await page.mouse.move(sash.x, sash.y);
    await page.waitForTimeout(100);
    await page.mouse.down();
    // Drag NARROWER (the user's specific complaint) in steps; capture an
    // intermediate frame while the button is still held.
    await page.mouse.move(sash.x - 90, sash.y, { steps: 10 });
    await page.waitForTimeout(70);
    const midShot = await page.screenshot({ path: 'test-results/aui-resize-03-mid-drag.png', scale: 'css' });

    await page.mouse.up();
    await page.waitForTimeout(200);
    const afterShot = await page.screenshot({ path: 'test-results/aui-resize-04-after.png', scale: 'css' });

    const midFrac = await stippleFraction(page, midShot, region);
    const afterFrac = await stippleFraction(page, afterShot, region);
    console.log(`[aui-resize] stipple frac mid=${midFrac.toFixed(4)} after=${afterFrac.toFixed(4)} region=${JSON.stringify(region)}`);

    // Calibrated: broken XOR hint reads ~0.12; a clean frame ~0.0013. 0.02 sits
    // an order of magnitude away from both.
    expect(midFrac, 'no grey XOR resize-hint stipple during drag').toBeLessThan(0.02);
    expect(afterFrac, 'no grey XOR stipple left behind after release').toBeLessThan(0.02);
  });
});
