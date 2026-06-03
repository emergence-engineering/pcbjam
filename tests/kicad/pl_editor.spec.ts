import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
    clickByLabel,
    clickMenuBarItem,
    clickMenuItem,
} from '../e2e/utils/element-tracker';

/**
 * pl_editor (drawing-sheet editor) WASM E2E Tests
 *
 * Mirrors eeschema.spec.ts. Smoke + the wxFileDialog folder-navigation
 * regression we fixed at the wxWidgets level (filedlgg.cpp). The widget-level
 * coverage lives in tests/e2e/filedialog-folder-nav.spec.ts; this file proves
 * the fix also works through pl_editor's own File menu.
 */

async function completeWizard(page: Page): Promise<void> {
    await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });
    await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 90000 });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/pl_editor-wizard-00-initial.png', scale: 'device' });

    for (let i = 1; i <= 10; i++) {
        let clicked = await clickByLabel(page, 'Next >');

        if (!clicked) {
            clicked = await clickByLabel(page, 'Finish');

            if (clicked) {
                await page.waitForTimeout(500);
                await page.screenshot({
                    path: `test-results/pl_editor-wizard-${String(i).padStart(2, '0')}-finish.png`,
                    scale: 'device'
                });
            }

            break;
        }

        await page.waitForTimeout(500);
        await page.screenshot({
            path: `test-results/pl_editor-wizard-${String(i).padStart(2, '0')}.png`,
            scale: 'device'
        });
    }

    await page.waitForTimeout(2000);
}

function hasAbort(testLogger: { consoleLogs: string[]; errors: string[] }): boolean {
    return [...testLogger.consoleLogs, ...testLogger.errors].some(line => line.includes('Aborted('));
}

test.describe('pl_editor WASM', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/kicad/pl_editor.html');
    });

    test('app loads, canvas visible, no WASM abort', async ({ page, testLogger }) => {
        await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });
        await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 90000 });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: 'test-results/pl_editor-01-loaded.png', scale: 'device' });

        expect(hasAbort(testLogger), 'no WASM abort during load').toBe(false);

        const canvasCount = await page.locator('canvas').count();
        expect(canvasCount).toBeGreaterThan(0);
    });

    test('first-run wizard is skipped by the seeded config (none appears)', async ({ page, testLogger }) => {
        // The harness seeds a default KiCad config in preRun (like the web app's
        // boot.ts), so STARTWIZARD::CheckAndRun() finds NeedsUserInput()==false and
        // never opens the modal wizard. completeWizard() therefore finds nothing to
        // click and the editor comes straight up. Assert no wizard/dialog is ever
        // visible — the inverse of the old "click through the wizard" flow.
        await completeWizard(page);

        const blockingDialogs = await page.evaluate(() => {
            const registry = window.wxElementRegistry;
            if (!registry) return -1;
            return registry.findAll({ visible: true })
                .filter((el: { typeName: string }) =>
                    /^wxDialog|Wizard/.test(el.typeName))
                .length;
        });
        expect(blockingDialogs, 'no setup wizard/dialog should be visible (seed skipped it)').toBe(0);
        expect(hasAbort(testLogger), 'no WASM abort during launch').toBe(false);

        await page.screenshot({ path: 'test-results/pl_editor-02-no-wizard.png', scale: 'device' });
    });

    test('File menu exposes Open... and Save As...', async ({ page, testLogger }) => {
        await completeWizard(page);

        const fileMenuClicked = await clickMenuBarItem(page, 'File');
        expect(fileMenuClicked, 'File menubar item should be clickable').toBe(true);
        await page.waitForTimeout(400);

        await page.screenshot({ path: 'test-results/pl_editor-03-file-menu.png', scale: 'device' });

        // Menu items are tracked in the "rendered" half of the registry (popup
        // widgets), not the regular findAll({visible:true}) set. Use findAllRendered
        // and filter to menuitem elementType — same pattern as load-pcb-probe.spec.ts.
        const menuLabels = await page.evaluate(() => {
            const registry = window.wxElementRegistry;
            if (!registry || !registry.findAllRendered) return [];
            return registry.findAllRendered({})
                .filter((r: { elementType: string }) => r.elementType === 'menuitem')
                .map((r: { label?: string }) => r.label || '')
                .filter((l: string) => l.length > 0);
        });

        // wxWidgets labels typically end with "..." (three ASCII dots) but some
        // builds use the Unicode horizontal ellipsis "…". Accept either.
        const hasOpen = menuLabels.some(l => /^Open[\.…]/.test(l) || l === 'Open');
        const hasSaveAs = menuLabels.some(l => /^Save As[\.…]/.test(l) || l === 'Save As');
        expect(hasOpen, `menu should contain "Open..." (saw labels: ${menuLabels.slice(0, 30).join(', ')})`).toBe(true);
        expect(hasSaveAs, `menu should contain "Save As..." (saw labels: ${menuLabels.slice(0, 30).join(', ')})`).toBe(true);

        // Dismiss the menu so we don't leak state into the next test.
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        expect(hasAbort(testLogger)).toBe(false);
    });

    test('Save As file dialog: typing a folder + Enter navigates into it (regression)', async ({ page, testLogger }) => {
        await completeWizard(page);

        // Open File > Save As
        await clickMenuBarItem(page, 'File');
        await page.waitForTimeout(300);
        const savedAsClicked = await clickMenuItem(page, 'Save As...');
        expect(savedAsClicked, 'Save As... menu item should be clickable').toBe(true);

        // Wait for the wxFileDialog to appear in the registry.
        await page.waitForFunction(() => {
            const registry = window.wxElementRegistry;
            if (!registry) return false;
            return registry.findAll({ visible: true })
                .some((el: { typeName: string }) => el.typeName === 'wxFileDialog');
        }, null, { timeout: 15000 });

        // The dialog object exists in the registry as soon as C++ constructs it,
        // but the directory enumeration (MEMFS readdir → asyncify suspend) hasn't
        // returned yet so the inner file list isn't painted. Without this wait the
        // screenshot catches the dialog as a black rectangle.
        await page.waitForTimeout(600);

        await page.screenshot({ path: 'test-results/pl_editor-04-save-as-dialog.png', scale: 'device' });

        // The bug: pressing Enter on a folder name treated it as a file and surfaced
        // "Unable to load /dev file". After the OnOk fix, the dialog should navigate
        // into the folder instead.
        await page.keyboard.type('/dev');
        await page.waitForTimeout(200);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(900);

        await page.screenshot({ path: 'test-results/pl_editor-04b-after-enter.png', scale: 'device' });

        // The wxFileDialog should still be visible — we navigated into /dev, didn't close it.
        const dialogStillOpen = await page.evaluate(() => {
            const registry = window.wxElementRegistry;
            if (!registry) return false;
            return registry.findAll({ visible: true })
                .some((el: { typeName: string }) => el.typeName === 'wxFileDialog');
        });
        expect(dialogStillOpen, 'wxFileDialog should remain open after Enter on a folder').toBe(true);

        // The pre-fix error path surfaced "Unable to load <path> file" through KiCad's
        // logger when the folder was returned as a "file". Ensure it didn't fire.
        const unableToLoad = testLogger.consoleLogs.some(l => /Unable to load.*\/dev/.test(l));
        expect(unableToLoad, 'KiCad must not surface "Unable to load /dev file"').toBe(false);

        // Close the dialog cleanly so it doesn't leak to a subsequent step.
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        expect(hasAbort(testLogger)).toBe(false);
    });

    test('canvas + toolbar metrics look sane', async ({ page, testLogger }) => {
        await completeWizard(page);

        const metrics = await page.evaluate(() => {
            const registry = window.wxElementRegistry;
            const all = registry ? registry.findAll({ visible: true }) : [];
            const toolbars = all.filter((el: { typeName: string }) => /ToolBar/.test(el.typeName));
            const glCanvas = document.querySelector('canvas[id*="gl"]') as HTMLCanvasElement | null;

            return {
                registryTotal: all.length,
                toolbarCount: toolbars.length,
                mainCanvasOk: (() => {
                    const c = document.getElementById('canvas') as HTMLCanvasElement | null;
                    return !!c && c.width > 0 && c.height > 0;
                })(),
                glCanvasOk: !!glCanvas && glCanvas.width > 0 && glCanvas.height > 0,
            };
        });

        expect(metrics.registryTotal, 'registry should be populated').toBeGreaterThan(10);
        expect(metrics.toolbarCount, 'at least one toolbar should be visible').toBeGreaterThanOrEqual(1);
        expect(metrics.mainCanvasOk, 'main canvas has nonzero dimensions').toBe(true);
        expect(metrics.glCanvasOk, 'GL canvas has nonzero dimensions').toBe(true);
        expect(hasAbort(testLogger)).toBe(false);
    });
});
