import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
    clickMenuBarItem,
    clickMenuItemByText,
    waitForEditorReady,
    waitUntil,
    stableShot,
} from '../e2e/utils/element-tracker';

/**
 * Click routing across stacked modal dialogs, reproduced on pcbnew's deepest
 * built-in modal chain: Board Setup → "Import Settings from Another Board..."
 * → DIALOG_IMPORT_SETTINGS → browse → "Import Settings From" (wxFileDialog).
 *
 * Bug: with the file dialog (modal 3) on top, a click inside its bounds over a
 * canvas-drawn region (the file list) is caught by the still-active controls of
 * the Import Settings dialog (modal 2) underneath — its checkboxes toggle even
 * though a modal is stacked above them. Desktop wx disables the windows below a
 * modal; the wasm port must match: however the fix is implemented, a click
 * inside the top modal must never reach the modal below it.
 *
 * The test first proves the mechanism (with modal 2 on top, clicking point P
 * toggles the checkbox under P), then reopens modal 3 and asserts the SAME
 * point no longer toggles it.
 *
 * Geometry note: all click points come from live DOM rects, not the element
 * registry — registry positions of a dialog's children are captured before the
 * dialog is centered on screen and can be stale (see the wx TLW divs in
 * #window-container; DOM controls always track the real layout).
 */

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Wait for a rendered popup menu to have its items (occ-export.spec.ts pattern). */
async function waitForMenuItems(page: Page): Promise<void> {
    await waitUntil(
        page,
        () => {
            const r = window.wxElementRegistry;
            if (!r?.findAllRendered) return false;
            return r.findAllRendered({ elementType: 'menuitem' }).length > 3;
        },
        'popup menu items rendered',
    );
}

/**
 * Wait until a wx top-level window div is visible and its rect has stopped
 * moving (equal across consecutive animation frames) — dialogs are created at a
 * default position and centered afterwards, so a rect read too early clicks air.
 */
async function waitForSettledWindowDiv(page: Page, divId: string, desc: string): Promise<void> {
    await waitUntil(
        page,
        (id: string) => {
            const el = document.getElementById(id);
            if (!el || getComputedStyle(el).display === 'none') return false;
            const r = el.getBoundingClientRect();
            if (r.width < 50 || r.height < 50) return false;
            const cur = `${r.x},${r.y},${r.width},${r.height}`;
            const w = window as unknown as Record<string, string>;
            const key = `__rectSettle_${id}`;
            const prev = w[key];
            w[key] = cur;
            return prev === cur;
        },
        `${desc} settled on screen`,
        { arg: divId, timeout: 20000, polling: 'raf' },
    );
}

/** Ids of the currently visible wx top-level window divs. */
async function visibleWindowDivIds(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('#window-container > [id^="window-"]'))
            .filter((d) => getComputedStyle(d).display !== 'none')
            .map((d) => d.id));
}

/** Viewport rect of a window div. */
async function windowDivRect(page: Page, divId: string): Promise<Rect> {
    const r = await page.evaluate((id: string) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
    }, divId);
    expect(r, `window div ${divId} must exist`).not.toBeNull();
    if (!r) throw new Error(`window div ${divId} missing`);
    return r;
}

/**
 * Center of a DOM button inside `divId` whose text (mnemonics stripped) starts
 * with `text`; null if absent.
 */
async function buttonCenter(page: Page, divId: string, text: string): Promise<{ x: number; y: number } | null> {
    return page.evaluate(({ id, want }: { id: string; want: string }) => {
        const root = document.getElementById(id);
        if (!root) return null;
        const btn = Array.from(root.querySelectorAll('button')).find((b) =>
            (b.textContent ?? '').replace(/&/g, '').trim().startsWith(want));
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, { id: divId, want: text });
}

/** Checked state of the wx checkbox labelled `labelText` inside `divId` (null = not found). */
async function checkboxChecked(page: Page, divId: string, labelText: string): Promise<boolean | null> {
    return page.evaluate(({ id, t }: { id: string; t: string }) => {
        const root = document.getElementById(id);
        if (!root) return null;
        const rows = Array.from(root.querySelectorAll('label'));
        const row = rows.find((l) =>
            !!l.querySelector('input[type=checkbox]')
            && l.querySelector('span.wx-label')?.textContent === t);
        if (!row) return null;
        return (row.querySelector('input[type=checkbox]') as HTMLInputElement).checked;
    }, { id: divId, t: labelText });
}

/**
 * Click the Import Settings browse button and wait for the "Import Settings
 * From" file dialog to appear and settle; returns its window div id and rect.
 */
async function openBrowseFileDialog(
    page: Page,
    importDivId: string,
): Promise<{ divId: string; rect: Rect }> {
    const before = await visibleWindowDivIds(page);

    // The browse control (STD_BITMAP_BUTTON) is a wxPanel painted onto the dialog
    // canvas, not a DOM button — so there is no element to query. It sits in the
    // horizontal gap between the file-path text input's right edge and the dialog's
    // right edge, vertically centered on the input; clicking there reaches it via
    // the C++ canvas hit-test.
    const browse = await page.evaluate((id: string) => {
        const root = document.getElementById(id);
        if (!root) return null;
        const input = root.querySelector('input.wx-dom-control') as HTMLElement | null;
        if (!input) return null;
        const dr = root.getBoundingClientRect();
        const ir = input.getBoundingClientRect();
        return { x: (ir.x + ir.width + dr.x + dr.width) / 2, y: ir.y + ir.height / 2 };
    }, importDivId);
    expect(browse, 'browse (folder) button position in Import Settings').not.toBeNull();
    if (!browse) throw new Error('browse button not found');
    await page.mouse.click(browse.x, browse.y);

    await waitUntil(
        page,
        (prev: string[]) => {
            const fresh = Array.from(document.querySelectorAll('#window-container > [id^="window-"]'))
                .filter((d) => getComputedStyle(d).display !== 'none' && !prev.includes(d.id));
            // The file dialog is built once it has a filename input and a Cancel button.
            return fresh.some((d) =>
                d.querySelector('input')
                && Array.from(d.querySelectorAll('button')).some((b) =>
                    (b.textContent ?? '').replace(/&/g, '').trim() === 'Cancel'));
        },
        'browse file dialog open with its controls built',
        { arg: before, timeout: 20000 },
    );
    const divId = await page.evaluate((prev: string[]) => {
        const fresh = Array.from(document.querySelectorAll('#window-container > [id^="window-"]'))
            .filter((d) => getComputedStyle(d).display !== 'none' && !prev.includes(d.id))
            .find((d) => d.querySelector('input'));
        return fresh ? fresh.id : null;
    }, before);
    expect(divId, 'file dialog window div').not.toBeNull();
    if (!divId) throw new Error('file dialog div not found');

    // It must be the registry-visible wxFileDialog (the browse target). Dialog
    // titles are not carried in the registry `label` field, so match on typeName.
    await waitUntil(
        page,
        () => {
            const r = window.wxElementRegistry;
            if (!r) return false;
            return r.findAll({ visible: true }).some((e) => e.typeName === 'wxFileDialog');
        },
        'wxFileDialog registered',
    );

    await waitForSettledWindowDiv(page, divId, 'file dialog');
    return { divId, rect: await windowDivRect(page, divId) };
}

test.describe('stacked-modal click routing (Board Setup → Import Settings → browse)', () => {
    test.describe.configure({ mode: 'serial' });
    test.setTimeout(240000);

    test('a click inside the top modal must not reach the modal below it', async ({ page }) => {
        await page.goto('/kicad/pcbnew.html');
        await waitForEditorReady(page);

        // ---- Modal 1: File → Board Setup... ----
        expect(await clickMenuBarItem(page, 'File'), 'File menu should be findable').toBe(true);
        await waitForMenuItems(page);
        await clickMenuItemByText(page, 'Board Setup');

        const IMPORT_BTN = 'Import Settings from Another Board';
        await waitUntil(
            page,
            (want: string) => Array.from(document.querySelectorAll('#window-container button'))
                .some((b) => (b.textContent ?? '').startsWith(want)),
            'Board Setup dialog with its Import Settings button',
            { arg: IMPORT_BTN, timeout: 30000 },
        );
        const boardSetupDivId = await page.evaluate((want: string) => {
            const btn = Array.from(document.querySelectorAll('#window-container button'))
                .find((b) => (b.textContent ?? '').startsWith(want));
            return btn?.closest('[id^="window-"]')?.id ?? null;
        }, IMPORT_BTN);
        expect(boardSetupDivId, 'Board Setup window div').not.toBeNull();
        if (!boardSetupDivId) throw new Error('board setup div not found');
        await waitForSettledWindowDiv(page, boardSetupDivId, 'Board Setup dialog');

        // ---- Modal 2: Import Settings ----
        const importBtn = await buttonCenter(page, boardSetupDivId, IMPORT_BTN);
        expect(importBtn, 'Import Settings from Another Board... button').not.toBeNull();
        if (!importBtn) throw new Error('import settings button not found');
        await page.mouse.click(importBtn.x, importBtn.y);

        await waitUntil(
            page,
            () => Array.from(document.querySelectorAll('#window-container span.wx-label'))
                .some((s) => s.textContent === 'Net classes'),
            'Import Settings dialog open (checkboxes in the DOM)',
            { timeout: 20000 },
        );
        const importDivId = await page.evaluate(() => {
            const span = Array.from(document.querySelectorAll('#window-container span.wx-label'))
                .find((s) => s.textContent === 'Net classes');
            return span?.closest('[id^="window-"]')?.id ?? null;
        });
        expect(importDivId, 'Import Settings window div').not.toBeNull();
        if (!importDivId) throw new Error('import settings div not found');
        await waitForSettledWindowDiv(page, importDivId, 'Import Settings dialog');

        // ---- Modal 3: browse → "Import Settings From" file dialog ----
        const fileDlg1 = await openBrowseFileDialog(page, importDivId);

        // Pick P: an Import Settings checkbox row covered by the file dialog (inset
        // from its edges so P sits over the canvas-drawn file list, not dialog chrome).
        const INSET = 30;
        const pick = await page.evaluate(({ importId, fd, inset }: {
            importId: string; fd: Rect; inset: number;
        }) => {
            const root = document.getElementById(importId)!;
            const rows = Array.from(root.querySelectorAll('label'))
                .filter((l) => !!l.querySelector('input[type=checkbox]')
                    && !!l.querySelector('span.wx-label')?.textContent)
                .map((l) => {
                    const r = l.getBoundingClientRect();
                    return {
                        label: l.querySelector('span.wx-label')!.textContent!,
                        x: r.x + r.width / 2,
                        y: r.y + r.height / 2,
                    };
                })
                .filter((c) =>
                    c.x > fd.x + inset && c.x < fd.x + fd.w - inset
                    && c.y > fd.y + inset && c.y < fd.y + fd.h - inset);
            const cx = fd.x + fd.w / 2;
            const cy = fd.y + fd.h / 2;
            rows.sort((a, b) =>
                ((a.x - cx) ** 2 + (a.y - cy) ** 2) - ((b.x - cx) ** 2 + (b.y - cy) ** 2));
            return { count: rows.length, cb: rows[0] ?? null };
        }, { importId: importDivId, fd: fileDlg1.rect, inset: INSET });
        console.log(`[TEST] checkboxes covered by the file dialog: ${pick.count}`);
        expect(pick.cb,
            'the file dialog must cover at least one Import Settings checkbox '
            + '(if layouts changed, drag the file dialog over the Import Settings dialog first)')
            .not.toBeNull();
        if (!pick.cb) throw new Error('no covered checkbox');
        const P = { x: pick.cb.x, y: pick.cb.y };
        const CB = pick.cb.label;
        console.log(`[TEST] P=(${P.x},${P.y}) over checkbox "${CB}"`);

        await stableShot(page, 'import-settings-modal-stack.png', { fullPage: true });

        // Diagnostic only (not asserted — the fix may legitimately change what the
        // browser hit-test returns here): what DOM element sits at P right now?
        const atP = await page.evaluate(({ x, y }: { x: number; y: number }) => {
            const el = document.elementFromPoint(x, y);
            const win = el?.closest('[id^="window-"]');
            return el ? `${el.tagName}.${el.className} in ${win?.id ?? 'no-window'}` : 'none';
        }, P);
        console.log(`[TEST] elementFromPoint(P) with 3 modals open: ${atP}`);

        // ---- Close modal 3, prove P toggles the checkbox while modal 2 is on top ----
        const cancel3 = await buttonCenter(page, fileDlg1.divId, 'Cancel');
        expect(cancel3, 'the file dialog\'s own Cancel button').not.toBeNull();
        if (!cancel3) throw new Error('file dialog Cancel not found');
        await page.mouse.click(cancel3.x, cancel3.y);
        await waitUntil(
            page,
            (id: string) => {
                const el = document.getElementById(id);
                return !el || getComputedStyle(el).display === 'none';
            },
            'file dialog closed',
            { arg: fileDlg1.divId },
        );

        expect(await checkboxChecked(page, importDivId, CB),
            `"${CB}" must start unchecked`).toBe(false);
        // DOM checkbox activation is synchronous with the dispatched click — the state
        // is final when page.mouse.click resolves, so these reads need no settling wait.
        await page.mouse.click(P.x, P.y);
        expect(await checkboxChecked(page, importDivId, CB),
            `sanity: with Import Settings on top, clicking P must toggle "${CB}" ON`).toBe(true);
        await page.mouse.click(P.x, P.y);
        expect(await checkboxChecked(page, importDivId, CB),
            `sanity: clicking P again must toggle "${CB}" back OFF`).toBe(false);

        // ---- Reopen modal 3 and make the same click with it stacked on top ----
        const fileDlg2 = await openBrowseFileDialog(page, importDivId);
        expect(
            P.x > fileDlg2.rect.x + INSET && P.x < fileDlg2.rect.x + fileDlg2.rect.w - INSET
            && P.y > fileDlg2.rect.y + INSET && P.y < fileDlg2.rect.y + fileDlg2.rect.h - INSET,
            `P=(${P.x},${P.y}) must still be inside the reopened file dialog `
            + `(${JSON.stringify(fileDlg2.rect)})`,
        ).toBe(true);

        await page.mouse.click(P.x, P.y);

        // THE regression assertion: the click was inside the top modal, so the modal
        // below must not have received it.
        expect(await checkboxChecked(page, importDivId, CB),
            `click at P=(${P.x},${P.y}) inside the top file dialog must NOT toggle the `
            + `"${CB}" checkbox in the Import Settings dialog stacked below it`).toBe(false);

        // Corroboration: Import Settings' OK button ("Import Settings") only enables
        // once a checkbox is ticked, so it must still be disabled.
        const okDisabled = await page.evaluate((id: string) => {
            const root = document.getElementById(id);
            if (!root) return null;
            const btn = Array.from(root.querySelectorAll('button')).find((b) =>
                (b.textContent ?? '').replace(/&/g, '').trim() === 'Import Settings');
            return btn ? (btn as HTMLButtonElement).disabled : null;
        }, importDivId);
        expect(okDisabled,
            'the Import Settings OK button must not be enabled by a click aimed at the file dialog')
            .toBe(true);

        // The file dialog itself must still be open — the click stayed within it.
        const fileDlgStillOpen = await page.evaluate((id: string) => {
            const el = document.getElementById(id);
            return !!el && getComputedStyle(el).display !== 'none';
        }, fileDlg2.divId);
        expect(fileDlgStillOpen, 'the file dialog must remain open after the click').toBe(true);
    });
});
