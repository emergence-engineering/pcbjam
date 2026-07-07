import { test, expect } from './fixtures';
import { clickMenuBarItem, waitUntil, stableShot } from '../e2e/utils/element-tracker';

/**
 * Cross-face probe for the merged kicad_editor bundle (editor-unification Part 2).
 *
 * Boots the SCHEMATIC face (--frame=sch) and opens Preferences. Building the
 * preferences dialog walks EVERY registered kiface (eda_base_frame.cpp calls
 * KiFACE(FACE_SCH) AND KiFACE(FACE_PCB)) — so in the merged image this lazily
 * OnKifaceStart()s the PCB engine INSIDE a schematic session, the exact cross-face
 * path that footprint previews in the symbol chooser use. On the old single-kiface
 * eeschema bundle KiFACE(FACE_PCB) returned nullptr and the PCB pages were absent.
 *
 * Asserts: the dialog opens, the runtime survives (no abort — a mis-registered or
 * ODR-corrupted PCB kiface would crash construction of its preference pages), and —
 * if the registry exposes the page tree — that PCB-side page labels are present.
 */

test.describe('merged bundle cross-face (schematic session starts the PCB kiface)', () => {
    test('opening Preferences in --frame=sch builds both engines\' pages without aborting', async ({ page, testLogger }) => {
        const consoleLines: string[] = [];
        page.on('console', (m) => consoleLines.push(m.text()));

        await page.goto('/kicad/eeschema.html');
        await expect(page.locator('#canvas')).toBeVisible({ timeout: 120000 });
        await expect
            .poll(() => page.title(), { timeout: 120000, intervals: [1000] })
            .toMatch(/Schematic Editor/i);

        // Open Preferences → Preferences… . NOTE: clickMenuItem('Preferences') would
        // match the MENUBAR item again (same elementType) and toggle the menu shut —
        // find the POPUP entry explicitly (not subType 'menubar') and click its coords.
        const menuClicked = await clickMenuBarItem(page, 'Preferences');
        expect(menuClicked, 'Preferences menubar item should be clickable').toBe(true);
        // Wait for the popup Preferences… item to render (replaces a fixed 600ms).
        await waitUntil(
            page,
            () => {
                const reg = window.wxElementRegistry;
                if (!reg?.findAllRendered) return false;
                return reg.findAllRendered({ elementType: 'menuitem' })
                    .some((i) => i.subType !== 'menubar' && /Preferences/i.test(i.label ?? ''));
            },
            'Preferences… popup item rendered',
        );

        const popupItem = await page.evaluate(() => {
            const reg = (window as unknown as {
                wxElementRegistry?: {
                    findAllRendered?(f: object): {
                        label?: string; subType?: string; centerX: number; centerY: number;
                    }[];
                };
            }).wxElementRegistry;
            const items = reg?.findAllRendered?.({ elementType: 'menuitem' }) ?? [];
            const hit = items.find(
                (i) => i.subType !== 'menubar' && /Preferences/i.test(i.label ?? ''),
            );
            return hit ? { x: hit.centerX, y: hit.centerY, label: hit.label } : null;
        });
        expect(popupItem, 'the Preferences… popup menu item should be rendered').not.toBeNull();
        console.log(`[xface] clicking popup item ${JSON.stringify(popupItem)}`);
        await page.mouse.click(popupItem!.x, popupItem!.y);
        // The dialog builds pages for every registered kiface — wait for the lazy PCB
        // OnKifaceStart to contribute its "PCB Editor" page (deterministic, replaces a
        // fixed 4000ms; this is also the cross-face assertion's precondition).
        await waitUntil(
            page,
            () => {
                const reg = window.wxElementRegistry;
                if (!reg) return false;
                const a = reg.findAll({ visible: true }).map((e) => e.label ?? '');
                const b = (reg.findAllRendered?.({}) ?? []).map((e) => (e as { label?: string }).label ?? '');
                return [...a, ...b].includes('PCB Editor');
            },
            'PCB Editor preference page (lazy PCB kiface) present',
            { timeout: 30000 },
        );

        await stableShot(page, 'xface-preferences.png');

        // A dialog should be up.
        const dialogCount = await page.evaluate(() => {
            const reg = (window as unknown as {
                wxElementRegistry?: { findAll(f: object): { typeName: string; label?: string }[] };
            }).wxElementRegistry;
            if (!reg) return -1;
            return reg.findAll({ visible: true })
                .filter((el) => /^wxDialog/.test(el.typeName)).length;
        });
        expect(dialogCount, 'the Preferences dialog should be open').toBeGreaterThan(0);

        // Best-effort: dump registry labels and look for PCB-side page names.
        const labels = await page.evaluate(() => {
            const reg = (window as unknown as {
                wxElementRegistry?: {
                    findAll(f: object): { label?: string }[];
                    findAllRendered?(f: object): { label?: string; text?: string }[];
                };
            }).wxElementRegistry;
            if (!reg) return [] as string[];
            const a = reg.findAll({ visible: true }).map((e) => e.label ?? '');
            const b = (reg.findAllRendered?.({}) ?? []).map((e) => e.label ?? e.text ?? '');
            return [...a, ...b].filter(Boolean);
        });
        console.log(`[xface] registry labels: ${JSON.stringify(labels.slice(0, 120))}`);

        // THE cross-face assertion: the PCB engine's preference pages exist in a
        // schematic session. On a single-kiface eeschema image KiFACE(FACE_PCB)
        // returns nullptr and these tree entries are absent (kiway.cpp's WASM
        // single-kiface comment); in the merged image the PCB kiface lazy-starts
        // and contributes its pages.
        expect(labels, 'PCB Editor preference page should exist in a SCH session')
            .toContain('PCB Editor');
        expect(labels, 'Footprint Editor preference page should exist in a SCH session')
            .toContain('Footprint Editor');

        // The decisive assertion: the cross-face start didn't kill the runtime.
        const aborted = [...consoleLines, ...testLogger.consoleLogs, ...testLogger.errors]
            .filter((l) => l.includes('Aborted(') || l.includes('Cannot register public name'));
        expect(aborted, `no WASM abort during cross-face preferences:\n${aborted.join('\n')}`).toEqual([]);
    });
});
