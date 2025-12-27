import { test, expect } from './utils/fixtures';
import { getCanvasBox } from './utils/test-utils';

// Button positions found via button-finder
const BUTTONS = {
  triggerError: { x: 24, y: 138 },
  triggerMultiple: { x: 24, y: 226 },
  mixedLevels: { x: 24, y: 314 },
  flushLog: { x: 24, y: 398 },
  clearLog: { x: 216, y: 398 }
};

test.describe('wxLogError Dialog Tests', () => {

  test('LogError test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/logerror/logerror_test.html');

    // Wait for app to initialize
    await page.waitForFunction(() => {
      return (document.querySelector('#canvas') as HTMLElement)?.style.display === 'block';
    }, { timeout: 30000 });

    // Verify canvas is visible
    const canvas = page.locator('#canvas');
    await expect(canvas).toBeVisible();

    // Take screenshot of initial state
    await page.screenshot({
      path: 'test-results/logerror-01-initial.png',
      fullPage: true
    });

    // Check for successful initialization log
    const initLog = testLogger.consoleLogs.find(l =>
      l.includes('[LOGERROR_TEST]')
    );
    expect(initLog).toBeTruthy();
  });

  test('Trigger single error shows dialog', async ({ page, testLogger }) => {
    await page.goto('/standalone/logerror/logerror_test.html');

    await page.waitForFunction(() => {
      return (document.querySelector('#canvas') as HTMLElement)?.style.display === 'block';
    }, { timeout: 30000 });

    // Wait for UI to be ready
    await page.waitForTimeout(500);

    const box = await getCanvasBox(page);

    // Take screenshot before clicking
    await page.screenshot({
      path: 'test-results/logerror-02-before-error.png',
      fullPage: true
    });

    // Click "Trigger Error" button
    await page.mouse.click(box.x + BUTTONS.triggerError.x, box.y + BUTTONS.triggerError.y);
    await page.waitForTimeout(500);

    // Click "Flush Log" to show the dialog
    await page.mouse.click(box.x + BUTTONS.flushLog.x, box.y + BUTTONS.flushLog.y);
    await page.waitForTimeout(1000);

    // Take screenshot showing the error dialog
    await page.screenshot({
      path: 'test-results/logerror-03-single-error-dialog.png',
      fullPage: true
    });

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

    await page.waitForFunction(() => {
      return (document.querySelector('#canvas') as HTMLElement)?.style.display === 'block';
    }, { timeout: 30000 });

    // Wait for UI to be ready
    await page.waitForTimeout(500);

    const box = await getCanvasBox(page);

    // Click "Trigger Multiple" button
    await page.mouse.click(box.x + BUTTONS.triggerMultiple.x, box.y + BUTTONS.triggerMultiple.y);
    await page.waitForTimeout(500);

    // Click "Flush Log" to show the dialog with Details dropdown
    await page.mouse.click(box.x + BUTTONS.flushLog.x, box.y + BUTTONS.flushLog.y);
    await page.waitForTimeout(1000);

    // Take screenshot showing the dialog with Details
    await page.screenshot({
      path: 'test-results/logerror-04-multiple-errors-dialog.png',
      fullPage: true
    });

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

    await page.waitForFunction(() => {
      return (document.querySelector('#canvas') as HTMLElement)?.style.display === 'block';
    }, { timeout: 30000 });

    await page.waitForTimeout(500);

    const box = await getCanvasBox(page);

    // Click "Mixed Levels" button to log error, warning, and message
    await page.mouse.click(box.x + BUTTONS.mixedLevels.x, box.y + BUTTONS.mixedLevels.y);
    await page.waitForTimeout(500);

    // Take screenshot
    await page.screenshot({
      path: 'test-results/logerror-05-mixed-levels.png',
      fullPage: true
    });

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
