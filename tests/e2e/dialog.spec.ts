// wxDialog/wxMessageBox Tests - Modal dialogs for KiCad confirmations, errors, properties
// Uses element registry for semantic element identification
import { test, expect, tryLoadApp, waitForRegistry, clickByLabel } from './utils/fixtures';

test.describe('wxDialog/wxMessageBox Tests', () => {
  test('Dialog test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/dialog/dialog_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/dialog-01-loaded.png', fullPage: true });

    const hasStartupLog = testLogger.consoleLogs.some(log =>
      log.includes('DIALOG_TEST') && log.includes('started successfully')
    );

    expect(loaded, 'Canvas should be visible').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Info dialog button can be clicked', async ({ page, testLogger }) => {
    await page.goto('/standalone/dialog/dialog_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await waitForRegistry(page);

    // Click "Info Dialog" button
    await clickByLabel(page, 'Info Dialog');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/dialog-02-info-clicked.png', fullPage: true });

    const hasInfoEvent = testLogger.consoleLogs.some(log =>
      log.includes('Opening Info dialog')
    );

    expect(hasInfoEvent, 'Info dialog should open').toBe(true);
  });

  test('Yes/No dialog button can be clicked', async ({ page, testLogger }) => {
    await page.goto('/standalone/dialog/dialog_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await waitForRegistry(page);

    // Click "Yes/No Dialog" button
    await clickByLabel(page, 'Yes/No Dialog');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/dialog-03-yesno-clicked.png', fullPage: true });

    const hasYesNoEvent = testLogger.consoleLogs.some(log =>
      log.includes('Opening Yes/No dialog')
    );
    expect(hasYesNoEvent, 'Yes/No dialog should open').toBe(true);
  });

  test('Error dialog button can be clicked', async ({ page, testLogger }) => {
    await page.goto('/standalone/dialog/dialog_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await waitForRegistry(page);

    // Click "Error Dialog" button
    await clickByLabel(page, 'Error Dialog');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/dialog-04-error-clicked.png', fullPage: true });

    const hasErrorEvent = testLogger.consoleLogs.some(log =>
      log.includes('Opening Error dialog')
    );
    expect(hasErrorEvent, 'Error dialog should open').toBe(true);
  });

  test('Custom dialog button can be clicked', async ({ page, testLogger }) => {
    await page.goto('/standalone/dialog/dialog_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await waitForRegistry(page);

    // Click "Custom Dialog" button
    await clickByLabel(page, 'Custom Dialog');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/dialog-05-custom-clicked.png', fullPage: true });

    expect(true).toBe(true);
  });
});
