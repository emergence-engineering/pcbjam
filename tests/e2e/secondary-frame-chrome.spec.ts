import { test, expect, waitForApp } from './utils/fixtures';
import { clickByLabel, waitForRegistry } from './utils/element-tracker';

/**
 * Validates the real-DOM title bar for secondary (non-main) wxFrames in the WASM
 * DOM port — the fix for the "3D-viewer can't be dragged / can't be X-closed" bug.
 *
 * Root cause (confirmed): a non-main window's title bar used to be canvas-painted
 * and pointer-events:none, so its clicks had to reach the central #canvas mouse
 * router; an overlapping pointer-events:auto DOM control from another frame stole
 * them. The fix gives ALL non-main top-level windows (secondary frames AND
 * dialogs) a real DOM `.window-titlebar` (drag + `.window-titlebar-close`) that
 * wins hit-testing via normal stacking.
 *
 * Drag dispatches real pointer events on the title bar (→ wx_window_move →
 * wxWindow::Move); close clicks the × (→ wx_window_close → wx Close(); for a
 * modal dialog this ends the modal loop via EndModal).
 */

const URL = '/standalone/secondary-frame-chrome/secondary-frame-chrome_test.html';

test.describe('secondary-frame DOM title bar (drag / close)', () => {
    test('frames and dialogs get a draggable, closable DOM title bar', async ({ page }) => {
        await page.goto(URL);
        await waitForApp(page);
        await waitForRegistry(page);

        const listWindows = () =>
            page.evaluate(() =>
                Array.from(document.querySelectorAll('#window-container [id^="window-"]')).map((e) => e.id));

        const styleRect = (id: string) =>
            page.evaluate((wid) => {
                const el = document.getElementById(wid) as HTMLElement | null;
                if (!el) return null;
                const n = (v: string) => parseInt(v || '0', 10) || 0;
                return { left: n(el.style.left), top: n(el.style.top), width: n(el.style.width), height: n(el.style.height) };
            }, id);

        async function openWindow(buttonLabel: string): Promise<string> {
            const before = await listWindows();
            expect(await clickByLabel(page, buttonLabel), `"${buttonLabel}" should be clickable`).toBe(true);
            await page.waitForFunction(
                (b: string[]) => Array.from(document.querySelectorAll('#window-container [id^="window-"]')).some((e) => !b.includes(e.id)),
                before, { timeout: 15000 });
            const after = await listWindows();
            const id = after.find((w) => !before.includes(w));
            expect(id, `${buttonLabel} should open a new window`).toBeTruthy();
            await page.waitForTimeout(200);
            return id as string;
        }

        // Returns true if the window moved after a title-bar drag.
        async function dragViaTitlebar(winId: string): Promise<boolean> {
            const bar = page.locator(`#${winId} .window-titlebar`);
            const box = await bar.boundingBox();
            if (!box) return false;
            const before = await styleRect(winId);
            const sx = box.x + box.width / 2;
            const sy = box.y + box.height / 2;
            await page.mouse.move(sx, sy);
            await page.mouse.down();
            await page.mouse.move(sx, sy + 90, { steps: 10 });
            await page.mouse.up();
            await page.waitForTimeout(250);
            const after = await styleRect(winId);
            return !!before && !!after && (Math.abs(after.top - before.top) > 5 || Math.abs(after.left - before.left) > 5);
        }

        async function closeViaTitlebar(winId: string): Promise<boolean> {
            await page.locator(`#${winId} .window-titlebar-close`).click();
            await page.waitForTimeout(400);
            return page.evaluate((wid) => {
                const el = document.getElementById(wid);
                return !el || getComputedStyle(el).display === 'none';
            }, winId);
        }

        // All non-main top-level windows — secondary frames AND dialogs — must
        // have a DOM title bar, be draggable by it, and close via its × button.
        for (const label of [
            'Open Full GL Frame',
            'Open Rich GL Frame',
            'Open Small Frame',
            'Open Modeless Dialog',
        ]) {
            const id = await openWindow(label);
            const hasBar = await page.locator(`#${id} .window-titlebar`).count();
            expect(hasBar, `${label} should have a DOM title bar`).toBe(1);

            // Root-cause check: even with main-frame DOM controls present, the title
            // bar is the top hit-test element at its own location.
            const moved = await dragViaTitlebar(id);
            expect(moved, `${label} should be draggable by its DOM title bar`).toBe(true);

            const closed = await closeViaTitlebar(id);
            expect(closed, `${label} should close via its × button`).toBe(true);
        }
    });
});
