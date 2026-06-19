import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
    clickByLabel,
    clickByTooltip,
    clickMenuBarItem,
    clickMenuItem,
    findByLabel,
} from '../e2e/utils/element-tracker';

/**
 * Gerber Viewer Print dialog — regression for emergence-engineering/pcbjam#14.
 *
 * In the browser, KiCad's generic Print dialog used to show a "Print Preview"
 * button (wxID_APPLY) that the DOM/WASM port can't honor: the in-app
 * wxPreviewFrame is opened window-modal from inside the already-modal Print
 * dialog, which the port can't render over an active modal — clicking it did
 * nothing and wedged the dialog so it would not reopen.
 *
 * The fix hides that button in the browser build (the same way native KiCad
 * already hides it on macOS/GTK), since the browser provides its own print
 * preview. This test loads the tiny_tapeout demo board, opens the Print dialog,
 * and asserts (a) there is no visible "Print Preview" button and (b) the dialog
 * can be closed and reopened — i.e. the modal state is no longer wedged.
 */

function hasAbort(testLogger: { consoleLogs: string[]; errors: string[] }): boolean {
    return [...testLogger.consoleLogs, ...testLogger.errors].some(line => line.includes('Aborted('));
}

// The Print dialog is detected by its unique OK button, labelled exactly
// "Print" (wxID_OK). Toolbar/menu print entries are rendered tools / menu items
// (a separate registry) or carry the "..." ellipsis, so they don't match here —
// a visible exact-"Print" element means the modal Print dialog is open.
async function printDialogIsOpen(page: Page): Promise<boolean> {
    return (await findByLabel(page, 'Print', { visible: true, exact: true })) !== null;
}

async function waitForPrintDialog(page: Page, open: boolean, timeout = 8000): Promise<void> {
    await page.waitForFunction(
        (wantOpen: boolean) => {
            const registry = window.wxElementRegistry;
            if (!registry) return false;
            const isOpen = registry.findByLabel('Print', { visible: true, exact: true }).length > 0;
            return isOpen === wantOpen;
        },
        open,
        { timeout },
    );
}

async function waitForGerbview(page: Page): Promise<void> {
    await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });
    await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 90000 });
    await page.waitForFunction(() => {
        const registry = window.wxElementRegistry;
        return !!registry && registry.findAll({}).length > 0;
    }, null, { timeout: 90000 });

    // The config is seeded to suppress the first-run wizard, but dismiss it
    // defensively in case it still appears (harmless when there is none).
    for (let i = 0; i < 6; i++) {
        if (!(await clickByLabel(page, 'Next >'))) {
            await clickByLabel(page, 'Finish');
            break;
        }
        await page.waitForTimeout(300);
    }

    // Let the demo board load and the viewer chrome settle. The Print Preview
    // button is hidden unconditionally in the WASM build, so the assertions
    // don't actually depend on the layers being fully parsed — this is mostly
    // for a faithful screenshot.
    await page.waitForTimeout(4000);
}

// Open the Print dialog. In gerbview, Print is a top-toolbar tool (not a File
// menu item), so click that; fall back to a File -> Print… menu path in case the
// UI changes ("..." vs unicode "…").
async function openPrintDialog(page: Page): Promise<void> {
    if (!(await clickByTooltip(page, 'Print'))) {
        await clickMenuBarItem(page, 'File');
        await page.waitForTimeout(500);
        let opened = await clickMenuItem(page, 'Print...');
        if (!opened) opened = await clickMenuItem(page, 'Print…');
        if (!opened) await clickMenuItem(page, 'Print');
    }

    await waitForPrintDialog(page, true);
}

// Close the modal Print dialog. Escape cancels a wxDialog; fall back to the
// Close button if needed. Poll for the dialog to actually disappear.
async function closePrintDialog(page: Page): Promise<void> {
    for (const how of ['escape', 'close', 'escape'] as const) {
        if (how === 'escape') {
            await page.keyboard.press('Escape').catch(() => {});
        } else {
            await clickByLabel(page, 'Close', { visible: true, exact: true });
        }
        try {
            await waitForPrintDialog(page, false, 3000);
            return;
        } catch {
            // try the next method
        }
    }
    // Final assertion happens in the test; surface the still-open state there.
    await waitForPrintDialog(page, false, 1000);
}

test.describe('gerbview Print dialog (WASM)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/kicad/gerbview-print.html');
    });

    test('no Print Preview button, and the dialog reopens (no wedge)', async ({ page, testLogger }) => {
        await waitForGerbview(page);
        await page.screenshot({ path: 'test-results/gerbview-print-00-loaded.png', scale: 'device' });

        // --- Open the Print dialog ---
        await openPrintDialog(page);
        expect(await printDialogIsOpen(page), 'Print dialog should be open').toBe(true);
        await page.screenshot({ path: 'test-results/gerbview-print-01-dialog.png', scale: 'device' });

        // --- The broken "Print Preview" button must be gone in the browser ---
        const preview = await findByLabel(page, 'Print Preview', { visible: true, exact: true });
        expect(preview, 'Print Preview button must be hidden in the browser build').toBeNull();

        // Sanity: this really is the Print dialog (Close + Page Setup present too).
        expect(await findByLabel(page, 'Close', { visible: true, exact: true }),
            'Close button present').not.toBeNull();

        // --- Close it ---
        await closePrintDialog(page);
        expect(await printDialogIsOpen(page), 'dialog should close').toBe(false);

        // --- Regression: reopening Print must work (it used to wedge) ---
        await openPrintDialog(page);
        expect(await printDialogIsOpen(page), 'Print dialog should reopen (no wedge)').toBe(true);
        await page.waitForTimeout(2500); // let the reopened dialog finish painting before capture
        await page.screenshot({ path: 'test-results/gerbview-print-02-reopened.png', scale: 'device' });

        expect(hasAbort(testLogger), 'no WASM abort during the flow').toBe(false);
    });
});
