// wxLogError Dialog Tests - Tests wxLogDialog error handling for KiCad
// Uses element registry for semantic element identification
import { test, expect, waitForWxApp, clickByLabel } from './utils/fixtures';
import { stableShot } from './utils/element-tracker';

test.describe('wxLogError Dialog Tests', () => {

  test('LogError test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/logerror/logerror_test.html');

    // Wait for app to initialize (canvas visible + registry populated, loud)
    await waitForWxApp(page);

    // Verify canvas is visible
    const canvas = page.locator('#canvas');
    await expect(canvas).toBeVisible();

    // Take screenshot of initial state
    await stableShot(page, 'logerror-01-initial.png', { fullPage: true });

    // Check for successful initialization log
    const initLog = testLogger.consoleLogs.find(l =>
      l.includes('[LOGERROR_TEST]')
    );
    expect(initLog).toBeTruthy();
  });

  test('Trigger single error shows dialog', async ({ page, testLogger }) => {
    await page.goto('/standalone/logerror/logerror_test.html');

    await waitForWxApp(page);

    // Take screenshot before clicking
    await stableShot(page, 'logerror-02-before-error.png', { fullPage: true });

    // Click "Trigger Error" button
    await clickByLabel(page, 'Trigger Error');

    // Wait deterministically for the wxLogError console event
    await expect.poll(
      () => testLogger.consoleLogs.some(l =>
        l.includes('[wxLog][ERROR]') && l.includes('Error loading editor')
      ),
      { message: 'expected [wxLog][ERROR] "Error loading editor" after Trigger Error' }
    ).toBe(true);

    // Click "Flush Log (Show Dialog)" to show the dialog
    await clickByLabel(page, 'Flush Log (Show Dialog)');

    // Take screenshot showing the error dialog (stableShot stabilizes)
    await stableShot(page, 'logerror-03-single-error-dialog.png', { fullPage: true });

    // Check console for wxLog messages
    const wxLogMessages = testLogger.consoleLogs.filter(l =>
      l.includes('[wxLog]')
    );
    console.log('wxLog messages:', wxLogMessages);

    // Verify wxLogError message appeared in console
    const errorLog = testLogger.consoleLogs.find(l =>
      l.includes('[wxLog][ERROR]') && l.includes('Error loading editor')
    );
    expect(errorLog).toBeTruthy();
  });

  test('Trigger multiple errors shows Details dropdown', async ({ page, testLogger }) => {
    await page.goto('/standalone/logerror/logerror_test.html');

    await waitForWxApp(page);

    // Click "Trigger Multiple" button
    await clickByLabel(page, 'Trigger Multiple');

    // Wait deterministically for the multiple wxLogError console events
    await expect.poll(
      () => testLogger.consoleLogs.filter(l => l.includes('[wxLog][ERROR]')).length >= 3,
      { message: 'expected at least 3 [wxLog][ERROR] messages after Trigger Multiple' }
    ).toBe(true);

    // Click "Flush Log (Show Dialog)" to show the dialog with Details dropdown
    await clickByLabel(page, 'Flush Log (Show Dialog)');

    // Take screenshot showing the dialog with Details (stableShot stabilizes)
    await stableShot(page, 'logerror-04-multiple-errors-dialog.png', { fullPage: true });

    // Verify multiple wxLogError messages appeared in console
    const errorLogs = testLogger.consoleLogs.filter(l =>
      l.includes('[wxLog][ERROR]')
    );
    console.log('Error logs:', errorLogs);

    // Should have at least 3 error messages
    expect(errorLogs.length).toBeGreaterThanOrEqual(3);
  });

  test('wxLog console logging works for all levels', async ({ page, testLogger }) => {
    await page.goto('/standalone/logerror/logerror_test.html');

    await waitForWxApp(page);

    // Click "Mixed Levels" button to log error, warning, and message
    await clickByLabel(page, 'Mixed Levels');

    // Wait deterministically for all three log-level console events
    await expect.poll(
      () => {
        const logs = testLogger.consoleLogs;
        return logs.some(l => l.includes('[wxLog][ERROR]') && l.includes('error message'))
          && logs.some(l => l.includes('[wxLog][WARNING]') && l.includes('warning message'))
          && logs.some(l => l.includes('[wxLog][INFO]') && l.includes('info message'));
      },
      { message: 'expected [wxLog] ERROR/WARNING/INFO messages after Mixed Levels' }
    ).toBe(true);

    // Take screenshot
    await stableShot(page, 'logerror-05-mixed-levels.png', { fullPage: true });

    // Verify each log level appeared in console
    const errorLog = testLogger.consoleLogs.find(l =>
      l.includes('[wxLog][ERROR]') && l.includes('error message')
    );
    const warningLog = testLogger.consoleLogs.find(l =>
      l.includes('[wxLog][WARNING]') && l.includes('warning message')
    );
    const infoLog = testLogger.consoleLogs.find(l =>
      l.includes('[wxLog][INFO]') && l.includes('info message')
    );

    console.log('Error log:', errorLog);
    console.log('Warning log:', warningLog);
    console.log('Info log:', infoLog);

    expect(errorLog).toBeTruthy();
    expect(warningLog).toBeTruthy();
    expect(infoLog).toBeTruthy();
  });

});
