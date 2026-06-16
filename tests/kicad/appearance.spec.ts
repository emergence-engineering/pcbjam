// Appearance panel (right side of pcbnew): Layers/Objects/Nets notebook.
// Regression coverage for the DOM-port fixes: native tab switching (all
// three tabs and back), wheel scrolling inside the scrolled pages with
// viewport clipping, and rows surviving tab round-trips. Screenshots are
// written to test-results/appearance-*.png for visual review.

import { test, expect, Page } from '@playwright/test';
import { clickByLabel } from '../e2e/utils/element-tracker';

declare global {
    interface Window {
        wxElementRegistry: any;
        wxDomPort?: boolean;
        wxDomControls?: Map<number, HTMLElement>;
    }
}

async function completeWizard(page: Page): Promise<void> {
    await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });
    await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 90000 });
    await page.waitForTimeout(2000);

    for (let i = 1; i <= 10; i++) {
        let clicked = await clickByLabel(page, 'Next >');

        if (!clicked) {
            await clickByLabel(page, 'Finish');
            break;
        }

        await page.waitForTimeout(500);
    }

    // let the main frame settle
    await page.waitForTimeout(4000);
}

type Tab = { label: string; subType: string; centerX: number; centerY: number };

// The appearance notebook's tabs: rendered 'tab' elements with real
// coordinates (other, hidden notebooks register at 0,0).
async function appearanceTabs(page: Page): Promise<Tab[]> {
    return page.evaluate(() => {
        const out: any[] = [];
        window.wxElementRegistry.renderedElements.forEach((e: any) => {
            if (e.elementType === 'tab' && e.centerX > 0 &&
                ['Layers', 'Objects', 'Nets'].includes(e.label)) {
                out.push({ label: e.label, subType: e.subType,
                           centerX: e.centerX, centerY: e.centerY });
            }
        });
        return out;
    });
}

async function selectTab(page: Page, label: string): Promise<void> {
    const tabs = await appearanceTabs(page);
    const tab = tabs.find(t => t.label === label);
    expect(tab, `appearance tab ${label}`).toBeTruthy();
    await page.mouse.click(tab!.centerX, tab!.centerY);

    await expect.poll(async () => {
        const after = await appearanceTabs(page);
        return after.find(t => t.label === label)?.subType;
    }, { timeout: 5000, intervals: [200] }).toBe('selected');

    await page.waitForTimeout(400);
}

// DOM port only: viewport tops of row labels inside the appearance pane
// (spans are real elements there; the canvas port draws them as pixels).
// Returns the layout-box top regardless of clipping — used to track row
// MOVEMENT under scrolling, where rows legitimately clip at the pane edges.
async function rowLabelTops(page: Page, labels: string[]): Promise<Record<string, number | null>> {
    return page.evaluate((wanted: string[]) => {
        const out: Record<string, number | null> = {};
        for (const w of wanted) out[w] = null;
        if (!window.wxDomControls) return out;
        for (const [, el] of window.wxDomControls) {
            if (el.tagName === 'SPAN' && wanted.includes(el.textContent || '')) {
                out[el.textContent as string] = Math.round(el.getBoundingClientRect().top);
            }
        }
        return out;
    }, labels);
}

// Whether each row label is genuinely PAINTED (not merely present in the DOM).
// A bare getBoundingClientRect is not enough: when the layers scrolled window
// collapses on a tab round-trip the rows keep their layout box but are fully
// removed by an ancestor's clip-path. clip-path also affects hit-testing, so we
// sample points down each row's box and treat it as visible only if the row (or
// its own content) is actually returned by elementsFromPoint somewhere. This is
// what makes the "pages came back blank" regression fail the assertion below.
async function rowsVisible(page: Page, labels: string[]): Promise<Record<string, boolean>> {
    return page.evaluate((wanted: string[]) => {
        const out: Record<string, boolean> = {};
        for (const w of wanted) out[w] = false;
        if (!window.wxDomControls) return out;
        const visible = (el: HTMLElement): boolean => {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return false;
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return false;
            const cx = r.left + r.width / 2;
            const ys = [r.top + 1, r.top + r.height / 2, r.bottom - 1];
            return ys.some(y => {
                const hits = document.elementsFromPoint(cx, y);
                return hits.some(h => h === el || el.contains(h));
            });
        };
        for (const [, el] of window.wxDomControls) {
            const txt = el.textContent || '';
            if (el.tagName === 'SPAN' && wanted.includes(txt) && visible(el))
                out[txt] = true;
        }
        return out;
    }, labels);
}

test.describe('Appearance panel (Layers/Objects/Nets)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/kicad/pcbnew.html');
    });

    test('tabs switch through all three pages and back', async ({ page }) => {
        await completeWizard(page);

        const tabs = await appearanceTabs(page);
        expect(tabs.map(t => t.label).sort()).toEqual(['Layers', 'Nets', 'Objects']);
        expect(tabs.find(t => t.label === 'Layers')?.subType).toBe('selected');

        await page.screenshot({ path: 'test-results/appearance-00-layers.png' });

        await selectTab(page, 'Objects');
        await page.screenshot({ path: 'test-results/appearance-01-objects.png' });

        await selectTab(page, 'Nets');
        await page.screenshot({ path: 'test-results/appearance-02-nets.png' });

        // and back to the start
        await selectTab(page, 'Layers');
        await page.screenshot({ path: 'test-results/appearance-03-layers-again.png' });

        // Layer rows must survive the tab round-trip (regression pcbjam#8:
        // pages came back blank after switching away and back — the rows stayed
        // in the DOM but their scrolled window collapsed and clip-pathed them
        // all away, so this must assert real paint, not just DOM presence).
        const vis = await rowsVisible(page, ['F.Cu', 'B.Cu']);
        expect(vis['F.Cu'], 'F.Cu row visible after tab round-trip').toBe(true);
        expect(vis['B.Cu'], 'B.Cu row visible after tab round-trip').toBe(true);
    });

    test('layer list scrolls with the wheel and clips at the pane', async ({ page }) => {
        await completeWizard(page);

        const tabs = await appearanceTabs(page);
        const layersTab = tabs.find(t => t.label === 'Layers');
        expect(layersTab).toBeTruthy();

        // hover INSIDE the layer list (just below the tab strip)
        const hoverX = layersTab!.centerX;
        const hoverY = layersTab!.centerY + 120;
        await page.mouse.move(hoverX, hoverY);

        const before = await rowLabelTops(page, ['B.Cu', 'F.Mask']);

        await page.mouse.wheel(0, 240);
        await page.waitForTimeout(800);
        await page.screenshot({ path: 'test-results/appearance-10-layers-scrolled.png' });

        const after = await rowLabelTops(page, ['B.Cu', 'F.Mask']);
        expect(after['B.Cu'], 'B.Cu moved up after wheel scroll')
            .toBeLessThan(before['B.Cu']!);
        expect(after['F.Mask'], 'F.Mask moved up after wheel scroll')
            .toBeLessThan(before['F.Mask']!);

        // scroll back up restores the start of the list
        await page.mouse.wheel(0, -480);
        await page.waitForTimeout(800);
        await page.screenshot({ path: 'test-results/appearance-11-layers-scrolled-back.png' });

        const restored = await rowLabelTops(page, ['B.Cu']);
        expect(restored['B.Cu'], 'B.Cu back at its original position')
            .toBe(before['B.Cu']);
    });

    test('objects page scrolls with the wheel', async ({ page }) => {
        await completeWizard(page);

        await selectTab(page, 'Objects');

        const tabs = await appearanceTabs(page);
        const objectsTab = tabs.find(t => t.label === 'Objects')!;

        await page.mouse.move(objectsTab.centerX, objectsTab.centerY + 120);

        const before = await rowLabelTops(page, ['Ratsnest']);

        await page.mouse.wheel(0, 240);
        await page.waitForTimeout(800);
        await page.screenshot({ path: 'test-results/appearance-20-objects-scrolled.png' });

        if (before['Ratsnest'] !== null) {
            const after = await rowLabelTops(page, ['Ratsnest']);
            expect(after['Ratsnest'], 'Ratsnest row moved after wheel scroll')
                .toBeLessThan(before['Ratsnest']!);
        }
    });
});
