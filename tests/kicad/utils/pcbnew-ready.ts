import type { Page } from '@playwright/test';
import { expect } from '../fixtures';
import { clickByLabel } from '../../e2e/utils/element-tracker';

/**
 * Shared pcbnew bring-up helpers. Mirrors the bring-up sequence proven in
 * load-pcb.spec.ts so multiple kicad specs (load-pcb, 3d-viewer, ...) can wait
 * for a ready pcbnew the same way without duplicating the timing logic.
 */

/**
 * KiCad first-run setup wizard. Click "Next >" until it's gone, then "Finish".
 * If no wizard is present, both clicks no-op immediately.
 */
export async function dismissWizardIfPresent(page: Page): Promise<void> {
    for (let i = 0; i < 12; i++) {
        const advanced = await clickByLabel(page, 'Next >');
        if (!advanced) break;
        await page.waitForTimeout(400);
    }
    await clickByLabel(page, 'Finish');
    await page.waitForTimeout(800);
}

/**
 * Wait for pcbnew to boot: 2D canvas visible, element registry populated, the
 * first-run wizard dismissed, and the main PcbFrame registered & visible.
 */
export async function waitForPcbnew(page: Page): Promise<void> {
    await expect(page.locator('#canvas')).toBeVisible({ timeout: 90000 });
    await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 90000 });
    // Registry object ≠ app booted: wait for real UI entries (wizard or main
    // frame) before dismissing — CI boots slower and the dismiss loop is bounded.
    await page.waitForFunction(() => {
        const registry = window.wxElementRegistry;
        return !!registry && registry.findAll({}).length > 0;
    }, null, { timeout: 150000 });
    await page.waitForTimeout(2500);
    await dismissWizardIfPresent(page);
    await page.waitForFunction(() => {
        const registry = window.wxElementRegistry;
        if (!registry) return false;
        return registry.findAll({ visible: true })
            .some((el) => el.name === 'PcbFrame');
    }, null, { timeout: 90000 });
    await page.waitForTimeout(1500);
}
