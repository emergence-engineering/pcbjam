import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
    clickByLabel,
    clickByTooltip,
    clickMenuBarItem,
    clickMenuItem,
    findByLabel,
    waitForEditorReady,
    waitForRenderedByLabel, stableShot } from '../e2e/utils/element-tracker';

/**
 * Gerber Viewer Print dialog — regression for emergence-engineering/pcbjam#14.
 *
 * In the browser, KiCad's generic Print dialog used to show a "Print Preview"
 * button (wxID_APPLY) that the DOM/WASM port can't honor: the in-app
 * wxPreviewFrame is opened window-modal from inside the already-modal Print
 * dialog, which the port can't render over an active modal — clicking it did
 * nothing and wedged the dialog so it would not reopen.
 *
 * The fix hides that button in the browser build. This test loads the tiny_tapeout
 * demo board, opens the Print dialog, and asserts (a) there is no visible "Print
 * Preview" button and (b) the dialog can be closed and reopened — i.e. the modal
 * state is no longer wedged. Deterministic: no waitForTimeout; screenshots via
 * stableShot (stabilizes the board/dialog paint before comparing).
 */

function hasAbort(testLogger: { consoleLogs: string[]; errors: string[] }): boolean {
    return [...testLogger.consoleLogs, ...testLogger.errors].some(line => line.includes('Aborted('));
}

// The Print dialog is detected by its unique OK button, labelled exactly "Print".
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

// Open the Print dialog. In gerbview, Print is a top-toolbar tool — click it and
// assert (a missing tool is a real regression, not something to silently work around).
async function openPrintDialog(page: Page): Promise<void> {
    expect(await clickByTooltip(page, 'Print'), 'Print toolbar tool should be clickable').toBe(true);
    await waitForPrintDialog(page, true);
}

// Close the modal Print dialog. Escape cancels a wxDialog; fall back to the Close
// button if needed. Poll for the dialog to actually disappear.
async function closePrintDialog(page: Page): Promise<void> {
    for (const how of ['escape', 'close', 'escape'] as const) {
        if (how === 'escape') {
            await page.keyboard.press('Escape');
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
    await waitForPrintDialog(page, false, 1000);
}

test.describe('gerbview Print dialog (WASM)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/kicad/gerbview-print.html');
    });

    test('no Print Preview button, and the dialog reopens (no wedge)', async ({ page, testLogger }) => {
        await waitForEditorReady(page);
        await stableShot(page, 'gerbview-print-00-loaded.png');

        // --- Open the Print dialog ---
        await openPrintDialog(page);
        expect(await printDialogIsOpen(page), 'Print dialog should be open').toBe(true);
        await stableShot(page, 'gerbview-print-01-dialog.png');

        // --- The broken "Print Preview" button must be gone in the browser ---
        const preview = await findByLabel(page, 'Print Preview', { visible: true, exact: true });
        expect(preview, 'Print Preview button must be hidden in the browser build').toBeNull();

        // Sanity: this really is the Print dialog (Close present too).
        expect(await findByLabel(page, 'Close', { visible: true, exact: true }),
            'Close button present').not.toBeNull();

        // --- Close it ---
        await closePrintDialog(page);
        expect(await printDialogIsOpen(page), 'dialog should close').toBe(false);

        // --- Regression: reopening Print must work (it used to wedge) ---
        await openPrintDialog(page);
        expect(await printDialogIsOpen(page), 'Print dialog should reopen (no wedge)').toBe(true);
        await stableShot(page, 'gerbview-print-02-reopened.png');

        expect(hasAbort(testLogger), 'no WASM abort during the flow').toBe(false);
    });
});
