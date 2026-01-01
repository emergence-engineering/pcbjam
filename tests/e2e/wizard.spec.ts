// wxWizard Tests - Footprint Wizard simulation
import { test, expect, tryLoadApp } from './utils/fixtures';
import { clickByLabel } from './utils/element-tracker';

test.describe('wxWizard Tests', () => {

  test('Wizard test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/wizard/wizard_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/wizard-01-loaded.png', fullPage: true });

    expect(loaded, 'wxWizard app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Wizard dialog can be launched', async ({ page, testLogger }) => {
    await page.goto('/standalone/wizard/wizard_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Click Launch button using element registry
    const clicked = await clickByLabel(page, 'Launch Footprint Wizard');
    expect(clicked, 'Launch Wizard button should be found and clicked').toBe(true);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/wizard-02-launch.png', fullPage: true });
  });

  test('Wizard can navigate to next page', async ({ page, testLogger }) => {
    await page.goto('/standalone/wizard/wizard_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Launch wizard using element registry
    const launchClicked = await clickByLabel(page, 'Launch Footprint Wizard');
    expect(launchClicked, 'Launch Wizard button should be found').toBe(true);
    await page.waitForTimeout(500);

    // Click Next using element registry
    const nextClicked = await clickByLabel(page, 'Next');
    expect(nextClicked, 'Next button should be found and clicked').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/wizard-03-next-page.png', fullPage: true });
  });

  test('Wizard can navigate back', async ({ page, testLogger }) => {
    await page.goto('/standalone/wizard/wizard_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Launch wizard using element registry
    const launchClicked = await clickByLabel(page, 'Launch Footprint Wizard');
    expect(launchClicked, 'Launch Wizard button should be found').toBe(true);
    await page.waitForTimeout(500);

    // Click Next using element registry
    const nextClicked = await clickByLabel(page, 'Next');
    expect(nextClicked, 'Next button should be found').toBe(true);
    await page.waitForTimeout(200);

    // Click Back using element registry
    const backClicked = await clickByLabel(page, 'Back');
    expect(backClicked, 'Back button should be found and clicked').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/wizard-04-back-page.png', fullPage: true });
  });

  test('Wizard can be cancelled', async ({ page, testLogger }) => {
    await page.goto('/standalone/wizard/wizard_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.waitForTimeout(300);

    // Launch wizard using element registry
    const launchClicked = await clickByLabel(page, 'Launch Footprint Wizard');
    expect(launchClicked, 'Launch Wizard button should be found').toBe(true);
    await page.waitForTimeout(500);

    // Click Cancel using element registry
    const cancelClicked = await clickByLabel(page, 'Cancel');
    expect(cancelClicked, 'Cancel button should be found and clicked').toBe(true);
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'test-results/wizard-05-cancel.png', fullPage: true });
  });
});
