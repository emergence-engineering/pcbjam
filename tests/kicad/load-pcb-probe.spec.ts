import * as fs from 'fs';
import * as path from 'path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { clickByLabel, clickMenuBarItem, clickMenuItem } from '../e2e/utils/element-tracker';

/**
 * Probe spec: drives the wizard, opens File menu, clicks Open, then dumps
 * everything we need to know about the wxFileDialog state — what frame paints,
 * what directory the dialog starts in, what list items are registered, what
 * the OK/Cancel button labels are, and which MEMFS directories exist.
 *
 * Output:
 *   tests/logs/kicad/load-pcb-probe/<test-name>.log       (everything via console)
 *   tests/test-results/probe-*.png                        (screenshots)
 *
 * This is a one-shot investigation, not a regression test. It always passes;
 * the value is the captured state.
 */

async function completeWizard(page: Page): Promise<void> {
    await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });
    await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 90000 });
    // Registry object ≠ app booted: wait for real UI entries (the wizard is the
    // first window) so the bounded click loop below doesn't start too early.
    // CI boots slower (baseline-JIT wasm + software GL under xvfb).
    await page.waitForFunction(() => {
        const registry = window.wxElementRegistry;
        return !!registry && registry.findAll({}).length > 0;
    }, null, { timeout: 150000 });
    await page.waitForTimeout(2000);

    for (let i = 1; i <= 10; i++) {
        let clicked = await clickByLabel(page, 'Next >');

        if (!clicked) {
            clicked = await clickByLabel(page, 'Finish');
            break;
        }

        await page.waitForTimeout(500);
    }

    await page.waitForTimeout(2000);
}

async function dumpRegistry(page: Page, label: string): Promise<void> {
    const summary = await page.evaluate((tag: string) => {
        const registry = window.wxElementRegistry;
        if (!registry) {
            return { tag, error: 'no registry' };
        }

        const stats = registry.getStats();
        const renderedStats = registry.getRenderedStats?.();

        const allElements = registry.findAll({ visible: true });

        const frames = allElements
            .filter((el) => /Frame|Dialog|Wizard/.test(el.typeName))
            .slice(0, 30)
            .map((el) => ({
                id: el.id,
                typeName: el.typeName,
                label: el.label,
                name: el.name,
                visible: el.visible,
                enabled: el.enabled,
                screenX: el.screenX,
                screenY: el.screenY,
                width: el.width,
                height: el.height,
            }));

        // Try to spot the file dialog specifically
        const fileDialogs = allElements
            .filter((el) =>
                /FileDialog|FileCtrl|FileList|GenericDir/.test(el.typeName) ||
                /file/i.test(el.label) ||
                /file/i.test(el.name)
            )
            .slice(0, 50)
            .map((el) => ({
                id: el.id,
                typeName: el.typeName,
                label: el.label,
                name: el.name,
                visible: el.visible,
                screenX: el.screenX,
                screenY: el.screenY,
                width: el.width,
                height: el.height,
            }));

        const rendered = registry.findAllRendered ? registry.findAllRendered({}) : [];
        const byType = rendered.reduce<Record<string, number>>((acc, item) => {
            acc[item.elementType] = (acc[item.elementType] ?? 0) + 1;
            return acc;
        }, {});

        const menuItems = rendered
            .filter((r) => r.elementType === 'menuitem')
            .slice(0, 60)
            .map((r) => ({
                id: r.id,
                subType: r.subType,
                label: r.label,
                enabled: r.enabled,
                screenX: r.screenX,
                screenY: r.screenY,
            }));

        const listItems = rendered
            .filter((r) => r.elementType === 'listitem')
            .slice(0, 60)
            .map((r) => ({
                id: r.id,
                label: r.label,
                index: r.index,
                screenX: r.screenX,
                screenY: r.screenY,
            }));

        // Buttons (rendered as wxButton in elements, not in rendered registry)
        const buttons = allElements
            .filter((el) => /Button/.test(el.typeName))
            .slice(0, 40)
            .map((el) => ({
                id: el.id,
                typeName: el.typeName,
                label: el.label,
                name: el.name,
                screenX: el.screenX,
                screenY: el.screenY,
            }));

        // Text controls (path bar in dialog is usually a wxTextCtrl)
        const textCtrls = allElements
            .filter((el) => /TextCtrl|ComboCtrl|ComboBox|Choice/.test(el.typeName))
            .slice(0, 30)
            .map((el) => ({
                id: el.id,
                typeName: el.typeName,
                label: el.label,
                name: el.name,
                screenX: el.screenX,
                screenY: el.screenY,
                width: el.width,
                height: el.height,
            }));

        return {
            tag,
            stats,
            renderedStats,
            renderedByType: byType,
            frames,
            fileDialogs,
            menuItems,
            listItems,
            buttons,
            textCtrls,
        };
    }, label);

    // Logged via console so it lands in tests/logs/kicad/load-pcb-probe/<test>.log
    console.log(`[PROBE] ${label} :: ${JSON.stringify(summary)}`);
}

async function dumpMemfs(page: Page, candidates: string[]): Promise<void> {
    const results = await page.evaluate((paths: string[]) => {
        const out: Array<{ path: string; entries: string[] | string }> = [];
        for (const p of paths) {
            try {
                // @ts-ignore — Emscripten FS is global on Module
                const entries = (window as any).FS.readdir(p) as string[];
                out.push({ path: p, entries });
            } catch (e: any) {
                out.push({ path: p, entries: `ERROR: ${e?.message ?? e}` });
            }
        }
        return out;
    }, candidates);

    console.log(`[PROBE-FS] ${JSON.stringify(results)}`);
}

test.describe('PCB load probe', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/kicad/pcbnew.html');
    });

    test('inspect File→Open dialog state', async ({ page }) => {
        await completeWizard(page);

        await page.screenshot({ path: 'test-results/probe-00-after-wizard.png', scale: 'device' });

        await dumpMemfs(page, [
            '/',
            '/home',
            '/home/kicad',
            '/home/kicad/documents',
            '/home/kicad/documents/kicad',
            '/home/kicad/documents/kicad/9.99',
            '/home/kicad/documents/kicad/9.99/projects',
            '/tmp',
            '/workspace',
        ]);

        await dumpRegistry(page, 'after-wizard');

        // Click File menu
        const fileClicked = await clickMenuBarItem(page, 'File');
        console.log(`[PROBE] File menu clicked: ${fileClicked}`);
        await page.waitForTimeout(500);

        await page.screenshot({ path: 'test-results/probe-01-file-menu-open.png', scale: 'device' });
        await dumpRegistry(page, 'file-menu-open');

        // Click Open menu item (try common label variants)
        let openClicked = await clickMenuItem(page, 'Open...');
        if (!openClicked) openClicked = await clickMenuItem(page, 'Open…');
        if (!openClicked) openClicked = await clickMenuItem(page, 'Open');
        console.log(`[PROBE] Open menu item clicked: ${openClicked}`);

        // Give the file dialog generous time to render — wxGenericFileDialog
        // populates its file list by scanning the directory, which on MEMFS
        // is fast but goes through the Asyncify loop.
        await page.waitForTimeout(3000);

        await page.screenshot({ path: 'test-results/probe-02-after-open-click.png', scale: 'device' });
        await dumpRegistry(page, 'after-open-click');

        // Wait a bit longer and dump again, in case the dialog paints late
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/probe-03-late.png', scale: 'device' });
        await dumpRegistry(page, 'late');

        // Final check: re-dump MEMFS so we can confirm nothing changed under us
        await dumpMemfs(page, [
            '/home/kicad/documents/kicad/9.99/projects',
            '/tmp',
        ]);

        // Probe is always green — the artifacts (logs + screenshots) are the result.
        expect(true).toBe(true);
    });
});
