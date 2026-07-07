import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { findRenderedByType, waitForEditorReady, stableShot } from '../e2e/utils/element-tracker';

/**
 * In-app proof that the two DOM-port features work inside a real KiCad app.
 *
 * pl_editor is the smallest KiCad editor (fast to build, seeded config so no
 * setup wizard). It exercises BOTH features that were stubbed:
 *   1. a right-click CONTEXT MENU on the GAL canvas — KiCad's tool framework
 *      calls frame->PopupMenu() (common/tool/tool_manager.cpp) from inside a
 *      suspended tool coroutine; this is the hardest DoPopupMenu path.
 *   2. a built-in SCROLLBAR gutter on a wxScrolledWindow (the properties
 *      panel); a short viewport forces it to overflow so the gutter shows.
 *
 * Screenshots (test-results/pl_editor-*.png) are the deliverable — always
 * open them to confirm the menu sits at the cursor and the thumb is visible.
 */

async function getGlBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const id = await page.evaluate(() => {
    const visible = Array.from(document.querySelectorAll('[id^="glcanvas-"]'))
      .map((c) => c as HTMLCanvasElement)
      .find((c) => {
        const rect = c.getBoundingClientRect();
        return window.getComputedStyle(c).display !== 'none' && rect.width > 0 && rect.height > 0;
      });
    return (visible ?? (document.querySelector('[id^="glcanvas-"]') as HTMLCanvasElement | null))?.id ?? null;
  });
  if (!id) throw new Error('No visible GL canvas found');
  const box = await page.locator(`#${id}`).boundingBox();
  if (!box) throw new Error('GL canvas bounding box unavailable');
  return box;
}

async function popupItems(page: Page) {
  return findRenderedByType(page, 'menuitem', { parentId: 'popupmenu' });
}

test.describe('pl_editor: DOM-port context menu + scrollbar', () => {
  // A short viewport makes the right-side properties panel overflow so its
  // built-in scrollbar gutter appears.
  test.use({ viewport: { width: 1280, height: 540 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/kicad/pl_editor.html');
  });

  test('right-click on the canvas opens a context menu', async ({ page, testLogger }) => {
    await waitForEditorReady(page);

    const box = await getGlBox(page);
    const x = Math.round(box.x + box.width * 0.5);
    const y = Math.round(box.y + box.height * 0.5);

    // Left-click first so the selection tool is active, then right-click.
    await page.mouse.click(x, y);
    // Small settle so the activation click is processed before the right-click — no
    // JS-observable "selection tool active" signal to poll (documented interaction wait).
    await page.waitForTimeout(300); // eslint-disable-line -- see comment above
    await page.mouse.click(x, y, { button: 'right' });

    await expect.poll(async () => (await popupItems(page)).length, {
      timeout: 12000,
      message: 'the canvas right-click should open a DOM context menu',
    }).toBeGreaterThan(0);

    await stableShot(page, 'pl_editor-context-menu.png', { fullPage: true });

    // Dismiss it; the popup should disappear.
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await popupItems(page)).length, { timeout: 5000 }).toBe(0);

    expect(
      testLogger.errors.filter((e) => !e.includes('favicon') && !e.includes('WebGL')),
      'no page errors during the context-menu flow',
    ).toHaveLength(0);
  });

  // Returns the visible (display != none, real size) DOM scrollbar gutters.
  async function visibleGutters(page: Page) {
    return page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-wx-scrollbar]'))
        .map((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return {
            x: Math.round(r.x), y: Math.round(r.y),
            w: Math.round(r.width), h: Math.round(r.height),
            shown: getComputedStyle(el as HTMLElement).display !== 'none',
          };
        })
        .filter((g) => g.shown && g.w > 0 && g.h > 0);
    });
  }

  test('the properties panel shows a draggable scrollbar gutter', async ({ page }) => {
    await waitForEditorReady(page);

    // The right-hand properties panel's "General Options" tab is a
    // wxScrolledWindow full of page-setup fields; in a short window it
    // overflows, so its built-in scrollbar gutter renders. Switch to it and
    // shrink the window.
    await page.setViewportSize({ width: 1180, height: 460 });
    // Let the viewport resize reflow the panel before clicking the tab — a resize has
    // no single JS-observable "reflow done" signal (documented interaction wait).
    await page.waitForTimeout(500); // eslint-disable-line -- see comment above
    // Click the "Gener..." tab (top-right of the properties panel).
    await page.mouse.click(1140, 80);

    await expect.poll(async () => (await visibleGutters(page)).length, {
      timeout: 12000,
      message: 'a built-in scrollbar gutter should render on the overflowing properties panel',
    }).toBeGreaterThan(0);

    await stableShot(page, 'pl_editor-scrollbar.png', { fullPage: true });

    // Drag the vertical gutter's thumb and screenshot the move.
    const tracks = await findRenderedByType(page, 'slidertrack');
    const sliders = await findRenderedByType(page, 'slider');
    const vTrack = tracks.find((t) => t.height > t.width && t.height > 0);
    expect(vTrack, 'a vertical scrollbar track should exist').toBeTruthy();
    const vThumb = sliders.find((s) => s.parentId === vTrack!.parentId);
    expect(vThumb, 'a vertical gutter thumb should exist').toBeTruthy();
    await page.mouse.move(vThumb!.centerX, vThumb!.centerY);
    await page.mouse.down();
    await page.mouse.move(vTrack!.centerX, vTrack!.screenY + vTrack!.height * 0.7, { steps: 6 });
    await page.mouse.up();
    await stableShot(page, 'pl_editor-scrollbar-dragged.png', { fullPage: true });
  });
});
