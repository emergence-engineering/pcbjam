import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { clickByLabel, clickTreeItem, findAllTreeItems } from '../e2e/utils/element-tracker';

/**
 * PCB Calculator WASM E2E Tests
 *
 * The calculator is a wxFrame containing a wxTreebook with ~14 calculator
 * panels grouped under four section pages. There's no GAL canvas, no
 * toolbars-as-tested, and no setup wizard for the calculator itself.
 *
 * However, KiCad's first-run setup wizard pops up before *any* app's frame
 * (same wizard pcbnew sees) because Emscripten's MEMFS starts empty each
 * page load and KiCad finds no config. We click through it the same way
 * pcbnew.spec.ts's completeWizard() does, then verify:
 *   1. The calculator frame loads and registers its panels.
 *   2. The treebook contains the panel labels we expect.
 *   3. Clicking a leaf panel ("Color Code") switches the active page.
 *
 * Panel labels are sourced from pcb_calculator_frame.cpp:170-192 (kicad fork).
 */

async function waitForRegistry(page: Page): Promise<void> {
    await page.waitForFunction(() => !!(window as any).wxElementRegistry, null, { timeout: 90000 });
    // Give the C++ side a moment to register every panel after the frame
    // first appears — the treebook is populated synchronously in the frame
    // ctor, but wxElementRegistry registrations are flushed on idle.
    await page.waitForTimeout(2000);
}

/**
 * Click through KiCad's first-run setup wizard. Mirrors the intent of
 * tests/kicad/pcbnew.spec.ts's completeWizard() but waits actively for each
 * "Next >" / "Finish" button to appear in wxElementRegistry before clicking
 * — the calculator boots quickly enough that the wizard buttons can lag
 * behind by a second or two, and a fixed sleep proved flaky.
 */
async function waitForLabel(page: Page, label: string, timeoutMs: number): Promise<boolean> {
    try {
        await page.waitForFunction(
            (l) => {
                const r = (window as any).wxElementRegistry;
                return !!(r && r.findByLabel && r.findByLabel(l, {}).length > 0);
            },
            label,
            { timeout: timeoutMs }
        );
        return true;
    } catch {
        return false;
    }
}

async function completeFirstRunWizard(page: Page): Promise<void> {
    // The canvas becomes visible only after Module.onRuntimeInitialized fires,
    // which is a reliable witness that the WASM has booted.
    await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });
    await waitForRegistry(page);

    for (let i = 1; i <= 12; i++) {
        const haveNext = await waitForLabel(page, 'Next >', 15000);
        if (haveNext) {
            const clickedNext = await clickByLabel(page, 'Next >');
            if (clickedNext) {
                await page.waitForTimeout(400);
                continue;
            }
        }
        const haveFinish = await waitForLabel(page, 'Finish', 5000);
        if (haveFinish) {
            await clickByLabel(page, 'Finish');
            await page.waitForTimeout(400);
        }
        break;
    }

    // Allow the wizard to dismiss and the calculator frame to register.
    await page.waitForTimeout(2500);
}

async function getRegistryLabels(page: Page): Promise<string[]> {
    return await page.evaluate(() => {
        const registry = (window as any).wxElementRegistry;
        if (!registry || !registry.findAll) return [];
        const all = registry.findAll({});
        return all
            .map((el: any) => (el && el.label ? String(el.label) : ''))
            .filter((l: string) => l.length > 0);
    });
}

test.describe('PCB Calculator WASM', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/kicad/calculator.html');
    });

    test('loads calculator frame', async ({ page, testLogger }) => {
        void testLogger;
        await completeFirstRunWizard(page);

        // The default panel (Regulator) renders its controls into the registry
        // as soon as the frame is up. "Calculate" is a unique button label on
        // panel_regulator and a reliable witness that the calculator is live.
        const labels = await getRegistryLabels(page);
        const hasRegulatorPanel = labels.some(l => l === 'Calculate');
        expect(hasRegulatorPanel, `expected the calculator's default Regulator panel to be live (Calculate button registered). Got: ${JSON.stringify(labels.slice(0, 30))}`).toBe(true);

        await page.screenshot({ path: 'test-results/calculator-loaded.png', scale: 'device' });
    });

    test('treebook lists expected panels', async ({ page, testLogger }) => {
        void testLogger;
        await completeFirstRunWizard(page);

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
        await completeFirstRunWizard(page);

        await page.screenshot({ path: 'test-results/calculator-before-switch.png', scale: 'device' });

        const clicked = await clickTreeItem(page, 'Color Code');
        expect(clicked, 'expected to find and click the Color Code tree item').toBe(true);

        // Allow the panel to swap in. The Color Code panel exposes a unique
        // "Tolerance" label that the Regulator panel does not — use it as a
        // proof-of-switch.
        await page.waitForTimeout(800);
        const labelsAfter = await getRegistryLabels(page);
        const onColorCodePanel = labelsAfter.some(l => /Tolerance/i.test(l));
        expect(onColorCodePanel, `expected Color Code panel to be active after click; labels: ${JSON.stringify(labelsAfter.slice(0, 40))}`).toBe(true);

        await page.screenshot({ path: 'test-results/calculator-color-code.png', scale: 'device' });
    });
});
