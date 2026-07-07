import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { clickTreeItem, findAllTreeItems, waitUntil, stableShot } from '../e2e/utils/element-tracker';

/**
 * PCB Calculator WASM E2E Tests
 *
 * The calculator is a wxFrame containing a wxTreebook with ~14 calculator
 * panels grouped under four section pages. There's no GAL canvas, no
 * toolbars-as-tested, and no setup wizard for the calculator itself.
 *
 * calculator.html seeds a default KiCad config in preRun (like eeschema.html /
 * pl_editor.html), so KiCad's first-run setup wizard never opens — the frame
 * comes straight up and we wait deterministically for its panels to register.
 * No wizard click-through, no fixed sleeps.
 *
 * Panel labels are sourced from pcb_calculator_frame.cpp:170-192 (kicad fork).
 */

async function waitForCalculatorReady(page: Page): Promise<void> {
    await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });
    // "Calculate" is a unique button on the default Regulator panel — a reliable
    // witness that the calculator frame is live and its panels have registered.
    await waitUntil(
        page,
        () => {
            const r = window.wxElementRegistry;
            return !!r && r.findByLabel('Calculate', {}).length > 0;
        },
        'calculator Regulator panel live (Calculate button registered)',
        { timeout: 90000 }
    );
}

async function getRegistryLabels(page: Page): Promise<string[]> {
    return await page.evaluate(() => {
        const registry = window.wxElementRegistry;
        if (!registry) return [];
        return registry.findAll({})
            .map((el) => (el && el.label ? String(el.label) : ''))
            .filter((l: string) => l.length > 0);
    });
}

test.describe('PCB Calculator WASM', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/kicad/calculator.html');
    });

    test('loads calculator frame', async ({ page, testLogger }) => {
        void testLogger;
        await waitForCalculatorReady(page);

        const labels = await getRegistryLabels(page);
        const hasRegulatorPanel = labels.some(l => l === 'Calculate');
        expect(hasRegulatorPanel, `expected the calculator's default Regulator panel to be live (Calculate button registered). Got: ${JSON.stringify(labels.slice(0, 30))}`).toBe(true);

        await stableShot(page, 'calculator-loaded.png');
    });

    test('treebook lists expected panels', async ({ page, testLogger }) => {
        void testLogger;
        await waitForCalculatorReady(page);

        const treeItems = await findAllTreeItems(page);
        const treeLabels = treeItems.map(i => i.label).filter((l): l is string => typeof l === 'string');

        const requiredSubset = [
            'Regulators',
            'Resistor Calculator',
            'Via Size',
            'Track Width',
            'Color Code',
            'RF Attenuators',
            'Transmission Lines',
        ];
        const missing = requiredSubset.filter(req => !treeLabels.includes(req));
        expect(missing, `treebook is missing expected panels: ${JSON.stringify(missing)} (tree items: ${JSON.stringify(treeLabels)})`).toEqual([]);
    });

    test('switch to Color Code panel', async ({ page, testLogger }) => {
        void testLogger;
        await waitForCalculatorReady(page);

        await stableShot(page, 'calculator-before-switch.png');

        const clicked = await clickTreeItem(page, 'Color Code');
        expect(clicked, 'expected to find and click the Color Code tree item').toBe(true);

        // The Color Code panel exposes a unique "Tolerance" label the Regulator
        // panel does not — wait for it as proof the panel swapped in (replaces
        // waitForTimeout(800)).
        await waitUntil(
            page,
            () => {
                const r = window.wxElementRegistry;
                if (!r) return false;
                return r.findAll({}).some((el) => /Tolerance/i.test(el.label || ''));
            },
            'Color Code panel active (Tolerance label present)',
        );

        const labelsAfter = await getRegistryLabels(page);
        const onColorCodePanel = labelsAfter.some(l => /Tolerance/i.test(l));
        expect(onColorCodePanel, `expected Color Code panel to be active after click; labels: ${JSON.stringify(labelsAfter.slice(0, 40))}`).toBe(true);

        await stableShot(page, 'calculator-color-code.png');
    });
});
