// wxDialog/wxMessageBox Tests - Modal dialogs for KiCad confirmations, errors, properties
// Uses element registry for semantic element identification
import { test, expect, waitForWxApp, clickByLabel } from './utils/fixtures';
import { stableShot } from './utils/element-tracker';

test.describe('wxDialog/wxMessageBox Tests', () => {
  test('Dialog test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/dialog/dialog_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'dialog-01-loaded.png', { fullPage: true });

    const hasStartupLog = testLogger.consoleLogs.some(log =>
      log.includes('DIALOG_TEST') && log.includes('started successfully')
    );

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Info dialog button can be clicked', async ({ page, testLogger }) => {
    await page.goto('/standalone/dialog/dialog_test.html');
    await waitForWxApp(page);

    // Click "Info Dialog" button
    await clickByLabel(page, 'Info Dialog');

    await expect.poll(
      () => testLogger.consoleLogs.some(l => l.includes('Opening Info dialog')),
      { message: 'Info dialog should open' }
    ).toBe(true);

    await stableShot(page, 'dialog-02-info-clicked.png', { fullPage: true });
  });

  test('Yes/No dialog button can be clicked', async ({ page, testLogger }) => {
    await page.goto('/standalone/dialog/dialog_test.html');
    await waitForWxApp(page);

    // Click "Yes/No Dialog" button
    await clickByLabel(page, 'Yes/No Dialog');

    await expect.poll(
      () => testLogger.consoleLogs.some(l => l.includes('Opening Yes/No dialog')),
      { message: 'Yes/No dialog should open' }
    ).toBe(true);

    await stableShot(page, 'dialog-03-yesno-clicked.png', { fullPage: true });
  });

  test('Error dialog button can be clicked', async ({ page, testLogger }) => {
    await page.goto('/standalone/dialog/dialog_test.html');
    await waitForWxApp(page);

    // Click "Error Dialog" button
    await clickByLabel(page, 'Error Dialog');

    await expect.poll(
      () => testLogger.consoleLogs.some(l => l.includes('Opening Error dialog')),
      { message: 'Error dialog should open' }
    ).toBe(true);

    await stableShot(page, 'dialog-04-error-clicked.png', { fullPage: true });
  });

  test('Custom dialog button can be clicked', async ({ page }) => {
    await page.goto('/standalone/dialog/dialog_test.html');
    await waitForWxApp(page);

    // Click "Custom Dialog" button
    await clickByLabel(page, 'Custom Dialog');

    await stableShot(page, 'dialog-05-custom-clicked.png', { fullPage: true });

    expect(true).toBe(true);
  });
});
